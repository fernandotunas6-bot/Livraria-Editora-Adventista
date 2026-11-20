// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { slugify } from './CommunityStaffPanels';

describe('slugify', () => {
  it('tira acentos, espaços e símbolos', () => {
    expect(slugify('Lição da Escola Sabatina')).toBe('licao-da-escola-sabatina');
    expect(slugify('  Saúde & Família!  ')).toBe('saude-familia');
  });
  it('respeita o limite de 40 sem acabar em hífen', () => {
    const s = slugify('a'.repeat(39) + ' bcd');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
  });
  it('devolve vazio sem nome', () => {
    expect(slugify('')).toBe('');
    expect(slugify(null)).toBe('');
  });
});
