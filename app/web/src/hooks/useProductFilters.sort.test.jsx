// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A ordenação da loja e a ordenação por omissão das Configurações.
 *
 * As Configurações chegam por pedido, depois do primeiro desenho: até lá o site usa os valores
 * por omissão. Quem abre `/shop` directamente monta a loja **antes** de elas chegarem; quem
 * vem da página inicial monta-a depois. A ordenação escolhida no painel ("Ordenação por
 * defeito") tem de valer nos dois casos — e só enquanto ninguém escolheu outra.
 */

vi.mock('@/api/EcommerceApi', () => ({
  getProducts: async () => ({ products: [], total: 0 }),
  getCategories: async () => ({ categories: [] }),
  getBookCollections: async () => [],
}));

const { useProductFilters } = await import('./useProductFilters');

let host;
let root;
let estado;
let endereco;

function Sonda({ defaultSort }) {
  estado = useProductFilters(null, { defaultSort });
  endereco = useLocation().search;
  return null;
}

const montar = async (url, defaultSort) => {
  await act(async () => root.render(
    <MemoryRouter initialEntries={[url]}><Sonda defaultSort={defaultSort} /></MemoryRouter>,
  ));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
/** As Configurações chegam: o mesmo componente, com outra ordenação por omissão. */
const chegamAsConfiguracoes = async (url, defaultSort) => montar(url, defaultSort);

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('ordenação por omissão das Configurações', () => {
  it('vale mesmo quando as Configurações chegam depois de a loja abrir', async () => {
    await montar('/shop', 'featured');
    expect(estado.sortBy).toBe('featured');
    await chegamAsConfiguracoes('/shop', 'newest');
    expect(estado.sortBy).toBe('newest');
  });

  it('seguir a predefinição não a escreve no endereço', async () => {
    await montar('/shop', 'featured');
    await chegamAsConfiguracoes('/shop', 'newest');
    expect(endereco).not.toContain('sort=');
  });

  it('o que vem no endereço ganha à predefinição', async () => {
    await montar('/shop?sort=price-low', 'featured');
    await chegamAsConfiguracoes('/shop?sort=price-low', 'newest');
    expect(estado.sortBy).toBe('price-low');
    expect(endereco).toContain('sort=price-low');
  });

  it('depois de a pessoa escolher, a predefinição já não mexe', async () => {
    await montar('/shop', 'featured');
    await act(async () => estado.setSortBy('title'));
    await chegamAsConfiguracoes('/shop', 'newest');
    expect(estado.sortBy).toBe('title');
  });

  it('escolher a própria predefinição não a escreve no endereço', async () => {
    await montar('/shop', 'newest');
    await act(async () => estado.setSortBy('newest'));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(endereco).not.toContain('sort=');
  });
});
