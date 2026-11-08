import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toasts = [];
vi.mock('sonner', () => {
  const toast = (titulo, opcoes) => toasts.push({ titulo, ...opcoes });
  toast.success = (titulo, opcoes) => toasts.push({ titulo, ...opcoes });
  toast.error = (titulo) => toasts.push({ titulo });
  toast.info = (titulo) => toasts.push({ titulo });
  return { toast };
});
vi.mock('@/lib/supabaseClient', () => ({
  SUPABASE_URL: 'http://supabase.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'teste',
  APP_API_URL: 'http://supabase.invalid/functions/v1/app',
  IS_PASSWORD_RECOVERY_REDIRECT: false,
  mediaUrl: () => '',
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
    from: () => ({ select: () => ({ in: async () => ({ data: [] }) }) }),
  },
}));

const { CartProvider, useCart } = await import('./useCart');
const KEY = 'e-commerce-cart';

let root;
let cart;
function Probe() { cart = useCart(); return null; }
const linha = (id, quantity = 1) => ({ product: { id, title: `Livro ${id}` }, variant: { id: `${id}-default`, manage_inventory: false }, quantity });

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  root = createRoot(document.createElement('div'));
  act(() => root.render(<CartProvider><Probe /></CartProvider>));
});
afterEach(() => act(() => root.unmount()));

describe('carrinho entre separadores', () => {
  it('o que se junta noutro separador aparece neste', () => {
    expect(cart.cartItems).toEqual([]);
    const outro = JSON.stringify([linha('a', 2)]);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: outro })); });
    expect(cart.cartItems).toHaveLength(1);
    expect(cart.cartItems[0].quantity).toBe(2);
  });

  it('esvaziado noutro separador, esvazia aqui; valores estragados e outras chaves não mexem', () => {
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify([linha('a')]) })); });
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '{estragado' })); });
    expect(cart.cartItems).toHaveLength(1);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'outra-coisa', newValue: '[]' })); });
    expect(cart.cartItems).toHaveLength(1);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: null })); });
    expect(cart.cartItems).toEqual([]);
  });

  it('remover deixa anular: o livro volta com a mesma quantidade e para o mesmo lugar', () => {
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: JSON.stringify([linha('a'), linha('b', 3), linha('c')]) })); });
    act(() => cart.removeFromCart('b-default'));
    expect(cart.cartItems.map((i) => i.product.id)).toEqual(['a', 'c']);
    const aviso = toasts.at(-1);
    expect(aviso.titulo).toContain('Livro b');
    act(() => aviso.action.onClick());
    expect(cart.cartItems.map((i) => [i.product.id, i.quantity])).toEqual([['a', 1], ['b', 3], ['c', 1]]);
  });
});
