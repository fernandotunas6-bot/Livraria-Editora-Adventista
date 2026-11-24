// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, it, expect } from 'vitest';
import { hasCover, hasDescription, isKanGestDraft, visibleText, MIN_DESCRIPTION_CHARS } from '@/lib/bookContent';

describe('visibleText', () => {
  it('tira as etiquetas, os espaços de HTML e os espaços a mais', () => {
    expect(visibleText('<p>Um&nbsp;livro</p>\n<p>  sobre a fé</p>')).toBe('Um livro sobre a fé');
  });
  it('aceita vazio, null e undefined', () => {
    expect(visibleText('')).toBe('');
    expect(visibleText(null)).toBe('');
    expect(visibleText(undefined)).toBe('');
  });
});

describe('hasDescription', () => {
  it('um parágrafo vazio do editor não conta como descrição', () => {
    expect(hasDescription({ description: '<p><br></p>' })).toBe(false);
    expect(hasDescription({ description: '<p>&nbsp;</p>' })).toBe(false);
  });
  it('texto curto de mais também não', () => {
    expect(hasDescription({ description: '<p>Em breve.</p>' })).toBe(false);
  });
  it('uma sinopse a sério conta', () => {
    expect(hasDescription({ description: `<p>${'a'.repeat(MIN_DESCRIPTION_CHARS)}</p>` })).toBe(true);
  });
  it('livro sem o campo não rebenta', () => {
    expect(hasDescription({})).toBe(false);
    expect(hasDescription(null)).toBe(false);
  });
});

describe('hasCover', () => {
  it('conta a capa por URL e a capa por ficheiro, como o filtro do painel', () => {
    expect(hasCover({ cover: 'https://x/capa.webp' })).toBe(true);
    expect(hasCover({ cover: '', cover_image: 'capa_abc.webp' })).toBe(true);
  });
  it('espaços em branco não são capa', () => {
    expect(hasCover({ cover: '  ', cover_image: '' })).toBe(false);
    expect(hasCover({})).toBe(false);
  });
});

describe('isKanGestDraft', () => {
  it('só o rascunho oculto que entrou do KanGest; publicado deixa de o ser', () => {
    expect(isKanGestDraft({ active: false, kangest_novo_em: '2026-11-24T18:00:00Z' })).toBe(true);
    expect(isKanGestDraft({ active: true, kangest_novo_em: '2026-11-24T18:00:00Z' })).toBe(false);
    expect(isKanGestDraft({ active: false, kangest_novo_em: null })).toBe(false);
    expect(isKanGestDraft({ active: false })).toBe(false);
    expect(isKanGestDraft(null)).toBe(false);
  });
});
