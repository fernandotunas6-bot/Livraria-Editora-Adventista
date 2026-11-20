// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { HIDE_THRESHOLD, TOP_ZONE, nextHideState } from './useHideOnScroll';

const passo = (estado, y, extra = {}) => nextHideState({ y, ...estado, ...extra });

describe('nextHideState', () => {
  it('perto do topo fica sempre à vista', () => {
    expect(passo({ hidden: true, anchor: 500 }, TOP_ZONE).hidden).toBe(false);
  });

  it('esconde ao descer mais do que o limiar, e não por um tremor', () => {
    let e = { hidden: false, anchor: 300 };
    e = passo(e, 300 + HIDE_THRESHOLD - 1);
    expect(e.hidden).toBe(false);
    e = passo(e, 300 + HIDE_THRESHOLD + 1);
    expect(e.hidden).toBe(true);
  });

  it('volta ao subir, contando a partir do ponto mais baixo', () => {
    let e = { hidden: true, anchor: 400 };
    e = passo(e, 900); // continua a descer
    expect(e).toEqual({ hidden: true, anchor: 900 });
    e = passo(e, 900 - HIDE_THRESHOLD + 2);
    expect(e.hidden).toBe(true);
    e = passo(e, 900 - HIDE_THRESHOLD - 1);
    expect(e.hidden).toBe(false);
  });

  it('no fim da página reaparece', () => {
    expect(passo({ hidden: true, anchor: 2000 }, 2100, { atBottom: true }).hidden).toBe(false);
  });
});
