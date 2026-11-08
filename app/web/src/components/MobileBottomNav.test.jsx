import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CART_EVENT } from '@/lib/mobileNav';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mobile = true;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
vi.mock('@/hooks/useCart', () => ({ useCart: () => ({ cartItems: [{ quantity: 2 }, { quantity: 1 }] }) }));
vi.mock('@/api/EcommerceApi', () => ({ getProducts: vi.fn(async () => ({ products: [] })) }));
let authed = false;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: authed ? { id: 'u1' } : null, isAuthed: authed }) }));
const loadNotifications = vi.fn(async () => [
  { id: 'a', kind: 'community', read_at: null },
  { id: 'b', kind: 'community', read_at: null },
  { id: 'c', kind: 'support', read_at: null },
  { id: 'd', kind: 'community', read_at: '2026-11-07T10:00:00Z' },
]);
vi.mock('@/lib/communityApi', () => ({ loadNotifications, markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
const { resetNotificationsStore } = await import('@/hooks/useNotifications');

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

beforeEach(() => { mobile = true; authed = false; loadNotifications.mockClear(); });
afterEach(() => {
  act(() => root?.unmount());
  resetNotificationsStore();
  host?.remove();
  document.documentElement.style.removeProperty('--barra-navegacao');
});

describe('MobileBottomNav', () => {
  it('no telemóvel mostra os cinco atalhos, marca o activo e reserva o espaço', async () => {
    await mount('/');
    expect(nav()).not.toBeNull();
    for (const t of ['Início', 'Categorias', 'Comunidade', 'Carrinho', 'Conta']) expect(button(t), t).toBeTruthy();
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

  it('Comunidade leva à comunidade e fica activa lá dentro; Carrinho abre o carrinho da página', async () => {
    const cart = vi.fn((e) => { e.detail.handled = true; });
    window.addEventListener(OPEN_CART_EVENT, cart);
    await mount('/comunidade/p/abc123');
    expect(button('Comunidade').getAttribute('href')).toBe('/comunidade');
    expect(button('Comunidade').getAttribute('aria-current')).toBe('page');
    act(() => button('Carrinho').click());
    expect(cart).toHaveBeenCalledOnce();
    window.removeEventListener(OPEN_CART_EVENT, cart);
  });

  it('mostra as respostas da comunidade por ler (só as da comunidade) e sem sessão não pede nada', async () => {
    await mount('/');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(loadNotifications).not.toHaveBeenCalled();
    expect(button('Comunidade').getAttribute('aria-label')).toBeNull();
    act(() => root.unmount());

    authed = true;
    await mount('/');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(loadNotifications).toHaveBeenCalledOnce();
    expect(button('Comunidade').getAttribute('aria-label')).toBe('Comunidade, 2 avisos por ler');
    expect(button('Comunidade').textContent).toContain('2');
  });
});
