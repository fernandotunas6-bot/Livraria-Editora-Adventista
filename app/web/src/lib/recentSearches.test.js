// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it } from 'vitest';
import { MAX_RECENT_SEARCHES, addRecentSearch, clearRecentSearches, getRecentSearches } from '@/lib/recentSearches';

afterEach(() => localStorage.clear());

describe('pesquisas recentes', () => {
  it('a mais recente primeiro, sem repetir (nem por maiúsculas) e sem espaços a mais', () => {
    addRecentSearch('Ellen White');
    addRecentSearch('  desejado   de todas ');
    addRecentSearch('ellen white');
    expect(getRecentSearches()).toEqual(['ellen white', 'desejado de todas']);
  });

  it('ignora o que é curto demais e guarda no máximo oito', () => {
    addRecentSearch('a');
    addRecentSearch(' ');
    expect(getRecentSearches()).toEqual([]);
    for (let i = 0; i < 12; i += 1) addRecentSearch(`livro ${i}`);
    expect(getRecentSearches()).toHaveLength(MAX_RECENT_SEARCHES);
    expect(getRecentSearches()[0]).toBe('livro 11');
  });

  it('limpar apaga tudo; valores estragados não partem nada', () => {
    addRecentSearch('Bíblia');
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
    localStorage.setItem('livraria:pesquisas-recentes', '{x');
    expect(getRecentSearches()).toEqual([]);
    localStorage.setItem('livraria:pesquisas-recentes', JSON.stringify(['ok', 3, null]));
    expect(getRecentSearches()).toEqual(['ok']);
  });

  it('sem armazenamento continua a funcionar', () => {
    const blocked = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } };
    expect(getRecentSearches(blocked)).toEqual([]);
    // a lista nova volta na mesma, para o ecrã a mostrar nesta visita
    expect(addRecentSearch('Bíblia', blocked)).toEqual(['Bíblia']);
    expect(() => clearRecentSearches(blocked)).not.toThrow();
  });
});
