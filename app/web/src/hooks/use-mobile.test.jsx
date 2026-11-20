// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useIsMobile } from './use-mobile';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('useIsMobile', () => {
  it('acerta logo no primeiro desenho (sem passar pela versão de desktop)', () => {
    window.innerWidth = 390;
    window.matchMedia = () => ({ addEventListener() {}, removeEventListener() {} });
    const vistos = [];
    function Probe() {
      vistos.push(useIsMobile());
      return null;
    }
    host = document.createElement('div');
    root = createRoot(host);
    act(() => root.render(<Probe />));
    expect(vistos[0]).toBe(true);
    expect(vistos.every(Boolean)).toBe(true);
  });
});
