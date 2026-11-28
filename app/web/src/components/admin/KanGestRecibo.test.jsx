// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { montarDocumento } from '@/lib/kangestRecibo';
import { FolhaA4, Talao } from './KanGestRecibo';

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

const d = montarDocumento({
  documento: {
    id: 7, tipo_codigo: 'FR', numero_doc: 'FR K2026/15', data_emissao: '2026-11-25', data_hora: '2026-11-25T10:30:00',
    entidade_nome: 'Ana Silva', entidade_nif: '5000123456', total_liquido: 10000, total_iva: 1400, total: 11400, estado: 'A',
    hash_controlo: 'aB3x', operador: 'Rui', importado: false,
    impressao: {
      tipo_desc: 'Factura/Recibo', classe: 'VENDA', troco: 600, valor_entregue: 12000, certificado: '123/AGT/2024',
      pagamentos: [{ modo_codigo: 'NU', descricao: 'Numerário', valor: 11400 }], linhas: [{ linha: 1, unidade: 'UN', motivo_isencao: '' }],
    },
  },
  linhas: [{ linha: 1, referencia: 'LIV-1', descricao: 'O Desejado', quantidade: 2, preco_unitario: 5000, taxa_iva_pct: 14, valor_liquido: 10000, valor_iva: 1400, total: 11400 }],
  empresa: { nome: 'Livraria Adventista', nif: '5000000000', localidade: 'Huambo', logo: '(ficheiro com 900000 bytes)', rodape: 'Deus o abençoe' },
});

describe('os documentos do KanGest como o KanGest os imprime', () => {
  it('o talão: a 2.ª via, o cliente, as linhas, o pagamento com o troco e a certificação', async () => {
    await mount(<Talao d={d} via="2.ª via" reimpressao="Reimpresso por Ana em 28/11/2026 09:05" />);
    const t = host.textContent;
    for (const s of ['2.ª via em conformidade com o original', 'Factura/Recibo', 'FR K2026/15', 'Cliente: Ana Silva', 'NIF 5000123456',
      'O Desejado', '2 UN × 50,00 · IVA 14%', 'Numerário', '120,00', 'Troco', '6,00', '*** DOCUMENTO ANULADO ***',
      'aB3x-Processado por programa válido n.º 123/AGT/2024/AGT', 'Emitido por Rui', 'Reimpresso por Ana', 'Deus o abençoe']) {
      expect(t, s).toContain(s);
    }
    // o logótipo que não veio (marcado como ficheiro grande) não se mostra
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-ficheiro]').getAttribute('data-ficheiro')).toBe('Factura-Recibo FR K2026-15 — Ana Silva');
  });

  it('o A4: a faixa, as linhas, o resumo do imposto, o método de pagamento e o valor por extenso', async () => {
    await mount(<FolhaA4 d={d} via="2.ª via" />);
    const t = host.textContent;
    for (const s of ['V/ Nº Contrib.', '5000123456', 'Exmo(s) Senhor(es)', 'Ana Silva', 'Resumo de imposto', 'Método de pagamento',
      'Total do documento', '114,00', 'São: Cento e catorze kwanzas', 'Operador : Rui', 'Huambo - Angola', 'DOCUMENTO ANULADO']) {
      expect(t, s).toContain(s);
    }
  });
});
