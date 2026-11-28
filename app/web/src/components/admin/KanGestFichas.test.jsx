// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const lista = vi.fn();
const ver = vi.fn();
vi.mock('@/api/PlatformApi', () => ({
  kangestFichas: (...a) => lista(...a), kangestFicha: (...a) => ver(...a), kangestDocumentos: vi.fn(), kangestDocumento: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { name: 'Ana' } }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) }) } }));

const { default: KanGestFichas } = await import('./KanGestFichas');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  lista.mockReset();
  ver.mockReset();
});

const POSTO = '11111111-1111-4111-8111-111111111111';

describe('as fichas do balcão no painel', () => {
  it('os clientes: a lista, e a ficha com os contactos e os documentos em dívida', async () => {
    lista.mockResolvedValue({
      fichas: [{ posto_id: POSTO, chave: 7, posto: 'Balcão Huambo', dados: { nome: 'Ana Silva', tipo: 'C', localidade: 'Huambo', ativo: 1 } }],
      total: 1, pagina: 0, por_pagina: 50,
    });
    ver.mockResolvedValue({
      tipo: 'entidade', chave: 7, dados: { nome: 'Ana Silva', tipo: 'C', localidade: 'Huambo', limite_credito: 5000000, ativo: 1 },
      pessoais: { nif: '5000123456', telefone: '923000000' },
      documentos: [{ id: 9, numero_doc: 'FT K2026/3', data_emissao: '2026-11-20', total: 114000, estado: 'N', valor_pendente: 50000 }],
      documentos_total: 1, em_divida: 50000,
    });
    await mount(<KanGestFichas />);
    expect(lista).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'entidade', pagina: 0 }));
    expect(host.textContent).toContain('Ana Silva');
    expect(host.textContent).toContain('Balcão Huambo');
    await act(async () => host.querySelector('tbody tr').click());
    await flush();
    expect(ver).toHaveBeenCalledWith(POSTO, 'entidade', 7);
    const janela = document.body.querySelector('[role="dialog"]');
    const t = janela.textContent.replace(/ /g, ' ');
    for (const s of ['Limite de crédito', '50 000,00 Kz', 'NIF', '5000123456', '923000000', 'Documentos (1)', 'em dívida 500,00 Kz', 'FT K2026/3', 'falta 500,00 Kz']) {
      expect(t, s).toContain(s);
    }
  });

  it('a procura e o filtro dos fornecedores vão para o servidor', async () => {
    lista.mockResolvedValue({ fichas: [], total: 0, pagina: 0, por_pagina: 50 });
    await mount(<KanGestFichas />);
    expect(host.textContent).toContain('Nenhuma ficha');
    const select = host.querySelector('select');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'F');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(lista).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'entidade', classe: 'F' }));
  });
});
