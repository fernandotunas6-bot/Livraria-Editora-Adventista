import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const PRODUTOS = [
  { id: 'a', title: 'O Caminho a Cristo', book_code: 'LIV-001', product_type: 'livro', active: true },
  { id: 'b', title: 'Bíblia de Estudo', book_code: 'BIB-002', product_type: 'biblia', active: false },
  { id: 'd', title: 'Revista em PDF', book_code: 'REV-003', product_type: 'revista', active: true, digital: true },
];
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ order: async () => ({ data: PRODUTOS, error: null }) }) }) },
}));

const real = await vi.importActual('@/lib/storeStock');
const api = { ...real, lojasQuePossoMarcar: vi.fn(), marcasDaLoja: vi.fn(), marcar: vi.fn() };
vi.mock('@/lib/storeStock', () => api);
const { default: StoreStockTab } = await import('./StoreStockTab');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const linha = (titulo) => [...host.querySelectorAll('li')].find((li) => li.textContent.includes(titulo));
const botao = (el, texto) => [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<StoreStockTab />));
  await flush();
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  toast.mockReset();
  api.lojasQuePossoMarcar.mockReset().mockResolvedValue([{ id: 'lub', name: 'Livraria Adventista — Lubango', active: true }]);
  api.marcasDaLoja.mockReset().mockResolvedValue(new Map([['a', true]]));
  api.marcar.mockReset().mockResolvedValue(1);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('Disponibilidade nas lojas', () => {
  it('mostra os produtos com stock (sem os só digitais) e o estado de cada um na loja', async () => {
    await mount();
    expect(api.marcasDaLoja).toHaveBeenCalledWith('lub');
    expect(host.textContent).toContain('Livraria Adventista — Lubango');
    expect(linha('O Caminho a Cristo')).toBeTruthy();
    expect(linha('Bíblia de Estudo').textContent).toContain('Oculto no site');
    expect(linha('Revista em PDF')).toBeUndefined();
    expect(botao(linha('O Caminho a Cristo'), 'Temos').getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('Temos: 1');
    expect(host.textContent).toContain('Por marcar: 1');
  });

  it('marcar «Não temos» grava logo; carregar outra vez volta a «por marcar»', async () => {
    await mount();
    await act(async () => botao(linha('Bíblia de Estudo'), 'Não temos').click());
    await flush();
    expect(api.marcar).toHaveBeenLastCalledWith('lub', ['b'], false);
    expect(botao(linha('Bíblia de Estudo'), 'Não temos').getAttribute('aria-pressed')).toBe('true');
    await act(async () => botao(linha('Bíblia de Estudo'), 'Não temos').click());
    await flush();
    expect(api.marcar).toHaveBeenLastCalledWith('lub', ['b'], null);
  });

  it('se a base de dados recusar, a marca volta atrás e diz porquê', async () => {
    api.marcar.mockRejectedValue(new Error('Sem permissão para marcar o stock desta loja.'));
    await mount();
    await act(async () => botao(linha('O Caminho a Cristo'), 'Não temos').click());
    await flush();
    expect(botao(linha('O Caminho a Cristo'), 'Temos').getAttribute('aria-pressed')).toBe('true');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Sem permissão para marcar o stock desta loja.' }));
  });

  it('vários de uma vez: seleccionar todos e marcar «Temos»', async () => {
    await mount();
    const todos = host.querySelector('button[aria-label="Seleccionar todos os da lista"]');
    await act(async () => todos.click());
    await flush();
    expect(host.textContent).toContain('2 seleccionados');
    const barra = [...host.querySelectorAll('div')].find((d) => d.textContent.startsWith('2 seleccionados'));
    await act(async () => botao(barra, 'Temos').click());
    await flush();
    expect(api.marcar).toHaveBeenLastCalledWith('lub', expect.arrayContaining(['a', 'b']), true);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '2 produtos: «temos»' }));
  });

  it('sem nenhuma loja, explica que falta ligar a ficha de funcionário a uma loja', async () => {
    api.lojasQuePossoMarcar.mockResolvedValue([]);
    await mount();
    expect(host.textContent).toContain('A sua conta ainda não está ligada a nenhuma loja.');
    expect(api.marcasDaLoja).not.toHaveBeenCalled();
  });
});
