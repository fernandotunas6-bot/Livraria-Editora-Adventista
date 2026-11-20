// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CART_EVENT, requestCartOpen } from '@/lib/mobileNav';

// O painel verdadeiro (checkout inteiro) fica de fora: o que se testa aqui é quando é montado.
const panelProps = [];
vi.mock('@/components/ShoppingCartPanel.jsx', () => ({
  default: (props) => {
    panelProps.push(props);
    return <div data-testid="painel">{props.isCartOpen ? 'aberto' : 'fechado'}</div>;
  },
}));
vi.mock('@/hooks/useAfterLoad', () => ({ useAfterLoad: () => false }));

const { default: ShoppingCart } = await import('./ShoppingCart');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  panelProps.length = 0;
});

async function render(ui) {
  if (!root) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => root.render(ui));
  // O React.lazy resolve-se numa microtarefa a seguir.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe('ShoppingCart (o invólucro que carrega o painel quando é preciso)', () => {
  it('fechado e nunca aberto, não monta o painel', async () => {
    root = null;
    await render(<ShoppingCart isCartOpen={false} setIsCartOpen={() => {}} />);
    expect(host.querySelector('[data-testid="painel"]')).toBeNull();
    expect(panelProps).toHaveLength(0);
  });

  it('ao abrir, monta o painel com as mesmas propriedades', async () => {
    root = null;
    const setOpen = vi.fn();
    await render(<ShoppingCart isCartOpen={false} setIsCartOpen={setOpen} />);
    await render(<ShoppingCart isCartOpen setIsCartOpen={setOpen} />);
    expect(host.querySelector('[data-testid="painel"]').textContent).toBe('aberto');
    expect(panelProps.at(-1).setIsCartOpen).toBe(setOpen);
  });

  it('responde à barra inferior antes de o painel existir', async () => {
    root = null;
    const setOpen = vi.fn();
    await render(<ShoppingCart isCartOpen={false} setIsCartOpen={setOpen} />);
    let handled;
    await act(async () => { handled = requestCartOpen(); });
    expect(handled).toBe(true);
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it('depois de montado o painel, deixa de responder ao evento (responde o painel)', async () => {
    root = null;
    const setOpen = vi.fn();
    await render(<ShoppingCart isCartOpen setIsCartOpen={setOpen} />);
    const spy = vi.fn();
    window.addEventListener(OPEN_CART_EVENT, spy);
    await act(async () => { requestCartOpen(); });
    window.removeEventListener(OPEN_CART_EVENT, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(setOpen).not.toHaveBeenCalled();
  });
});
