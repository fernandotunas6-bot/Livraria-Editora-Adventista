import { describe, it, expect } from 'vitest';
import { canonicalRedirect } from '@/lib/canonicalHost';

const loc = (href) => {
  const u = new URL(href);
  return { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash };
};

describe('canonicalRedirect', () => {
  it('o www vai para o domínio principal, com caminho, pesquisa e #', () => {
    expect(canonicalRedirect(loc('https://www.livrariaadventista.ao/shop?search=Fé#topo')))
      .toBe('https://livrariaadventista.ao/shop?search=F%C3%A9#topo');
  });

  it('leva a sessão que a Google devolve no #', () => {
    expect(canonicalRedirect(loc('https://www.livrariaadventista.ao/profile#access_token=abc&refresh_token=def')))
      .toBe('https://livrariaadventista.ao/profile#access_token=abc&refresh_token=def');
  });

  it('o .com antigo, com e sem www, vem para o .ao com o caminho', () => {
    expect(canonicalRedirect(loc('https://livrariaadventista.com/product/abc?c=CPT-0007')))
      .toBe('https://livrariaadventista.ao/product/abc?c=CPT-0007');
    expect(canonicalRedirect(loc('https://www.livrariaadventista.com/shop')))
      .toBe('https://livrariaadventista.ao/shop');
  });

  it('o endereço de produção do Pages também', () => {
    expect(canonicalRedirect(loc('https://livraria-editora-adventista-ben.pages.dev/')))
      .toBe('https://livrariaadventista.ao/');
  });

  it('não mexe no domínio principal, nas pré-visualizações nem no localhost', () => {
    expect(canonicalRedirect(loc('https://livrariaadventista.ao/shop'))).toBeNull();
    expect(canonicalRedirect(loc('https://claude-ramo.livraria-editora-adventista-ben.pages.dev/'))).toBeNull();
    expect(canonicalRedirect(loc('https://abc123.livraria-editora-adventista-ben.pages.dev/'))).toBeNull();
    expect(canonicalRedirect(loc('http://localhost:3000/'))).toBeNull();
  });

  it('não rebenta sem endereço', () => {
    expect(canonicalRedirect(null)).toBeNull();
    expect(canonicalRedirect({})).toBeNull();
  });
});
