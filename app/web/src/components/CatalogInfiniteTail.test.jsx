import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CatalogInfiniteTail from './CatalogInfiniteTail';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
const mount = (props) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter><CatalogInfiniteTail sentinelRef={{ current: null }} loadMore={() => {}} {...props} /></MemoryRouter>));
  return host;
};
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('CatalogInfiniteTail', () => {
  it('catálogo vazio: não desenha nada (a página mostra o seu próprio "sem resultados")', () => {
    expect(mount({ total: 0, shown: 0, hasMore: false }).textContent).toBe('');
  });

  it('com mais livros: contagem e o botão alternativo ao deslize', () => {
    const loadMore = vi.fn();
    const el = mount({ total: 102, shown: 24, hasMore: true, loadMore });
    expect(el.textContent).toContain('24 de 102 livros');
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Mostrar mais')).click());
    expect(loadMore).toHaveBeenCalledOnce();
  });

  it('no fim diz que acabou (não finge ser infinito) e oferece outros caminhos', () => {
    const clear = vi.fn();
    const el = mount({ total: 1, shown: 1, hasMore: false, onClearFilters: clear });
    expect(el.textContent).toContain('Viu o único livro desta selecção.');
    expect(el.querySelector('a[href="/colecoes"]')).not.toBeNull();
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Ver todos')).click());
    expect(clear).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(mount({ total: 30, shown: 30, hasMore: false }).textContent).toContain('Viu os 30 livros');
  });
});
