// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import KanGestFechoA4 from './KanGestFechoA4';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
async function mount(element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const FECHO = {
  numero_z: 12, posto: 'Balcão 1', aberta_em: '2026-11-28T08:00:00', fechada_em: '2026-11-28T18:00:00', operador: 'Ana', fechado_por: 'Rui',
  total_vendido: 300000, numerario_esperado: 250000, valor_contado: 249000, selo: 'abc123', reconstruido: false,
  resumo: {
    sessao: { valor_inicial: 50000, contagem: { 5000: 4, 1000: 9 } },
    por_modo: [{ codigo: 'NU', descricao: 'Numerário', total: 200000 }, { codigo: 'MB', descricao: 'Multicaixa', total: 100000 }, { codigo: 'TR', descricao: 'Transferência', total: 0 }],
    documentos: 3, entradas: 0, saidas: 0,
    artigos: [{ referencia: 'B1', descricao: 'Bíblia', quantidade: 2, total: 300000 }],
    documentos_lista: [{ numero_doc: 'FR T/1', data_hora: '2026-11-28T09:15:00', estado: 'N', pagamento: 'Numerário', total: 200000 }],
    movimentos: [],
    analise: {
      resumo: { vendas: 2, vendido: 300000, devolucoes: 1, devolvido: 5000, com_desconto: 0, descontos: 0, primeira: '2026-11-28T09:15:00', ultima: '2026-11-28T10:15:00' },
      por_tipo: [{ codigo: 'NC', descricao: 'Nota de Crédito', documentos: 1, anulados: 0, total: -5000 }],
      por_operador: [{ nome: 'Ana', documentos: 3, total: 295000 }],
      por_hora: [{ hora: '09', documentos: 1, total: 200000 }],
      por_familia: [{ familia: 'Bíblias', quantidade: 2, total: 300000 }],
      iva: [{ taxa: 14, motivo_isencao: '', base: 263158, iva: 36842 }],
      anulados: [{ numero_doc: 'FR T/3', data_hora: '2026-11-28T11:15:00', total: 700, motivo: 'Erro no preço' }],
    },
  },
};

describe('o relatório completo do fecho no site, como o KanGest o imprime', () => {
  it('a gaveta, a contagem, as análises, os artigos e o selo', async () => {
    await mount(<KanGestFechoA4 f={FECHO} loja="Livraria do Huambo" />);
    const t = host.textContent;
    for (const s of ['Livraria do Huambo', 'FECHO DE CAIXA (Z) N.º 12', 'Fechado por', 'Rui', 'Multicaixa', 'Diferença (falta)', '−10,00',
      'Contagem do numerário', 'Resumo das vendas', 'Valor médio por venda', '1 500,00', 'Devoluções (1)', 'Por tipo de documento', 'NC Nota de Crédito',
      'Por operador', 'Por hora', '09h', 'Por família', 'Bíblias', 'IVA 14%', 'Documentos anulados', 'Erro no preço', 'Artigos vendidos',
      'Documentos da sessão', 'selo SHA-256 do arquivo: abc123']) {
      expect(t.replace(/ /g, ' '), s).toContain(s);
    }
    // uma forma de pagamento sem nada não aparece
    expect(t).not.toContain('Transferência');
  });

  it('um fecho antes da 1.4.11 mostra-se sem as análises', async () => {
    await mount(<KanGestFechoA4 f={{ ...FECHO, resumo: { ...FECHO.resumo, analise: undefined } }} loja="" />);
    expect(host.textContent).not.toContain('Resumo das vendas');
    expect(host.textContent).toContain('Recebimentos por forma de pagamento');
  });
});
