// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const lista = vi.fn();
const ver = vi.fn();
vi.mock('@/api/PlatformApi', () => ({ kangestDocumentos: (...a) => lista(...a), kangestDocumento: (...a) => ver(...a) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { name: 'Ana' } }) }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [{ id: 'huambo', name: 'Livraria do Huambo' }] }) }) }) },
}));

const { default: KanGestDocumentos } = await import('./KanGestDocumentos');

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

const DOC = {
  id: 7, tipo_codigo: 'FR', numero_doc: 'FR K2026/15', data_emissao: '2026-11-25', data_hora: '2026-11-25T10:30:00', store_id: 'huambo',
  cliente: 'Ana Silva', total: 11400, estado: 'N', cadeia: 'certa', importado: false, operador: 'Rui', tipo_desc: 'Factura/Recibo',
};

describe('os documentos do KanGest no painel', () => {
  it('lista os documentos e abre um como o KanGest o imprime, no talão ou no A4', async () => {
    lista.mockResolvedValue({ documentos: [DOC], total: 1, pagina: 0, por_pagina: 50 });
    ver.mockResolvedValue({
      documento: { ...DOC, entidade_nome: 'Ana Silva', entidade_nif: '5000123456', total_liquido: 10000, total_iva: 1400, hash_controlo: 'aB3x', impressao: {} },
      linhas: [{ linha: 1, referencia: 'LIV-1', descricao: 'O Desejado', quantidade: 2, preco_unitario: 5000, taxa_iva_pct: 14, valor_liquido: 10000, valor_iva: 1400, total: 11400 }],
      empresa: null, derivados: [], loja: { id: 'huambo', name: 'Livraria do Huambo' }, posto: { nome: 'Balcão 1' },
    });
    await mount(<KanGestDocumentos />);
    expect(lista).toHaveBeenCalledWith(expect.objectContaining({ pagina: 0, loja: '', q: '' }));
    expect(host.textContent).toContain('FR K2026/15');
    expect(host.textContent).toContain('Ana Silva');
    expect(host.textContent).toContain('Livraria do Huambo · Rui');

    await act(async () => host.querySelector('tbody tr').click());
    await flush();
    expect(ver).toHaveBeenCalledWith(7);
    const janela = document.body.querySelector('[role="dialog"]');
    expect(janela.textContent).toContain('2.ª via em conformidade com o original');
    expect(janela.textContent).toContain('Reimpresso por Ana');
    // um documento de um posto antigo avisa o que não veio
    expect(janela.textContent).toContain('antes da 1.4.11');
    const a4 = [...janela.querySelectorAll('button')].find((b) => b.textContent === 'A4');
    await act(async () => a4.click());
    expect(janela.textContent).toContain('Exmo(s) Senhor(es)');
    expect(a4.getAttribute('aria-pressed')).toBe('true');
  });

  it('a pesquisa e os filtros vão para o servidor', async () => {
    lista.mockResolvedValue({ documentos: [], total: 0, pagina: 0, por_pagina: 50 });
    await mount(<KanGestDocumentos />);
    expect(host.textContent).toContain('Nenhum documento neste período');
    const caixa = host.querySelector('input[placeholder^="FR"]');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(caixa, '5000123456');
      caixa.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(lista).toHaveBeenLastCalledWith(expect.objectContaining({ q: '5000123456', pagina: 0 }));
  });
});
