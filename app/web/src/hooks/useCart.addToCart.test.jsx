import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * O aviso de "adicionado ao carrinho", que dizia a edição errada.
 *
 * `variant.name` não existe em lado nenhum — as variantes que o `bookToProduct` constrói têm
 * `title`. O `variant.name || 'Edição Standard'` caía sempre no texto fixo: juntar uma
 * t-shirt no tamanho M dizia "1x · Edição Standard", com o nome errado e com a palavra
 * errada (o achado 47 já tinha tirado "Edição" dos produtos que não são livros).
 */

const toasts = [];
vi.mock('sonner', () => ({
  toast: {
    success: (titulo, opcoes) => toasts.push({ tipo: 'success', titulo, ...opcoes }),
    error: (titulo) => toasts.push({ tipo: 'error', titulo }),
    info: (titulo) => toasts.push({ tipo: 'info', titulo }),
  },
}));
// O `useCart` importa o `EcommerceApi`, que puxa o cliente de dados; este liga-se ao Auth
// no momento do import. Nada aqui fala com a rede.
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

let host;
let root;
let carrinho;

function Sonda() {
  carrinho = useCart();
  return null;
}

beforeEach(async () => {
  toasts.length = 0;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<CartProvider><Sonda /></CartProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const produto = (extra = {}) => ({
  id: 'liv1', title: 'O Grande Conflito', product_type: 'livro', versions: [], ...extra,
});
const variante = (id, extra = {}) => ({
  id, title: 'Standard', price_in_cents: 100_000, inventory_quantity: 5, manage_inventory: true, ...extra,
});

const juntar = async (p, v, qtd = 1) => {
  await act(async () => { await carrinho.addToCart(p, v, qtd).catch(() => {}); });
};

describe('addToCart — o que o aviso diz', () => {
  it('na variante única não inventa uma edição', async () => {
    await juntar(produto(), variante('liv1-default'));
    const t = toasts.at(-1);
    expect(t.titulo).toContain('O Grande Conflito');
    expect(t.description).toBe('1×');
    expect(t.description).not.toContain('Edição Standard');
  });

  it('num tamanho escolhido diz o tamanho, não "Edição Standard"', async () => {
    const p = produto({ id: 'ves1', title: 'T-shirt', product_type: 'vestuario', versions: [{ label: 'M' }, { label: 'L' }] });
    await juntar(p, variante('ves1-v0', { title: 'M', format: 'Azul' }), 2);
    const t = toasts.at(-1);
    expect(t.description).toBe('2× · M · Azul');
  });

  it('numa edição de livro diz a edição', async () => {
    const p = produto({ versions: [{ label: 'Capa dura' }] });
    await juntar(p, variante('liv1-v0', { title: 'Capa dura' }));
    expect(toasts.at(-1).description).toBe('1× · Capa dura');
  });
});

describe('addToCart — o que recusa', () => {
  it('um produto com tamanhos não entra sem um escolhido', async () => {
    const p = produto({ id: 'ves1', title: 'T-shirt', product_type: 'vestuario', versions: [{ label: 'M' }] });
    await juntar(p, variante('ves1-default'));
    expect(carrinho.cartItems).toHaveLength(0);
    expect(toasts.at(-1).tipo).toBe('error');
    expect(toasts.at(-1).titulo).toContain('escolha o tamanho');
  });

  it('não passa do stock, somando o que já lá está', async () => {
    const v = variante('liv1-default', { inventory_quantity: 3 });
    await juntar(produto(), v, 2);
    expect(carrinho.cartItems[0].quantity).toBe(2);
    await juntar(produto(), v, 2);
    expect(carrinho.cartItems[0].quantity).toBe(2);
    expect(toasts.at(-1).tipo).toBe('error');
    expect(toasts.at(-1).titulo).toContain('Apenas 3 unidades');
  });

  it('a mesma variante soma em vez de duplicar a linha', async () => {
    const v = variante('liv1-default');
    await juntar(produto(), v, 1);
    await juntar(produto(), v, 2);
    expect(carrinho.cartItems).toHaveLength(1);
    expect(carrinho.cartItems[0].quantity).toBe(3);
  });

  it('tamanhos diferentes do mesmo produto são linhas diferentes', async () => {
    const p = produto({ id: 'ves1', title: 'T-shirt', product_type: 'vestuario', versions: [{ label: 'M' }, { label: 'L' }] });
    await juntar(p, variante('ves1-v0', { title: 'M' }));
    await juntar(p, variante('ves1-v1', { title: 'L' }));
    expect(carrinho.cartItems).toHaveLength(2);
  });
});

describe('addToCart — edição digital', () => {
  it('entra com quantidade 1 e não soma: já está no carrinho', async () => {
    const v = variante('liv1-v1', { digital: true, manage_inventory: false, inventory_quantity: 1 });
    const p = produto({ versions: [{ label: 'Impresso' }, { label: 'Edição digital', digital: true }] });
    await juntar(p, v, 3);
    expect(carrinho.cartItems).toHaveLength(1);
    expect(carrinho.cartItems[0].quantity).toBe(1);
    expect(toasts.at(-1).description).toContain('fica na sua biblioteca');
    await juntar(p, v, 1);
    expect(carrinho.cartItems[0].quantity).toBe(1);
    expect(toasts.at(-1)).toMatchObject({ tipo: 'info' });
    expect(toasts.at(-1).titulo).toContain('já está no carrinho');
    await act(async () => carrinho.updateQuantity('liv1-v1', 4));
    expect(carrinho.cartItems[0].quantity).toBe(1);
    expect(carrinho.cartDigital).toMatchObject({ all: true, any: true, physicalCents: 0 });
  });

  it('com um impresso: misto, e os portes contam só o impresso', async () => {
    const p = produto({ versions: [{ label: 'Impresso' }, { label: 'Edição digital', digital: true }] });
    await juntar(p, variante('liv1-v1', { digital: true, manage_inventory: false, inventory_quantity: 1 }));
    await juntar(produto({ id: 'bib', title: 'Bíblia' }), variante('bib-default'), 2);
    expect(carrinho.cartDigital).toMatchObject({ all: false, any: true, physicalCents: 200_000 });
  });
});

describe('addToCart — edição digital dentro do app iOS', () => {
  afterEach(() => { delete window.Capacitor; });

  it('não entra no carrinho (regra 3.1.1 da App Store); o impresso entra', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    const p = produto({ versions: [{ label: 'Impresso' }, { label: 'Edição digital', digital: true }] });
    await juntar(p, variante('liv1-v1', { digital: true, manage_inventory: false, inventory_quantity: 1 }));
    expect(carrinho.cartItems).toHaveLength(0);
    expect(toasts.at(-1).titulo).toBe('A edição digital não está à venda na app.');
    await juntar(p, variante('liv1-v0', { title: 'Impresso' }));
    expect(carrinho.cartItems).toHaveLength(1);
  });
});
