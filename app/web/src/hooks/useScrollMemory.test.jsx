// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPlace, savePlace, useScrollMemory } from './useScrollMemory';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
let scrollY = 0;
const scrollTo = vi.fn(({ top }) => { scrollY = top; });

function Probe({ ready, count }) {
  useScrollMemory({ ready, snapshot: { count, page: 1 } });
  return null;
}
const app = (props) => (
  <MemoryRouter initialEntries={['/shop?search=fé']}>
    <Probe {...props} />
  </MemoryRouter>
);
const frames = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
// Espera pela condição em vez de um tempo fixo: com a máquina carregada, 20 ms não chegavam.
async function waitUntil(check, timeout = 5000) {
  const start = Date.now();
  while (!check() && Date.now() - start < timeout) await frames();
  return check();
}
const scroll = async (y) => {
  scrollY = y;
  window.dispatchEvent(new Event('scroll'));
  await frames();
};

beforeEach(() => {
  sessionStorage.clear();
  scrollY = 0;
  scrollTo.mockClear();
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
  window.scrollTo = scrollTo;
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});
const mount = (props) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(app(props)));
};

describe('useScrollMemory', () => {
  it('ao voltar, repõe a posição só quando a lista está pronta', async () => {
    savePlace('/shop?search=fé', { count: 72, page: 1, y: 2400 });
    mount({ ready: false, count: 24 });
    await frames();
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => root.render(app({ ready: true, count: 72 })));
    expect(await waitUntil(() => scrollTo.mock.calls.length > 0)).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 2400 }));
  });

  it('o salto para o topo antes de repor não apaga o lugar guardado', async () => {
    savePlace('/shop?search=fé', { count: 72, page: 1, y: 2400 });
    mount({ ready: false, count: 24 });
    await scroll(0); // o ScrollToTop ao entrar na rota
    expect(readPlace('/shop?search=fé')).toMatchObject({ y: 2400, count: 72 });
  });

  it('depois de repor, volta a gravar a posição ao deslizar', async () => {
    mount({ ready: true, count: 48 });
    await scroll(900);
    expect(await waitUntil(() => readPlace('/shop?search=fé')?.y === 900)).toBe(true);
    expect(readPlace('/shop?search=fé')).toMatchObject({ y: 900, count: 48 });
  });
});
