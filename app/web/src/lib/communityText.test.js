import { describe, expect, it } from 'vitest';
import { MAX_BODY, cleanBody, initials, preparePost, relativeTime } from './communityText';

describe('cleanBody', () => {
  it('tira espaços das pontas e linhas em branco a mais', () => {
    expect(cleanBody('  a\r\n\r\n\r\n\r\nb  ')).toBe('a\n\nb');
  });
});

describe('preparePost', () => {
  it('recusa links de conteúdo adulto ou perigosos no texto, na citação e na lista', () => {
    expect(preparePost({ body: 'veja https://www.pornhub.com/x' }).error).toMatch(/conteúdo adulto/);
    expect(preparePost({ body: 'citação', quote: 'em https://bit.ly/abc' }).error).toMatch(/encurtados/);
    expect(preparePost({ body: 'olá', links: ['https://grabify.link/a'] }).error).toMatch(/perigoso/);
    expect(preparePost({ body: 'leia https://adventistas.org.' }).data.links).toEqual(['https://adventistas.org/']);
  });

  it('recusa texto vazio ou comprido de mais', () => {
    expect(preparePost({ body: '   ' }).error).toMatch(/Escreva/);
    expect(preparePost({ body: 'x'.repeat(MAX_BODY + 1) }).error).toMatch(/máximo/);
  });
  it('junta os links do texto e os escritos à parte, sem repetir', () => {
    const r = preparePost({ body: 'Veja https://a.ao', links: ['https://a.ao', 'https://b.ao'] });
    expect(r.data.links).toEqual(['https://a.ao/', 'https://b.ao/']);
  });
  it('recusa um link inválido escrito à parte', () => {
    expect(preparePost({ body: 'ok', links: ['javascript:alert(1)'] }).error).toMatch(/link inválido/i);
  });
  it('recusa mais de cinco links', () => {
    const links = ['https://a.ao', 'https://b.ao', 'https://c.ao', 'https://d.ao', 'https://e.ao', 'https://f.ao'];
    expect(preparePost({ body: 'ok', links }).error).toMatch(/No máximo 5/);
  });
  it('a página só conta com citação, e o livro e a resposta seguem', () => {
    const r = preparePost({ body: 'ok', quotePage: '12', bookId: 'b1', parentId: 'p1' });
    expect(r.data).toMatchObject({ quote: '', quote_page: '', book_id: 'b1', parent_id: 'p1' });
    expect(preparePost({ body: 'ok', quote: 'Frase', quotePage: ' p. 12 ' }).data.quote_page).toBe('p. 12');
  });
});

describe('initials e relativeTime', () => {
  it('iniciais do nome', () => {
    expect(initials('Maria da Silva João')).toBe('MJ');
    expect(initials('Ana')).toBe('A');
    expect(initials('')).toBe('L');
  });
  it('tempo relativo', () => {
    const agora = Date.parse('2026-11-06T12:00:00Z');
    expect(relativeTime('2026-11-06T11:59:30Z', agora)).toBe('agora');
    expect(relativeTime('2026-11-06T11:55:00Z', agora)).toBe('há 5 min');
    expect(relativeTime('2026-11-06T09:00:00Z', agora)).toBe('há 3 h');
    expect(relativeTime('2026-11-04T12:00:00Z', agora)).toBe('há 2 dias');
    expect(relativeTime('nada', agora)).toBe('');
  });
});
