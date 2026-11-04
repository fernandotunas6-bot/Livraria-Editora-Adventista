import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePlace } from './useScrollMemory';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mobile = true;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
const { useCatalogWindow } = await import('./useCatalogWindow');

const items = Array.from({ length: 60 }, (_, i) => ({ id: `l${i}` }));
let api;
let root;
let host;
function Probe(props) {
  api = useCatalogWindow(props);
  return null;
}
const mount = (props, path = '/colecoes/x') => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={[path]}><Probe {...props} /></MemoryRouter>));
};

beforeEach(() => {
  mobile = true;
  sessionStorage.clear();
  vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 0));
  vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  window.scrollTo = vi.fn();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  delete globalThis.IntersectionObserver;
});

describe('useCatalogWindow', () => {
  it('no telemóvel mostra o primeiro lote', () => {
    mount({ items, ready: true, batch: 24 });
    expect(api.isMobile).toBe(true);
    expect(api.visible).toHaveLength(24);
    expect(api.infinite.hasMore).toBe(true);
  });

  it('no desktop mostra a lista inteira, como antes', () => {
    mobile = false;
    mount({ items, ready: true, batch: 24 });
    expect(api.visible).toHaveLength(60);
  });

  it('ao voltar atrás repõe quantos estavam desenhados', () => {
    savePlace('/colecoes/x', { count: 48, y: 1500 });
    mount({ items, ready: false, batch: 24 });
    act(() => root.render(<MemoryRouter initialEntries={['/colecoes/x']}><Probe items={items} ready batch={24} /></MemoryRouter>));
    expect(api.visible).toHaveLength(48);
  });
});
