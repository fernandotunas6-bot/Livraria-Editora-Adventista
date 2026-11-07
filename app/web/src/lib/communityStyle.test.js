import { describe, expect, it } from 'vitest';
import {
  MONOGRAM_COLORS, filtersFromSearch, monogramColor, needsClamp, plural, postKind, postPath, readerPath,
  readerSince, searchFromFilters, topicIcon, whatsappShareUrl,
} from './communityStyle';

describe('comunidade: filtros no endereço', () => {
  it('lê só valores válidos', () => {
    expect(filtersFromSearch('?tema=estudo-biblico&tipo=pergunta&ordem=em_alta&q=  graça  ')).toEqual({
      topic: 'estudo-biblico', kind: 'pergunta', sort: 'em_alta', query: 'graça', book: '',
    });
    expect(filtersFromSearch('?tema=../x&tipo=anuncio&ordem=tudo&livro=a/b')).toEqual({ topic: '', kind: '', sort: 'recentes', query: '', book: '' });
    expect(filtersFromSearch('?livro=abc123').book).toBe('abc123');
  });

  it('escreve só o que não é de omissão, e volta ao mesmo', () => {
    expect(searchFromFilters({ sort: 'recentes' })).toBe('');
    const s = searchFromFilters({ topic: 'familia', kind: 'citacao', sort: 'sem_resposta', query: 'lar', book: 'bk1' });
    expect(s).toBe('?tema=familia&tipo=citacao&ordem=sem_resposta&q=lar&livro=bk1');
    expect(filtersFromSearch(s)).toEqual({ topic: 'familia', kind: 'citacao', sort: 'sem_resposta', query: 'lar', book: 'bk1' });
  });
});

describe('comunidade: aspecto', () => {
  it('dá sempre a mesma cor à mesma chave, da paleta', () => {
    expect(monogramColor('abc123')).toBe(monogramColor('abc123'));
    expect(MONOGRAM_COLORS).toContain(monogramColor('xyz'));
    expect(MONOGRAM_COLORS).toContain(monogramColor(''));
  });

  it('tipo e ícone com valores de recurso', () => {
    expect(postKind('pergunta').label).toBe('Pergunta');
    expect(postKind('outro').value).toBe('discussao');
    expect(topicIcon('heart-pulse')).toBe('heart-pulse');
    expect(topicIcon('<script>')).toBe('book-open');
  });

  it('decide o "Ler mais"', () => {
    expect(needsClamp('curto')).toBe(false);
    expect(needsClamp('a'.repeat(421))).toBe(true);
    expect(needsClamp('1\n2\n3\n4\n5\n6\n7')).toBe(true);
  });

  it('caminhos, plural e data de entrada', () => {
    expect(postPath('ab c')).toBe('/comunidade/p/ab%20c');
    expect(readerPath('k1')).toBe('/comunidade/leitor/k1');
    expect(plural(1, 'resposta', 'respostas')).toBe('1 resposta');
    expect(plural(3, 'resposta', 'respostas')).toBe('3 respostas');
    expect(readerSince('2026-11-07T10:00:00Z')).toMatch(/^Leitor desde .*2026$/);
    expect(readerSince('x')).toBe('');
  });

  it('partilha no WhatsApp com excerto e endereço da publicação', () => {
    const url = whatsappShareUrl({ id: 'p1', body: 'Um texto   com espaços' }, 'https://livrariaadventista.com/');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    const text = decodeURIComponent(url.split('text=')[1]);
    expect(text).toContain('«Um texto com espaços»');
    expect(text).toContain('https://livrariaadventista.com/comunidade/p/p1');
  });
});
