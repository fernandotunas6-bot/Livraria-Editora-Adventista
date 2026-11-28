// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { codigoSugerido, codigoValido, lojaComOMesmoNome, soLetras } from './lojasCodigos';

describe('o código de cada loja, como a base o dá', () => {
  it('sem acentos nem espaços', () => {
    expect(soLetras('Huíla')).toBe('HUILA');
    expect(soLetras('Livraria — Bié (Kuito)')).toBe('LIVRARIABIEKUITO');
  });
  it('as 3 primeiras letras, e um número se já houver', () => {
    expect(codigoSugerido('Huambo', [])).toBe('HUA');
    expect(codigoSugerido('Huambo', ['HUA'])).toBe('HUA2');
    expect(codigoSugerido('Huambo', ['HUA', 'HUA2'])).toBe('HUA3');
    expect(codigoSugerido('Bié', ['HUA'])).toBe('BIE');
    expect(codigoSugerido('', [])).toBe('LJ');
  });
  it('um código bem escrito', () => {
    for (const bom of ['HUA', 'HUA2', 'LJ', 'ABCDEF']) expect(codigoValido(bom), bom).toBe(true);
    for (const mau of ['H', '1AB', 'ABCDEFG', 'hua', 'HU-A']) expect(codigoValido(mau), mau).toBe(false);
  });
  it('o mesmo nome de outra loja', () => {
    const lojas = [{ id: 'a', name: 'Livraria Adventista — Huambo' }];
    expect(lojaComOMesmoNome(lojas, 'livraria adventista huambo')?.id).toBe('a');
    expect(lojaComOMesmoNome(lojas, 'Livraria Adventista — Huambo', 'a')).toBeNull();
    expect(lojaComOMesmoNome(lojas, 'Livraria Adventista — Bié')).toBeNull();
  });
});
