import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePlace } from '@/hooks/useScrollMemory';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getProducts = vi.fn();
vi.mock('@/api/EcommerceApi', () => ({ getProducts: (...a) => getProducts(...a) }));
let mobile = true;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
vi.mock('@/components/ProductsList.jsx', () => ({
  default: ({ products, isLoading }) => (isLoading ? <p>a carregar</p> : <ul>{products.map((p) => <li key={p.id}>{p.title}</li>)}</ul>),
}));

const { default: MobileDiscoveryFeed, discoveryOrder } = await import('./MobileDiscoveryFeed');

const livro = (id, extra = {}) => ({ id, title: id, order: 0, purchasable: true, variants: [{ inventory_quantity: 3 }], ...extra });

describe('discoveryOrder', () => {
  it('destaques primeiro, depois disponíveis (recentes à frente), esgotados no fim, sem repetir', () => {
    const lista = [
      livro('esgotado', { variants: [{ inventory_quantity: 0 }], order: 99 }),
      livro('antigo', { order: 1 }),
      livro('destaque', { featured: true }),
      livro('recente', { order: 50 }),
      livro('antigo', { order: 1 }),
      livro('indisponivel', { purchasable: false, order: 80 }),
    ];
    expect(discoveryOrder(lista).map((p) => p.id)).toEqual(['destaque', 'recente', 'antigo', 'esgotado', 'indisponivel']);
  });
});

describe('MobileDiscoveryFeed', () => {
  let observers;
  let root;
  let host;
  beforeEach(() => {
    observers = [];
    mobile = true;
    sessionStorage.clear();
    getProducts.mockReset();
    globalThis.IntersectionObserver = class {
      constructor(cb, opts) { this.cb = cb; this.opts = opts; observers.push(this); }
      observe() {}
      disconnect() { this.off = true; }
    };
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete globalThis.IntersectionObserver;
  });

  it('só pede os livros quando a secção se aproxima, e mostra o primeiro lote', async () => {
    getProducts.mockResolvedValue({ products: Array.from({ length: 30 }, (_, i) => livro(`l${i}`, { order: i })) });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><MobileDiscoveryFeed /></MemoryRouter>));
    expect(getProducts).not.toHaveBeenCalled();
    expect(observers[0].opts.rootMargin).toBe('800px 0px');

    await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
    await act(async () => { await Promise.resolve(); });
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('li')).toHaveLength(12);
    expect(host.textContent).toContain('12 de 30 livros');
  });

  it('no desktop não aparece nem pede livros, mesmo ao voltar atrás com um lugar guardado', async () => {
    mobile = false;
    savePlace('/', { count: 24, y: 3000 });
    getProducts.mockResolvedValue({ products: [] });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={['/']}><MobileDiscoveryFeed /></MemoryRouter>));
    await act(async () => { await Promise.resolve(); });
    expect(host.textContent).toBe('');
    expect(getProducts).not.toHaveBeenCalled();
  });
});
