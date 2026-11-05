import { describe, it, expect } from 'vitest';
import { canonicalRedirect } from '@/lib/canonicalHost';

const loc = (href) => {
  const u = new URL(href);
  return { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash };
};

describe('canonicalRedirect', () => {
  it('o www vai para o domínio principal, com caminho, pesquisa e #', () => {
    expect(canonicalRedirect(loc('https://www.livrariaadventista.com/shop?search=Fé#topo')))
      .toBe('https://livrariaadventista.com/shop?search=F%C3%A9#topo');
  });

  it('leva a sessão que a Google devolve no #', () => {
    expect(canonicalRedirect(loc('https://www.livrariaadventista.com/profile#access_token=abc&refresh_token=def')))
      .toBe('https://livrariaadventista.com/profile#access_token=abc&refresh_token=def');
  });

  it('o endereço de produção do Pages também', () => {
    expect(canonicalRedirect(loc('https://livraria-editora-adventista-ben.pages.dev/')))
      .toBe('https://livrariaadventista.com/');
  });

  it('não mexe no domínio principal, nas pré-visualizações nem no localhost', () => {
    expect(canonicalRedirect(loc('https://livrariaadventista.com/shop'))).toBeNull();
    expect(canonicalRedirect(loc('https://claude-ramo.livraria-editora-adventista-ben.pages.dev/'))).toBeNull();
    expect(canonicalRedirect(loc('https://abc123.livraria-editora-adventista-ben.pages.dev/'))).toBeNull();
    expect(canonicalRedirect(loc('http://localhost:3000/'))).toBeNull();
  });

  it('não rebenta sem endereço', () => {
    expect(canonicalRedirect(null)).toBeNull();
    expect(canonicalRedirect({})).toBeNull();
  });
});
