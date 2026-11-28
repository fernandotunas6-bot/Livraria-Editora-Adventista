// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Os documentos do KanGest no painel, como o KanGest os imprime (pedido do dono a 27/11: «implementar o estilo de
// recibos do KanGest na livraria, e a lógica de visualizar os recibos igual à do KanGest»). As regras são as do
// KanGest (app/kangest-sistema/src/lib/format.ts e components/DocumentoPrint.tsx): os mesmos números, as mesmas
// linhas do talão e do A4, a mesma 2.ª via. Os valores vêm em cêntimos de kwanza.

/**
 * Um número à portuguesa, com os milhares SEMPRE separados por um espaço que não parte a linha («8 208,00» ao lado de
 * «82 992,00») e sem «−0».
 */
export function numero(v, maxDec = 3, minDec = 0) {
  const n = Number(v) || 0;
  const arred = Math.round(n * 10 ** maxDec) / 10 ** maxDec;
  const f = new Intl.NumberFormat('en-US', { minimumFractionDigits: minDec, maximumFractionDigits: maxDec, useGrouping: true });
  return f.format(arred === 0 ? 0 : n).replace(/,/g, ' ').replace('.', ',').replace('-', '−');
}

export const kzNum = (c) => numero((Number(c) || 0) / 100, 2, 2);
export const kz = (c) => `${kzNum(c)} Kz`;
export const qtd = (n) => numero(n ?? 0, 3);
export const pct = (n) => `${numero(n ?? 0, 3)}%`;

/** «2026-11-25» → «25/11/2026». */
export function data(d) {
  if (!d) return '—';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
}
export const hora = (dh) => (dh && String(dh).length >= 16 ? String(dh).slice(11, 16) : '');

/** O valor por extenso (Kwanzas), como no KanGest: «São: Mil e quinhentos kwanzas». */
export function extenso(centimos) {
  const u = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = (n) => {
    if (n === 100) return 'cem';
    const partes = [];
    if (n >= 100) partes.push(c[Math.floor(n / 100)]);
    const r = n % 100;
    if (r >= 20) partes.push(d[Math.floor(r / 10)] + (r % 10 ? ` e ${u[r % 10]}` : ''));
    else if (r > 0) partes.push(u[r]);
    return partes.join(' e ');
  };
  const grupo = (n) => {
    if (n === 0) return 'zero';
    const escalas = [[1e9, 'mil milhões', 'mil milhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']];
    const partes = [];
    let resto = n;
    for (const [v, s, p] of escalas) {
      const q = Math.floor(resto / v);
      if (q) {
        partes.push(v === 1e3 && q === 1 ? 'mil' : `${ate999(q)} ${q === 1 ? s : p}`);
        resto %= v;
      }
    }
    if (resto) partes.push(ate999(resto));
    return partes.join(partes.length > 1 && resto && resto < 100 ? ' e ' : ' ');
  };
  const abs = Math.abs(Math.round(Number(centimos) || 0));
  const kzInt = Math.floor(abs / 100);
  const cents = abs % 100;
  let s = `${grupo(kzInt)} ${kzInt === 1 ? 'kwanza' : 'kwanzas'}`;
  if (cents) s += ` e ${ate999(cents)} ${cents === 1 ? 'cêntimo' : 'cêntimos'}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Os nomes dos tipos de documento do KanGest, para um documento que chegou sem eles (de um posto antes da 1.4.11). */
export const TIPOS = {
  FR: ['Factura/Recibo', 'VENDA'], FT: ['Factura', 'VENDA'], NC: ['Nota de Crédito', 'VENDA'], ND: ['Nota de Débito', 'VENDA'],
  RC: ['Recibo', 'RECIBO'], PP: ['Factura Proforma', 'PROFORMA'], OR: ['Orçamento', 'PROFORMA'], NE: ['Nota de Encomenda', 'PROFORMA'],
  GT: ['Guia de Transporte', 'TRANSPORTE'], RA: ['Recibo de Adiantamento', 'ADIANTAMENTO'], VD: ['Venda a Dinheiro', 'VENDA'],
};

export const MOTIVO_TXT = { M00: 'Regime Transitório', M02: 'Transmissão de bens e serviço não sujeita', M04: 'IVA – Regime de Não Sujeição' };

export const ehRecibo = (classe) => classe === 'RECIBO' || classe === 'PAGAMENTO';
export const naoServeFactura = (classe) => classe === 'PROFORMA' || ehRecibo(classe) || classe === 'TRANSPORTE';
export const consumidorFinal = (nif) => !nif || nif === '999999999';

/**
 * A resposta do painel (GET /admin/kangest/documentos/ver) com a forma do documento completo do KanGest (DocCompleto):
 * o documento com o tipo, os totais e o operador; as linhas com a unidade e a isenção; os pagamentos; as liquidações
 * de um recibo; o resumo do IVA por taxa; e a empresa, da última fotografia das configurações do posto.
 */
export function montarDocumento(r) {
  const doc = r?.documento || {};
  const imp = doc.impressao && typeof doc.impressao === 'object' ? doc.impressao : {};
  const [descTipo, classeTipo] = TIPOS[doc.tipo_codigo] || [doc.tipo_codigo || 'Documento', 'VENDA'];
  const extras = new Map((imp.linhas || []).map((l) => [Number(l.linha), l]));
  const linhas = (r?.linhas || []).map((l) => {
    const x = extras.get(Number(l.linha)) || {};
    return { ...l, id: l.linha, unidade: x.unidade || 'un', motivo_isencao: x.motivo_isencao || '', lote: x.lote || '', validade: x.validade || '' };
  });
  const totalDesconto = Number(imp.total_desconto) || 0;
  const documento = {
    ...doc,
    tipo_desc: imp.tipo_desc || r?.tipo?.descricao || descTipo,
    classe: imp.classe || r?.tipo?.classe || classeTipo,
    prefixo_extenso: imp.prefixo_extenso || r?.tipo?.prefixo_extenso || '',
    texto_rodape: imp.texto_rodape || r?.tipo?.texto_rodape || '',
    formato: r?.tipo?.formato === 'A5' ? 'A5' : 'A4',
    total_bruto: Number(imp.total_bruto) || Number(doc.total_liquido) + totalDesconto,
    total_desconto: totalDesconto,
    total_retencao: Number(imp.total_retencao) || 0,
    valor_entregue: Number(imp.valor_entregue) || 0,
    troco: Number(imp.troco) || 0,
    moeda: imp.moeda || 'AOA',
    cambio: imp.cambio ?? null,
    total_moeda: imp.total_moeda ?? null,
    motivo: imp.motivo || '',
    utilizador: doc.operador || '',
    data_vencimento: doc.vencimento || null,
    certificado: imp.certificado || '',
  };
  // o quadro do IVA (obrigatório na factura): a base e o imposto por taxa e por isenção
  const porTaxa = new Map();
  for (const l of linhas) {
    const k = `${Number(l.taxa_iva_pct)}|${l.motivo_isencao}`;
    const a = porTaxa.get(k) || { taxa: Number(l.taxa_iva_pct) || 0, motivo_isencao: l.motivo_isencao, base: 0, iva: 0 };
    a.base += Number(l.valor_liquido) || 0;
    a.iva += Number(l.valor_iva) || 0;
    porTaxa.set(k, a);
  }
  return {
    documento,
    linhas,
    pagamentos: imp.pagamentos || [],
    liquidacoes: imp.liquidacoes || [],
    resumo_iva: [...porTaxa.values()].sort((a, b) => b.taxa - a.taxa),
    empresa: r?.empresa || null,
    origem: r?.origem || null,
    derivados: r?.derivados || [],
    posto: r?.posto || null,
    loja: r?.loja || null,
    completo: Object.keys(imp).length > 0,
  };
}

/**
 * A linha da certificação no fundo do documento, como no KanGest: os 4 caracteres do hash e o n.º do certificado. Um
 * documento importado foi processado pelo programa anterior (KIGEST).
 */
export function rodapeAgt(doc) {
  const ctrl = doc?.hash_controlo;
  if (!ctrl) return '';
  const cert = (doc.certificado || '').trim();
  if (doc.importado) return `${ctrl}-Processado por programa válido n.º ${cert || '(KIGEST)'}`;
  return `${ctrl}-Processado por programa válido n.º ${cert || '(por certificar)'}/AGT`;
}

/**
 * As linhas «modo de pagamento» do talão com o que o cliente entregou: o numerário em kwanzas soma o troco; o recebido
 * noutra moeda aparece com o valor na moeda e o câmbio.
 */
export function pagamentosEntregues(d) {
  const doc = d.documento;
  const bruto = (p) => Math.round((Number(p.valor_moeda) || 0) * (Number(p.cambio) || 0));
  const estrangeiros = d.pagamentos.filter((p) => p.moeda && p.moeda !== 'AOA');
  if (!estrangeiros.length) {
    return d.pagamentos.map((p, i) => ({ chave: `${p.modo_codigo}-${i}`, descricao: p.descricao || p.modo_codigo, valor: Number(p.valor) + (p.modo_codigo === 'NU' ? doc.troco : 0) }));
  }
  const outros = d.pagamentos.filter((p) => !(p.moeda && p.moeda !== 'AOA') && p.modo_codigo !== 'NU').reduce((s, p) => s + Number(p.valor), 0);
  const kzNotas = Math.max(0, doc.valor_entregue - outros - estrangeiros.reduce((s, p) => s + bruto(p), 0));
  return d.pagamentos.map((p, i) => (p.moeda && p.moeda !== 'AOA'
    ? { chave: `${p.moeda}-${i}`, descricao: `Numerário ${p.moeda} ${kzNum(p.valor_moeda)} × ${numero(p.cambio, 2, 2)}`, valor: bruto(p) }
    : { chave: `${p.modo_codigo}-${i}`, descricao: p.descricao || p.modo_codigo, valor: p.modo_codigo === 'NU' ? kzNotas : Number(p.valor) }));
}

/** A frase da reimpressão, como no KanGest: «Reimpresso por Ana em 28/11/2026 10:15». */
export function textoReimpressao(quem, quando = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const dataHora = `${p(quando.getDate())}/${p(quando.getMonth() + 1)}/${quando.getFullYear()} ${p(quando.getHours())}:${p(quando.getMinutes())}`;
  return `Reimpresso${quem ? ` por ${quem}` : ''} em ${dataHora}`;
}

/** O nome do ficheiro ao guardar como PDF: «Factura-Recibo FR A2026-15 — Ana Silva». */
export function nomeDoDocumento(d) {
  const doc = d.documento;
  const cliente = !consumidorFinal(doc.entidade_nif) && doc.entidade_nome ? ` — ${doc.entidade_nome}` : '';
  return `${doc.tipo_desc} ${doc.numero_doc}${cliente}`.replace(/[\\/:*?"<>|]+/g, '-');
}

/** A localização como no KIGEST: «Huambo - Angola». */
export const local = (e) => `${e?.localidade || e?.provincia || 'Luanda'} - Angola`;
