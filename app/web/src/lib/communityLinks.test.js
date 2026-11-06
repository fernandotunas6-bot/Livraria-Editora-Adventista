import { describe, expect, it } from 'vitest';
import { MAX_LINKS, cleanLinks, extractLinks, linkHost, linkifySegments, safeHref } from './communityLinks';

describe('safeHref', () => {
  it('aceita só http e https', () => {
    expect(safeHref('https://livrariaadventista.com/shop')).toBe('https://livrariaadventista.com/shop');
    expect(safeHref('http://exemplo.ao')).toBe('http://exemplo.ao/');
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(safeHref('data:text/html,<script>')).toBe('');
    expect(safeHref('ftp://x.ao/a')).toBe('');
    expect(safeHref('/relativo')).toBe('');
  });
  it('recusa credenciais no endereço e endereços demasiado longos', () => {
    expect(safeHref('https://user:pass@exemplo.ao')).toBe('');
    expect(safeHref('https://exemplo.ao/' + 'a'.repeat(600))).toBe('');
    expect(safeHref(42)).toBe('');
  });
});

describe('linkHost', () => {
  it('mostra o domínio sem www', () => {
    expect(linkHost('https://www.exemplo.ao/livro/1')).toBe('exemplo.ao');
    expect(linkHost('javascript:alert(1)')).toBe('');
  });
});

describe('extractLinks', () => {
  it('encontra links no texto, sem a pontuação do fim', () => {
    expect(extractLinks('Vejam https://exemplo.ao/a. E também http://b.ao/x?y=1!')).toEqual([
      'https://exemplo.ao/a', 'http://b.ao/x?y=1',
    ]);
  });
  it('não repete e não passa do máximo', () => {
    const texto = 'https://a.ao https://a.ao ' + Array.from({ length: 9 }, (_, i) => `https://s${i}.ao`).join(' ');
    expect(extractLinks(texto)).toHaveLength(MAX_LINKS);
    expect(extractLinks('https://a.ao https://a.ao')).toEqual(['https://a.ao/']);
  });
  it('não extrai esquemas perigosos', () => {
    expect(extractLinks('javascript:alert(1) data:text/html,x')).toEqual([]);
  });
});

describe('cleanLinks', () => {
  it('aceita texto ou objectos com url, e descarta o resto', () => {
    expect(cleanLinks(['https://a.ao', { url: 'https://b.ao' }, { url: 'javascript:x' }, null])).toEqual([
      'https://a.ao/', 'https://b.ao/',
    ]);
    expect(cleanLinks('não é lista')).toEqual([]);
  });
});

describe('linkifySegments', () => {
  it('separa texto e links, sem a pontuação final', () => {
    expect(linkifySegments('Leiam https://a.ao/x. Obrigado')).toEqual([
      { type: 'text', value: 'Leiam ' },
      { type: 'link', href: 'https://a.ao/x', label: 'https://a.ao/x' },
      { type: 'text', value: '. Obrigado' },
    ]);
  });
  it('texto sem links fica inteiro, e esquemas perigosos não viram link', () => {
    expect(linkifySegments('só texto')).toEqual([{ type: 'text', value: 'só texto' }]);
    expect(linkifySegments('javascript:alert(1)')).toEqual([{ type: 'text', value: 'javascript:alert(1)' }]);
    expect(linkifySegments('')).toEqual([]);
  });
});
