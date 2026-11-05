import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CART_EVENT, OPEN_HEADER_SEARCH_EVENT } from '@/lib/mobileNav';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mobile = true;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
vi.mock('@/hooks/useCart', () => ({ useCart: () => ({ cartItems: [{ quantity: 2 }, { quantity: 1 }] }) }));
vi.mock('@/api/EcommerceApi', () => ({ getProducts: vi.fn(async () => ({ products: [] })) }));

const { default: MobileBottomNav } = await import('./MobileBottomNav');

let root;
let host;
async function mount(path) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><MobileBottomNav /></MemoryRouter>));
}
const nav = () => document.querySelector('nav[aria-label="Navegação principal"]');
const button = (text) => [...document.querySelectorAll('nav button, nav a')].find((b) => b.textContent.includes(text));

beforeEach(() => { mobile = true; });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.documentElement.style.removeProperty('--barra-navegacao');
});

describe('MobileBottomNav', () => {
  it('no telemóvel mostra os cinco atalhos, marca o activo e reserva o espaço', async () => {
    await mount('/');
    expect(nav()).not.toBeNull();
    for (const t of ['Início', 'Categorias', 'Pesquisar', 'Carrinho', 'Conta']) expect(button(t), t).toBeTruthy();
    expect(button('Início').getAttribute('aria-current')).toBe('page');
    expect(document.documentElement.style.getPropertyValue('--barra-navegacao')).toBe('56px');
    expect(button('Carrinho').getAttribute('aria-label')).toBe('Carrinho com 3 itens');
  });

  it('não aparece na ficha do livro (fica a barra de compra) nem no desktop', async () => {
    await mount('/product/abc');
    expect(nav()).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--barra-navegacao')).toBe('0px');
    act(() => root.unmount());
    mobile = false;
    await mount('/shop');
    expect(nav()).toBeNull();
  });

  it('Pesquisar abre a pesquisa do cabeçalho e Carrinho abre o carrinho da página', async () => {
    const search = vi.fn();
    const cart = vi.fn((e) => { e.detail.handled = true; });
    window.addEventListener(OPEN_HEADER_SEARCH_EVENT, search);
    window.addEventListener(OPEN_CART_EVENT, cart);
    await mount('/shop');
    act(() => button('Pesquisar').click());
    act(() => button('Carrinho').click());
    expect(search).toHaveBeenCalledOnce();
    expect(cart).toHaveBeenCalledOnce();
    window.removeEventListener(OPEN_HEADER_SEARCH_EVENT, search);
    window.removeEventListener(OPEN_CART_EVENT, cart);
  });
});
