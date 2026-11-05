import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getProducts = vi.fn();
vi.mock('@/api/EcommerceApi', () => ({ getProducts: (...a) => getProducts(...a) }));
let mobile = true;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: { whatsapp: '+244 923 000 000' } }) }));
vi.mock('@/components/ProductsList.jsx', () => ({
  default: ({ products, isLoading }) => (isLoading ? <p>a carregar</p> : <ul>{products.map((p) => <li key={p.id}>{p.title}</li>)}</ul>),
}));

const { default: DiscoveryFeed, discoveryOrder, BATCH_MOBILE, BATCH_DESKTOP } = await import('./DiscoveryFeed');

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

describe('DiscoveryFeed', () => {
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

  const montar = async (props = {}) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><DiscoveryFeed {...props} /></MemoryRouter>));
  };
  const aproximar = async () => {
    await act(async () => { observers[0].cb([{ isIntersecting: true }]); });
    await act(async () => { await Promise.resolve(); });
  };

  it('só pede os livros quando a secção se aproxima, e mostra o primeiro lote', async () => {
    getProducts.mockResolvedValue({ products: Array.from({ length: 30 }, (_, i) => livro(`l${i}`, { order: i })) });
    await montar();
    expect(getProducts).not.toHaveBeenCalled();
    expect(observers[0].opts.rootMargin).toBe('800px 0px');

    await aproximar();
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('li')).toHaveLength(BATCH_MOBILE);
    expect(host.textContent).toContain(`${BATCH_MOBILE} de 30 livros`);
  });

  it('no desktop também aparece, em lotes maiores, com o painel lateral e livros pequenos', async () => {
    mobile = false;
    getProducts.mockResolvedValue({
      products: Array.from({ length: 30 }, (_, i) => livro(`l${i}`, { order: i, type: { value: i % 2 ? 'Fé' : 'Saúde' }, image: 'x.jpg' })),
    });
    await montar();
    await aproximar();
    expect(host.querySelectorAll('li')).toHaveLength(BATCH_DESKTOP);
    expect(host.textContent).toContain('Refinar catálogo');
    expect(host.textContent).toContain('Escolhas da livraria');
    expect(host.querySelector('a[href="/shop?category=F%C3%A9"]')).not.toBeNull();
    expect(host.querySelector('a[href^="https://wa.me/244923000000"]')).not.toBeNull();
  });

  it('não sugere o livro que está aberto', async () => {
    getProducts.mockResolvedValue({ products: [livro('a'), livro('b'), livro('c')] });
    await montar({ excludeId: 'b' });
    await aproximar();
    expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'c']);
  });
});
