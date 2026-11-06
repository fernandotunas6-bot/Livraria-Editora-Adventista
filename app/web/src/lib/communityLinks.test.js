import { describe, expect, it } from 'vitest';
import { MAX_LINKS, cleanLinks, extractLinks, linkHost, linkProblem, linkifySegments, safeHref } from './communityLinks';

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

describe('linkProblem (links maliciosos e de conteúdo adulto)', () => {
  it('aceita sites normais, incluindo nomes parecidos com palavras bloqueadas', () => {
    for (const ok of [
      'https://www.wikipedia.org/wiki/Angola', 'https://adventistas.org/pt/', 'https://www.youtube.com/watch?v=abc',
      'https://youtu.be/abc', 'https://wa.me/244923000000', 'https://www.sussex.ac.uk/', 'https://sextafeira.ao/',
      'https://site.org/vencer-a-pornografia', 'https://site.com:443/x', 'https://github.com/a/b/blob/main/x.js',
      'https://example.com.',
    ]) expect(linkProblem(ok)).toBe('');
  });

  it('recusa conteúdo adulto pelo nome, pela palavra, pelo domínio de topo, pela lista e pelo caminho', () => {
    for (const bad of [
      'https://www.pornhub.com/x', 'https://pt.xvideos.com/', 'https://free-sex.net/', 'https://sexy-girls.com/',
      'https://site.xxx/', 'https://tube8.com/v', 'https://m.tube8.com/v', 'https://onlyfans.com/x', 'https://reddit.com/r/nsfw',
    ]) expect(linkProblem(bad)).toMatch(/conteúdo adulto/);
  });

  it('recusa encurtadores, IP loggers, IPs, portas, letras disfarçadas e programas', () => {
    expect(linkProblem('https://bit.ly/abc')).toMatch(/encurtados/);
    expect(linkProblem('https://grabify.link/X1')).toMatch(/perigoso/);
    for (const ip of ['http://192.168.1.1/admin', 'http://2130706433/', 'https://[::1]/']) expect(linkProblem(ip)).toMatch(/IP/);
    expect(linkProblem('https://site.com:8080/x')).toMatch(/porta/);
    expect(linkProblem('https://xn--pypal-4ve.com/')).toMatch(/disfarçadas/);
    expect(linkProblem('https://site.org/files/app.apk')).toMatch(/executáveis/);
    expect(linkProblem('https://site.org/setup.exe?x=1')).toMatch(/executáveis/);
    expect(linkProblem('https://site.zip/')).toMatch(/\.zip/);
    expect(linkProblem('https://user:pw@site.com/')).toMatch(/palavra-passe/);
    expect(linkProblem('javascript:alert(1)')).toMatch(/inválido/);
  });

  it('não mostra como link nem guarda um link recusado', () => {
    const segs = linkifySegments('veja https://www.pornhub.com/x e https://adventistas.org');
    expect(segs.filter((s) => s.type === 'link').map((s) => s.href)).toEqual(['https://adventistas.org/']);
    expect(cleanLinks(['https://bit.ly/x', 'https://adventistas.org'])).toEqual(['https://adventistas.org/']);
  });

});
