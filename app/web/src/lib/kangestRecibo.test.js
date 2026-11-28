// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  data, extenso, hora, kz, kzNum, montarDocumento, nomeDoDocumento, numero, pagamentosEntregues, pct, qtd, rodapeAgt, textoReimpressao,
} from './kangestRecibo';

const NB = ' ';

/** Uma resposta de GET /admin/kangest/documentos/ver, como a dá a Edge Function. */
const resposta = (impressao = {}, extra = {}) => ({
  documento: {
    id: 7, tipo_codigo: 'FR', numero_doc: 'FR K2026/15', data_emissao: '2026-11-25', data_hora: '2026-11-25T10:30:00',
    entidade_nome: 'Consumidor final', entidade_nif: '999999999', total_liquido: 10000, total_iva: 1400, total: 11400,
    estado: 'N', hash_controlo: 'aB3x', operador: 'Rui', importado: false, impressao, ...extra,
  },
  linhas: [
    { linha: 1, referencia: 'LIV-1', descricao: 'O Desejado', quantidade: 2, preco_unitario: 5000, desconto_pct: 0, taxa_iva_pct: 14, valor_liquido: 10000, valor_iva: 1400, total: 11400 },
  ],
  empresa: { nome: 'Livraria Adventista', nif: '5000000000', localidade: 'Huambo' },
  tipo: null,
  derivados: [],
});

describe('os números como o KanGest os imprime', () => {
  it('os milhares sempre separados, a vírgula decimal e sem «−0»', () => {
    expect(kzNum(820800)).toBe(`8${NB}208,00`);
    expect(kz(8299200)).toBe(`82${NB}992,00${NB}Kz`);
    expect(kzNum(-150)).toBe('−1,50');
    expect(numero(-0.0001, 2, 2)).toBe('0,00');
    expect(qtd(2)).toBe('2');
    expect(qtd(1.5)).toBe('1,5');
    expect(pct(14)).toBe('14%');
    expect(data('2026-11-25T10:30:00')).toBe('25/11/2026');
    expect(hora('2026-11-25T10:30:00')).toBe('10:30');
    expect(data(null)).toBe('—');
  });

  it('o valor por extenso, igual ao dos recibos do KanGest (lib/format.ts)', () => {
    expect(extenso(150000)).toBe('Mil quinhentos kwanzas');
    expect(extenso(100)).toBe('Um kwanza');
    expect(extenso(1140050)).toBe('Onze mil quatrocentos kwanzas e cinquenta cêntimos');
    expect(extenso(250000000)).toBe('Dois milhões quinhentos mil kwanzas');
    expect(extenso(10500)).toBe('Cento e cinco kwanzas');
  });
});

describe('o documento completo a partir da resposta do painel', () => {
  it('com a impressão do KanGest 1.4.11: o tipo, os pagamentos, a unidade e o IVA por taxa', () => {
    const d = montarDocumento(resposta({
      tipo_desc: 'Factura/Recibo', classe: 'VENDA', troco: 600, valor_entregue: 12000, certificado: '123/AGT/2024',
      pagamentos: [{ modo_codigo: 'NU', descricao: 'Numerário', valor: 11400 }],
      linhas: [{ linha: 1, unidade: 'UN', motivo_isencao: '' }],
    }));
    expect(d.completo).toBe(true);
    expect(d.documento).toMatchObject({ tipo_desc: 'Factura/Recibo', classe: 'VENDA', troco: 600, utilizador: 'Rui', moeda: 'AOA' });
    expect(d.linhas[0].unidade).toBe('UN');
    expect(d.resumo_iva).toEqual([{ taxa: 14, motivo_isencao: '', base: 10000, iva: 1400 }]);
    // o numerário mostra o que o cliente entregou (com o troco)
    expect(pagamentosEntregues(d)).toEqual([{ chave: 'NU-0', descricao: 'Numerário', valor: 12000 }]);
    expect(rodapeAgt(d.documento)).toBe('aB3x-Processado por programa válido n.º 123/AGT/2024/AGT');
  });

  it('de um posto antigo (sem impressão): o tipo pelo código e as linhas em «un»', () => {
    const d = montarDocumento(resposta({}));
    expect(d.completo).toBe(false);
    expect(d.documento.tipo_desc).toBe('Factura/Recibo');
    expect(d.linhas[0].unidade).toBe('un');
    expect(d.pagamentos).toEqual([]);
    expect(rodapeAgt(d.documento)).toBe('aB3x-Processado por programa válido n.º (por certificar)/AGT');
  });

  it('o histórico do KIGEST: o certificado do programa anterior', () => {
    const d = montarDocumento(resposta({ certificado: '45/AGT/2019' }, { importado: true }));
    expect(rodapeAgt(d.documento)).toBe('aB3x-Processado por programa válido n.º 45/AGT/2019');
    expect(rodapeAgt({ hash_controlo: '' })).toBe('');
  });

  it('um recibo: as liquidações e o tipo da fotografia das configurações', () => {
    const r = resposta({ liquidacoes: [{ numero_doc: 'FT K2026/3', data_emissao: '2026-11-01', total: 5000, valor: 5000 }] }, { tipo_codigo: 'XR' });
    r.tipo = { descricao: 'Recibo de Cliente', classe: 'RECIBO', prefixo_extenso: 'Recebemos a quantia de' };
    const d = montarDocumento(r);
    expect(d.documento).toMatchObject({ tipo_desc: 'Recibo de Cliente', classe: 'RECIBO', prefixo_extenso: 'Recebemos a quantia de' });
    expect(d.liquidacoes).toHaveLength(1);
  });

  it('o pagamento noutra moeda: o valor na moeda e o câmbio', () => {
    const d = montarDocumento(resposta({
      valor_entregue: 11400,
      pagamentos: [{ modo_codigo: 'NU', descricao: 'Numerário', valor: 11400, moeda: 'USD', valor_moeda: 1200, cambio: 9.5 }],
    }));
    expect(pagamentosEntregues(d)).toEqual([{ chave: 'USD-0', descricao: `Numerário USD 12,00 × 9,50`, valor: 11400 }]);
  });

  it('a 2.ª via e o nome do ficheiro', () => {
    expect(textoReimpressao('Ana', new Date(2026, 10, 28, 9, 5))).toBe('Reimpresso por Ana em 28/11/2026 09:05');
    const d = montarDocumento(resposta({}, { entidade_nome: 'Ana Silva', entidade_nif: '5000123456' }));
    expect(nomeDoDocumento(d)).toBe('Factura-Recibo FR K2026-15 — Ana Silva');
  });
});
