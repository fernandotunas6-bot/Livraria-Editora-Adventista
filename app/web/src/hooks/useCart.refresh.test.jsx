// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * `refreshCart` lê preços e stock no servidor quando o carrinho abre. Com rede lenta, o que a
 * pessoa fazia entretanto (tirar um livro, mudar a quantidade) desaparecia quando a resposta
 * chegava: o resultado era calculado sobre o carrinho de antes da leitura e escrito por cima.
 */

vi.mock('sonner', () => ({ toast: Object.assign(() => {}, { success() {}, error() {}, info() {} }) }));

// A leitura dos livros fica pendurada até o teste a soltar.
let soltar;
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
    from: () => ({ select: () => ({ in: () => new Promise((resolve) => { soltar = resolve; }) }) }),
  },
}));

const { CartProvider, useCart } = await import('./useCart');

const linha = (id, quantity, priceKz) => ({
  product: { id, title: `Livro ${id}`, product_type: 'livro', versions: [] },
  variant: {
    id: `${id}-default`, title: 'Standard', price_in_cents: priceKz * 100, sale_price_in_cents: null,
    inventory_quantity: 10, manage_inventory: true,
  },
  quantity,
});
const livro = (id, price, stock = 10) => ({ id, title: `Livro ${id}`, price, stock, active: true, versions: [] });

let host;
let root;
let carrinho;
function Sonda() {
  carrinho = useCart();
  return null;
}

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('e-commerce-cart', JSON.stringify([linha('a', 2, 1000), linha('b', 1, 500)]));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<CartProvider><Sonda /></CartProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('refreshCart com alterações durante a leitura', () => {
  it('um livro tirado enquanto a leitura corria não volta, e o preço novo entra', async () => {
    let pendente;
    await act(async () => { pendente = carrinho.refreshCart(); });
    await act(async () => { carrinho.removeFromCart('b-default'); });
    // O preço de "a" mudou no servidor: há alterações a aplicar.
    await act(async () => { soltar({ data: [livro('a', 1200), livro('b', 500)], error: null }); await pendente; });
    expect(carrinho.cartItems.map((i) => i.variant.id)).toEqual(['a-default']);
    expect(carrinho.cartItems[0].variant.price_in_cents).toBe(120000);
    expect(carrinho.cartItems[0].quantity).toBe(2);
  });

  it('a quantidade mudada entretanto fica, limitada ao stock lido', async () => {
    let pendente;
    await act(async () => { pendente = carrinho.refreshCart(); });
    await act(async () => { carrinho.updateQuantity('a-default', 5); });
    await act(async () => { soltar({ data: [livro('a', 1000, 3), livro('b', 500)], error: null }); await pendente; });
    const a = carrinho.cartItems.find((i) => i.variant.id === 'a-default');
    expect(a.quantity).toBe(3);
    expect(carrinho.cartItems).toHaveLength(2);
  });
});
