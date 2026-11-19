// Ligação ao KanGest, o programa de facturação das livrarias (docs/KANGEST.md).
//
// Configuração: o segredo KANGEST_LIGACOES (JSON, nunca no repositório), uma entrada por KanGest —
// um só, se as livrarias partilham um servidor central (cada loja é um armazém), ou um por loja:
//
//   [{ "id": "huambo", "url": "https://huambo.exemplo.ao/api/v1", "chave": "kg_…", "segredo": "whsec_…",
//      "lojas": { "<id da loja em physical_stores>": 1 }, "armazens_online": [1],
//      "portes": "PORTES", "generico": "DIGITAL", "pagamentos": { "multicaixa_express": "MB" } }]
//
// Este ficheiro não toca no Deno nem na base de dados directamente: recebe o cliente e o `fetch`, para os testes.

export type Ligacao = {
  id: string;
  url: string;
  chave: string;
  /** Segredo dos avisos (webhooks) deste KanGest: whsec_… */
  segredo?: string;
  /** Loja do site (physical_stores.id) → armazém do KanGest onde ela vende e reserva. */
  lojas?: Record<string, number>;
  /** Armazéns cujo disponível se vende no site (omitido = todos). */
  armazens_online?: number[];
  /** A ligação das encomendas sem loja (ou de lojas que nenhuma outra tem). */
  padrao?: boolean;
  /** Referência do artigo dos portes de envio no KanGest. */
  portes?: string;
  /** Referência de um artigo genérico para produtos sem referência do KanGest (edições digitais…). */
  generico?: string;
  /** payment_method_code ou payment_category do site → modo de pagamento do KanGest (NU, MB, TB…). */
  pagamentos?: Record<string, string>;
  /** O KanGest manda nos preços do site (por omissão, sim). */
  precos?: boolean;
};

type Row = Record<string, any>;

export class ErroKanGest extends Error {
  constructor(message: string, public status = 0, public codigo = "", public definitivo = false) {
    super(message);
  }
}

/** Lê e confere KANGEST_LIGACOES. Vazio = ligação desligada ([]). */
export function lerLigacoes(texto: string | undefined | null): Ligacao[] {
  if (!texto || !texto.trim()) return [];
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    throw new Error("KANGEST_LIGACOES não é JSON válido.");
  }
  const lista = Array.isArray(v) ? v : [v];
  const ids = new Set<string>();
  return lista.map((l: any, i) => {
    const id = String(l?.id ?? "").trim();
    const url = String(l?.url ?? "").trim().replace(/\/+$/, "");
    const chave = String(l?.chave ?? "").trim();
    if (!/^[a-z0-9_-]{1,40}$/i.test(id)) throw new Error(`KANGEST_LIGACOES[${i}]: id inválido.`);
    if (ids.has(id)) throw new Error(`KANGEST_LIGACOES: o id ${id} aparece duas vezes.`);
    ids.add(id);
    if (!/^https:\/\/[^\s]+\/api\/v1$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/api\/v1$/.test(url)) {
      throw new Error(`KANGEST_LIGACOES[${id}]: o url tem de ser https://…/api/v1.`);
    }
    if (!/^kg_[A-Za-z0-9]{48}$/.test(chave)) throw new Error(`KANGEST_LIGACOES[${id}]: chave da API inválida.`);
    return { ...l, id, url, chave } as Ligacao;
  });
}

/** O KanGest e o armazém de uma encomenda: o que tem a loja dela; senão o padrão (ou o primeiro). */
export function ligacaoDaEncomenda(ligs: Ligacao[], order: Row): { ligacao: Ligacao; armazem_id?: number } | null {
  if (!ligs.length) return null;
  const loja = String(order.store_id || order.pickup_store_id || "");
  if (loja) {
    for (const l of ligs) {
      const a = l.lojas?.[loja];
      if (a) return { ligacao: l, armazem_id: Number(a) };
    }
  }
  return { ligacao: ligs.find((l) => l.padrao) ?? ligs[0] };
}

const centimos = (kz: unknown) => Math.round(Number(kz || 0) * 100);
const nifValido = (n: unknown) => /^[A-Z0-9]{9,14}$/i.test(String(n ?? "").trim());

/**
 * Corpo da nota de encomenda (NE) de uma encomenda do site. `refs`: book_id → referência do artigo no KanGest
 * (stock_books.kigest_ref). Preços com IVA, como o site os cobrou (promoções incluídas); os portes numa linha.
 * Devolve os erros em vez de lançar: uma linha sem artigo no KanGest pede uma decisão de alguém.
 */
export function corpoNE(order: Row, refs: Map<string, string>, lig: Ligacao, armazem_id?: number): { corpo: Row; erros: string[] } {
  const erros: string[] = [];
  const linhas: Row[] = [];
  for (const it of Array.isArray(order.items) ? order.items : []) {
    const qtd = Number(it?.quantity || 0);
    if (!(qtd > 0)) continue;
    const titulo = String(it.title || it.book_code || it.book_id || "produto");
    const digital = String(it.digital ?? "") === "true" || it.digital === true;
    const ref = digital ? "" : (refs.get(String(it.book_id)) || "").trim();
    const preco = centimos(it.price);
    if (ref) linhas.push({ referencia: ref, quantidade: qtd, preco_com_iva: preco });
    else if (lig.generico) linhas.push({ referencia: lig.generico, quantidade: qtd, preco_com_iva: preco, descricao: titulo.slice(0, 200) });
    else erros.push(`«${titulo}» não tem artigo no KanGest (referência em stock_books.kigest_ref, ou um artigo genérico na ligação).`);
  }
  const portes = centimos(order.shipping_cost);
  if (portes > 0) {
    if (lig.portes) linhas.push({ referencia: lig.portes, quantidade: 1, preco_com_iva: portes, descricao: "Portes de envio" });
    else erros.push("A encomenda tem portes e a ligação não indica o artigo dos portes («portes»).");
  }
  if (!linhas.length && !erros.length) erros.push("A encomenda não tem linhas.");
  const numero = String(order.order_number || order.id);
  const corpo: Row = { tipo: "NE", referencia: numero, linhas, observacoes: `Loja online · encomenda ${numero}`.slice(0, 200) };
  if (armazem_id) corpo.armazem_id = armazem_id;
  if (nifValido(order.customer_nif)) {
    corpo.cliente = {
      nif: String(order.customer_nif).trim().toUpperCase(),
      nome: String(order.customer_name || "").trim() || "Cliente da loja online",
      email: String(order.customer_email || "").trim() || undefined,
      telefone: String(order.phone || "").trim() || undefined,
    };
  }
  return { corpo, erros };
}

/** Modo de pagamento do KanGest para a encomenda: pelo código do método, pela categoria, ou transferência (TB). */
export function modoPagamento(order: Row, lig: Ligacao): string {
  const m = lig.pagamentos || {};
  return m[String(order.payment_method_code || "")] || m[String(order.payment_category || "")] || "TB";
}

/** Corpo da Factura/Recibo a partir da NE: as mesmas linhas sem preço (vêm da NE) e o pagamento do total da NE. */
export function corpoFR(order: Row, ne: { id: number; total: number; linhas: Row[] }, lig: Ligacao): Row {
  return {
    tipo: "FR",
    doc_origem_id: ne.id,
    referencia: String(order.order_number || order.id),
    linhas: ne.linhas.map((l) => ({ referencia: l.referencia, quantidade: l.quantidade, ...(l.descricao ? { descricao: l.descricao } : {}) })),
    pagamentos: [{ modo: modoPagamento(order, lig), valor: ne.total }],
  };
}

/** Nota de crédito de uma encomenda reembolsada: a partir da FR, com as mesmas linhas (os preços vêm da FR). */
export function corpoNC(order: Row, fr: { id: number }, linhas: Row[]): Row {
  const numero = String(order.order_number || order.id);
  return {
    tipo: "NC",
    doc_origem_id: fr.id,
    referencia: numero,
    motivo: `Reembolso da encomenda ${numero} na loja online`,
    linhas: (linhas || []).map((l) => ({ referencia: l.referencia, quantidade: l.quantidade, ...(l.descricao ? { descricao: l.descricao } : {}) })),
  };
}

/** Próxima tentativa: 1, 2, 4, 8… minutos, no máximo 6 horas. */
export function proximaTentativa(tentativas: number, agora = new Date()): string {
  const min = Math.min(2 ** Math.max(tentativas - 1, 0), 360);
  return new Date(agora.getTime() + min * 60_000).toISOString();
}
export const MAX_TENTATIVAS = 12;

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Confere `X-KanGest-Assinatura: t=<segundos>,v1=<hex>` (HMAC-SHA256 de "<t>.<corpo>"), com 5 minutos de margem. */
export async function assinaturaValida(corpo: string, cabecalho: string | null, segredo: string, agoraSeg = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!cabecalho || !segredo) return false;
  const p = Object.fromEntries(cabecalho.split(",").map((x) => x.trim().split("=", 2) as [string, string]));
  const t = Number(p.t);
  if (!Number.isFinite(t) || Math.abs(agoraSeg - t) > 300 || !/^[0-9a-f]{64}$/.test(p.v1 || "")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${p.t}.${corpo}`)));
  let dif = 0;
  for (let i = 0; i < 64; i++) dif |= esperado.charCodeAt(i) ^ p.v1.charCodeAt(i);
  return dif === 0;
}

/** Linhas de kangest_stock a partir do aviso stock.alterado (ou de uma linha de GET /stock). */
export function linhasStock(lig: Ligacao, dados: Row): Row[] {
  const ref = String(dados?.referencia || "").trim();
  if (!ref) return [];
  const lojaDe = new Map<number, string>(Object.entries(lig.lojas || {}).map(([loja, a]) => [Number(a), loja]));
  const online = (a: number) => !lig.armazens_online?.length || lig.armazens_online.includes(a);
  return (Array.isArray(dados.armazens) ? dados.armazens : []).map((a: Row) => {
    const armazem = Number(a.armazem_id);
    const quantidade = Number(a.quantidade || 0);
    const reservado = Number(a.reservado || 0);
    return {
      ligacao: lig.id, referencia: ref, armazem_id: armazem, quantidade, reservado,
      disponivel: a.disponivel != null ? Number(a.disponivel) : quantidade - reservado,
      online: online(armazem), store_id: lojaDe.get(armazem) ?? null, actualizado: new Date().toISOString(),
    };
  });
}

/** Preço do site (Kz, com IVA) a partir do aviso artigo.alterado; null se o KanGest não manda nos preços. */
export function precoDoArtigo(lig: Ligacao, dados: Row): number | null {
  if (lig.precos === false || dados?.preco1_iva == null) return null;
  const p = Number(dados.preco1_iva) / 100;
  return Number.isFinite(p) && p > 0 ? p : null;
}

/**
 * Linhas de kangest_vendas a partir de GET /relatorios/vendas?agrupar=mes_armazem (servidor central: cada armazém é
 * a loja dele) ou agrupar=mes (um KanGest por loja: tudo é da loja da ligação).
 */
export function linhasVendas(lig: Ligacao, dados: Row[], canal: "balcao" | "api"): Row[] {
  const lojaDe = new Map<number, string>(Object.entries(lig.lojas || {}).map(([loja, a]) => [Number(a), loja]));
  const unica = Object.keys(lig.lojas || {}).length === 1 ? Object.keys(lig.lojas!)[0] : "";
  const soma = new Map<string, Row>();
  for (const d of dados) {
    const mes = String(d.mes || d.chave || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const loja = d.armazem_id != null ? (lojaDe.get(Number(d.armazem_id)) ?? "") : unica;
    const k = `${loja}|${mes}`;
    const r = soma.get(k) ?? { ligacao: lig.id, store_id: loja, ano: Number(mes.slice(0, 4)), mes: Number(mes.slice(5, 7)), canal, total: 0, docs: 0 };
    r.total = Math.round((r.total + Number(d.total || 0) / 100) * 100) / 100;
    r.docs += Number(d.docs || 0);
    soma.set(k, r);
  }
  return [...soma.values()].map((r) => ({ ...r, actualizado: new Date().toISOString() }));
}

/**
 * Uma venda do balcão para o Painel de Gestão (vendas_ao_vivo), a partir do aviso documento.emitido/anulado.
 * Só facturas, facturas-recibo, notas de débito e notas de crédito (estas a abater); as da loja online (emitidas
 * pela chave da API) ficam de fora — entram pelas encomendas pagas, com o canal online. A loja é a do armazém
 * (servidor central) ou a única da ligação; um armazém sem loja ligada fica «sem-loja».
 */
export function vendaDoDocumento(lig: Ligacao, d: Row): Row | null {
  const tipo = String(d?.tipo_codigo || "").toUpperCase();
  if (!["FR", "FT", "ND", "NC"].includes(tipo) || d.api_chave_id != null || d.id == null) return null;
  const sinal = tipo === "NC" ? -1 : 1;
  const lojas = Object.entries(lig.lojas || {});
  const lojaDe = new Map<number, string>(lojas.map(([loja, a]) => [Number(a), loja]));
  const alvo = lojas.length === 1 ? lojas[0][0] : (d.armazem_id != null && lojaDe.get(Number(d.armazem_id))) || "sem-loja";
  const hora = String(d.data_hora || "");
  // o KanGest dá a hora local da loja (Angola, UTC+1)
  const quando = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(hora) ? `${hora}+01:00` : new Date().toISOString();
  const kz = (c: unknown) => Math.round(Math.abs(Number(c || 0))) / 100;
  return {
    origem: `kangest:${lig.id}:${d.id}`,
    quando, alvo, canal: "balcao", tipo, numero: String(d.numero_doc || ""),
    total: sinal * kz(d.total),
    itens: (Array.isArray(d.linhas) ? d.linhas : []).map((l: Row) => ({
      chave: String(l.referencia || l.descricao || ""), referencia: String(l.referencia || ""), book_id: null,
      titulo: String(l.descricao || "").slice(0, 200), quantidade: sinal * Math.abs(Number(l.quantidade || 0)), total: sinal * kz(l.total),
    })),
    anulado: d.estado === "A",
    actualizado: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ pedidos ao KanGest

export async function pedir(lig: Ligacao, metodo: string, caminho: string, corpo?: Row, idem?: string, fetchFn: typeof fetch = fetch): Promise<Row> {
  const cab: Record<string, string> = { Authorization: `Bearer ${lig.chave}`, Accept: "application/json" };
  if (corpo) cab["Content-Type"] = "application/json";
  if (idem) cab["Idempotency-Key"] = idem.slice(0, 100);
  let r: Response;
  try {
    r = await fetchFn(`${lig.url}${caminho}`, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(25_000) });
  } catch (e) {
    throw new ErroKanGest(`Sem ligação ao KanGest (${lig.id}): ${(e as Error).message}`);
  }
  const texto = await r.text();
  let v: Row = {};
  try {
    v = texto ? JSON.parse(texto) : {};
  } catch {
    v = {};
  }
  if (!r.ok) {
    const msg = v?.erro?.mensagem || `HTTP ${r.status}`;
    const pedido = v?.erro?.pedido ? ` (pedido n.º ${v.erro.pedido})` : "";
    // 4xx é do pedido ou da configuração (não muda ao repetir), salvo o limite e o tempo esgotado
    const definitivo = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
    throw new ErroKanGest(`${msg}${pedido}`, r.status, v?.erro?.codigo || "", definitivo);
  }
  return v;
}

// ------------------------------------------------------------------ testar a ligação

/** O que a chave da API precisa para a ligação toda (docs/KANGEST.md §2). */
export const PERMISSOES_LIGACAO: [string, string][] = [
  ["api.artigos", "ler artigos e preços"], ["api.stock", "ler o stock"], ["api.documentos", "ler e emitir documentos"],
  ["vendas.proforma", "nota de encomenda (NE)"], ["vendas.fatura_recibo", "factura/recibo (FR)"],
  ["vendas.nota_credito", "nota de crédito dos reembolsos (NC)"], ["documentos.anular", "anular a NE das encomendas canceladas"],
  ["clientes", "criar o cliente com NIF"], ["relatorios.ver", "vendas por loja e mês"], ["pos.alterar_preco", "cobrar o preço do site (promoções)"],
];
/** Versão do KanGest a partir da qual a ligação está completa (reservas por loja, relatórios por loja). */
export const VERSAO_MINIMA = "1.3.0";

export function versaoAntiga(v: string, minima = VERSAO_MINIMA): boolean {
  const a = String(v || "0").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const b = minima.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i];
  return false;
}

export type Verificacao = { nivel: "ok" | "aviso" | "erro"; texto: string };

/**
 * Confere uma ligação de ponta a ponta, sem emitir nada: chega ao KanGest, a chave tem as permissões, os armazéns
 * das lojas existem, os modos de pagamento e os artigos dos portes e genérico também. `lojasSite`: physical_stores.
 */
export async function testarLigacao(lig: Ligacao, lojasSite: { id: string; name: string }[], fetchFn: typeof fetch = fetch): Promise<Row> {
  const v: Verificacao[] = [];
  const t0 = Date.now();
  let info: Row;
  try {
    info = await pedir(lig, "GET", "/", undefined, undefined, fetchFn);
  } catch (e) {
    const err = e as ErroKanGest;
    const texto = err.status === 401 ? "A chave da API não é aceite (revogada, expirada ou de outro KanGest)."
      : err.status === 403 ? `O KanGest recusou o pedido: ${err.message} (endereço IP fora da lista da chave?)`
      : err.message;
    return { id: lig.id, ok: false, verificacoes: [{ nivel: "erro", texto }] };
  }
  const ms = Date.now() - t0;
  v.push({ nivel: "ok", texto: `Ligado ao KanGest ${info.versao} de ${info.empresa?.nome || "—"} em ${ms} ms.` });
  if (versaoAntiga(info.versao)) v.push({ nivel: "erro", texto: `Actualize o KanGest para ${VERSAO_MINIMA} ou mais recente (tem ${info.versao}).` });
  if (ms > 5000) v.push({ nivel: "aviso", texto: "O KanGest demora a responder: as encomendas podem atrasar." });

  const tem = new Set<string>(info.chave?.permissoes || []);
  const faltam = PERMISSOES_LIGACAO.filter(([p]) => !tem.has(p));
  if (faltam.length) {
    v.push({ nivel: "erro", texto: `Faltam permissões à chave «${info.chave?.nome || ""}»: ${faltam.map(([p, d]) => `${p} (${d})`).join(", ")}. `
      + "Algumas também têm de estar no perfil do utilizador da chave." });
  } else v.push({ nivel: "ok", texto: "A chave tem todas as permissões." });

  let tabelas: Row = {};
  try {
    tabelas = await pedir(lig, "GET", "/tabelas", undefined, undefined, fetchFn);
  } catch (e) {
    v.push({ nivel: "erro", texto: `Não foi possível ler as tabelas do KanGest: ${(e as Error).message}` });
  }
  const armazens = new Map<number, string>((tabelas.armazens || []).map((a: Row) => [Number(a.id), String(a.nome)]));
  const nomeLoja = new Map(lojasSite.map((l) => [String(l.id), l.name]));
  if (armazens.size) {
    for (const [loja, arm] of Object.entries(lig.lojas || {})) {
      if (!nomeLoja.has(loja)) v.push({ nivel: "erro", texto: `«lojas»: ${loja} não é uma loja do site.` });
      if (!armazens.has(Number(arm))) v.push({ nivel: "erro", texto: `«lojas»: o armazém ${arm} (${nomeLoja.get(loja) || loja}) não existe no KanGest.` });
    }
    for (const a of lig.armazens_online || []) {
      if (!armazens.has(Number(a))) v.push({ nivel: "erro", texto: `«armazens_online»: o armazém ${a} não existe no KanGest.` });
    }
    const online = (lig.armazens_online?.length ? lig.armazens_online : [...armazens.keys()]).map((a) => armazens.get(Number(a)) || `#${a}`);
    v.push({ nivel: "ok", texto: `Vende no site o stock de: ${online.join(", ")}.` });
  }
  const modos = new Set<string>((tabelas.modos_pagamento || []).map((m: Row) => String(m.codigo)));
  if (modos.size) {
    for (const [metodo, modo] of Object.entries(lig.pagamentos || {})) {
      if (!modos.has(modo)) v.push({ nivel: "erro", texto: `«pagamentos»: ${metodo} → ${modo}, mas o KanGest não tem o modo ${modo}.` });
    }
    if (!modos.has("TB")) v.push({ nivel: "aviso", texto: "O KanGest não tem o modo TB (transferência), usado quando o método não está em «pagamentos»." });
  }
  for (const [campo, ref] of [["portes", lig.portes], ["generico", lig.generico]] as const) {
    if (!ref) {
      if (campo === "portes") v.push({ nivel: "aviso", texto: "Sem artigo dos portes («portes»): encomendas com portes ficam com erro." });
      continue;
    }
    try {
      await pedir(lig, "GET", `/artigos/codigo/${encodeURIComponent(ref)}`, undefined, undefined, fetchFn);
    } catch (e) {
      v.push({ nivel: "erro", texto: `«${campo}»: o artigo ${ref} não existe (ou está inactivo) no KanGest. ${(e as ErroKanGest).status === 404 ? "" : (e as Error).message}`.trim() });
    }
  }
  if (!lig.segredo) v.push({ nivel: "aviso", texto: "Sem «segredo» dos avisos: o stock e as vendas ao balcão só chegam de hora a hora." });
  return {
    id: lig.id, ok: !v.some((x) => x.nivel === "erro"), ms, versao: info.versao, empresa: info.empresa?.nome || "",
    posto: info.posto?.descricao || "", armazens: [...armazens].map(([id, nome]) => ({ id, nome })),
    modos: tabelas.modos_pagamento || [], verificacoes: v,
  };
}

// ------------------------------------------------------------------ fila de documentos

type Db = { from: (t: string) => any; rpc: (f: string, a?: Row) => any };

async function feito(db: Db, job: Row, resultado: Row) {
  await db.from("kangest_fila").update({ estado: "feito", erro: "", resultado, tentativas: job.tentativas + 1, actualizado: new Date().toISOString() }).eq("id", job.id);
}

async function falhou(db: Db, job: Row, e: unknown) {
  const err = e instanceof ErroKanGest ? e : new ErroKanGest((e as Error)?.message || String(e));
  const tentativas = job.tentativas + 1;
  const desiste = err.definitivo || tentativas >= MAX_TENTATIVAS;
  await db.from("kangest_fila").update({
    estado: desiste ? "erro" : "pendente", erro: err.message.slice(0, 1000), tentativas,
    proxima: proximaTentativa(tentativas), actualizado: new Date().toISOString(),
  }).eq("id", job.id);
}

/** Espera pela NE (sem contar como tentativa). */
async function adiar(db: Db, job: Row, minutos: number, motivo: string) {
  await db.from("kangest_fila").update({ estado: "pendente", proxima: new Date(Date.now() + minutos * 60_000).toISOString(), erro: motivo, actualizado: new Date().toISOString() }).eq("id", job.id);
}

/**
 * Reserva o próximo documento da fila (fica «processando»): o agendador e o «Sincronizar já» nunca emitem o mesmo
 * documento os dois. Um reservado há mais de 10 minutos (a função caiu a meio) volta a sair.
 */
async function reservar(db: Db): Promise<Row | null> {
  const { data, error } = await db.rpc("kangest_reservar", { p_limite: 1 });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

/** Emite no KanGest o que está na fila (NE, FR, anulações), pela ordem. Devolve um resumo. */
export async function processarFila(db: Db, ligs: Ligacao[], limite = 20, fetchFn: typeof fetch = fetch, prazoMs = 90_000): Promise<Row> {
  const resumo = { feitos: 0, falhas: 0, adiados: 0 };
  if (!ligs.length) return resumo;
  // um de cada vez e com prazo: o que não couber fica para a próxima volta, sem ficar preso como «processando»
  const fim = Date.now() + prazoMs;
  for (let n = 0; n < limite && Date.now() < fim; n++) {
    const job = await reservar(db);
    if (!job) break;
    try {
      const { data: order } = await db.from("orders").select("*").eq("id", job.order_id).maybeSingle();
      if (!order) {
        await db.from("kangest_fila").update({ estado: "ignorado", erro: "A encomenda já não existe." }).eq("id", job.id);
        continue;
      }
      const { data: irmaos } = await db.from("kangest_fila").select("id, accao, estado, resultado").eq("order_id", job.order_id);
      const ne = (irmaos || []).find((x: Row) => x.accao === "ne");
      const fr = (irmaos || []).find((x: Row) => x.accao === "fr");
      const escolha = ne?.resultado?.ligacao ? { ligacao: ligs.find((l) => l.id === ne.resultado.ligacao) } : ligacaoDaEncomenda(ligs, order);
      const lig = escolha?.ligacao;
      if (!lig) throw new ErroKanGest(`A ligação ${ne?.resultado?.ligacao} já não está em KANGEST_LIGACOES.`, 0, "", true);
      const numero = String(order.order_number || order.id);

      if (job.accao === "ne") {
        const ids = [...new Set((order.items || []).map((i: Row) => String(i.book_id || "")).filter(Boolean))];
        const { data: livros } = ids.length ? await db.from("stock_books").select("id, kigest_ref").in("id", ids) : { data: [] };
        const refs = new Map<string, string>((livros || []).map((b: Row) => [b.id, b.kigest_ref || ""]));
        const { corpo, erros } = corpoNE(order, refs, lig, (escolha as any).armazem_id);
        if (erros.length) throw new ErroKanGest(erros.join(" "), 0, "", true);
        const d = await pedir(lig, "POST", "/documentos", corpo, `ne-${numero}`, fetchFn);
        await feito(db, job, { ligacao: lig.id, id: d.id, numero: d.numero_doc, total: d.total, armazem_id: d.armazem_id, linhas: corpo.linhas });
        // a encomenda passa a estar reservada no KanGest: o stock do site deixa de a descontar à parte
        await recalcularStock(db, [...new Set<string>(corpo.linhas.map((l: Row) => String(l.referencia)))]);
      } else if (job.accao === "fr") {
        if (!ne || ne.estado !== "feito") {
          if (ne && (ne.estado === "erro" || ne.estado === "ignorado")) throw new ErroKanGest("A nota de encomenda não chegou ao KanGest: resolva-a primeiro.", 0, "", true);
          await adiar(db, job, 1, "À espera da nota de encomenda.");
          resumo.adiados++;
          continue;
        }
        const r = ne.resultado;
        const d = await pedir(lig, "POST", "/documentos", corpoFR(order, { id: r.id, total: r.total, linhas: r.linhas || [] }, lig), `fr-${numero}`, fetchFn);
        await feito(db, job, { ligacao: lig.id, id: d.id, numero: d.numero_doc, total: d.total, fe: d.fe ?? null, hash: d.hash_controlo ?? null });
      } else if (job.accao === "nc") {
        if (fr?.estado !== "feito" || !fr.resultado?.id) {
          throw new ErroKanGest("Não há factura no KanGest para fazer a nota de crédito.", 0, "", true);
        }
        const d = await pedir(lig, "POST", "/documentos", corpoNC(order, { id: fr.resultado.id }, ne?.resultado?.linhas || []), `nc-${numero}`, fetchFn);
        await feito(db, job, { ligacao: lig.id, id: d.id, numero: d.numero_doc, total: d.total, fe: d.fe ?? null });
      } else if (job.accao === "anular") {
        if (fr?.estado === "feito") {
          throw new ErroKanGest(`A encomenda já foi facturada (${fr.resultado?.numero}): faça a nota de crédito no KanGest.`, 0, "", true);
        }
        if (!ne?.resultado?.id) throw new ErroKanGest("Não há nota de encomenda no KanGest para anular.", 0, "", true);
        // (o gatilho já pôs de parte a FR que ainda não tinha saído)
        const d = await pedir(lig, "POST", `/documentos/${ne.resultado.id}/anular`, { motivo: `Encomenda ${numero} cancelada no site` }, undefined, fetchFn);
        await feito(db, job, { ligacao: lig.id, id: d.id, numero: d.numero_doc, estado: d.estado });
      }
      resumo.feitos++;
    } catch (e) {
      await falhou(db, job, e);
      resumo.falhas++;
    }
  }
  return resumo;
}

// ------------------------------------------------------------------ avisos e sincronização

/** Recalcula o stock do site de várias referências, 500 por pedido à base (em vez de um pedido por livro). */
export async function recalcularStock(db: Db, refs: string[]) {
  for (let i = 0; i < refs.length; i += 500) {
    const { error } = await db.rpc("kangest_recalcular_stock_lote", { p_referencias: refs.slice(i, i + 500) });
    if (error) throw new Error(error.message);
  }
}

/** Trata um aviso do KanGest já com a assinatura conferida. */
export async function tratarAviso(db: Db, lig: Ligacao, aviso: Row): Promise<string> {
  const dados = aviso?.dados || {};
  if (aviso?.evento === "stock.alterado") {
    const linhas = linhasStock(lig, dados);
    if (!linhas.length) return "sem armazéns";
    const { error } = await db.from("kangest_stock").upsert(linhas, { onConflict: "ligacao,referencia,armazem_id" });
    if (error) throw new Error(error.message);
    await db.rpc("kangest_recalcular_stock", { p_referencia: linhas[0].referencia });
    return "stock";
  }
  if (aviso?.evento === "documento.emitido" || aviso?.evento === "documento.anulado") {
    const venda = vendaDoDocumento(lig, dados);
    if (!venda) return "não é venda do balcão";
    // a capa do produto do site, pela referência
    const refs = [...new Set(venda.itens.map((i: Row) => i.referencia).filter(Boolean))];
    if (refs.length) {
      const { data: livros } = await db.from("stock_books").select("id, kigest_ref").in("kigest_ref", refs);
      const porRef = new Map<string, string>((livros || []).map((b: Row) => [b.kigest_ref, b.id]));
      for (const i of venda.itens) i.book_id = porRef.get(i.referencia) ?? null;
    }
    const { error } = await db.from("vendas_ao_vivo").upsert(venda, { onConflict: "origem" });
    if (error) throw new Error(error.message);
    return venda.anulado ? "venda anulada" : "venda";
  }
  if (aviso?.evento === "artigo.alterado") {
    const preco = precoDoArtigo(lig, dados);
    if (preco == null || !dados.referencia) return "sem preço";
    const { error } = await db.from("stock_books").update({ price: preco }).eq("kigest_ref", String(dados.referencia)).neq("price", preco);
    if (error) throw new Error(error.message);
    return "preço";
  }
  return "ignorado";
}

/** Stock completo de uma ligação, página a página (recupera avisos perdidos). */
export async function sincronizarStock(db: Db, lig: Ligacao, fetchFn: typeof fetch = fetch): Promise<number> {
  let desde = 0;
  let n = 0;
  const refs = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = await pedir(lig, "GET", `/stock?limite=500&desde_id=${desde}`, undefined, undefined, fetchFn);
    const linhas = (p.dados || []).flatMap((d: Row) => linhasStock(lig, d));
    if (linhas.length) {
      const { error } = await db.from("kangest_stock").upsert(linhas, { onConflict: "ligacao,referencia,armazem_id" });
      if (error) throw new Error(error.message);
      linhas.forEach((l: Row) => refs.add(l.referencia));
    }
    n += (p.dados || []).length;
    if (!p.mais) break;
    desde = p.seguinte;
  }
  await recalcularStock(db, [...refs]);
  return n;
}

/** Vendas ao balcão e da API de um ano, por loja e por mês. */
export async function sincronizarVendas(db: Db, lig: Ligacao, ano: number, fetchFn: typeof fetch = fetch): Promise<number> {
  const central = Object.keys(lig.lojas || {}).length > 1;
  let n = 0;
  for (const canal of ["balcao", "api"] as const) {
    const p = await pedir(lig, "GET", `/relatorios/vendas?de=${ano}-01-01&ate=${ano}-12-31&agrupar=${central ? "mes_armazem" : "mes"}&canal=${canal}`, undefined, undefined, fetchFn);
    const linhas = linhasVendas(lig, p.dados || [], canal);
    if (linhas.length) {
      const { error } = await db.from("kangest_vendas").upsert(linhas, { onConflict: "ligacao,store_id,ano,mes,canal" });
      if (error) throw new Error(error.message);
    }
    n += linhas.length;
  }
  return n;
}
