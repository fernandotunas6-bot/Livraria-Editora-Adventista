import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assinaturaValida, corpoFR, corpoNE, ErroKanGest, lerLigacoes, ligacaoDaEncomenda, linhasStock, linhasVendas, modoPagamento,
  corpoNC, PERMISSOES_LIGACAO, pedir, precoDoArtigo, processarFila, proximaTentativa, testarLigacao, vendaDoDocumento, versaoAntiga,
  type Ligacao,
} from "./kangest.ts";

const CHAVE = `kg_${"a".repeat(48)}`;
const central: Ligacao = {
  id: "central", url: "https://empresa.exemplo.ao/api/v1", chave: CHAVE, segredo: "whsec_teste",
  lojas: { huambo: 1, lubango: 2 }, armazens_online: [1], portes: "PORTES", pagamentos: { multicaixa_express: "MB", transfer: "TB" },
};
const encomenda = (extra: Record<string, unknown> = {}) => ({
  id: "o1", order_number: "LIV-1001", store_id: "lubango", customer_name: "Ana", customer_email: "ana@x.ao", phone: "923000000",
  shipping_cost: 1500, payment_method_code: "multicaixa_express",
  items: [
    { book_id: "b1", title: "O Desejado de Todas as Nações", quantity: 2, price: 5700 },
    { book_id: "b2", title: "Caminho a Cristo (digital)", quantity: 1, price: 900, digital: true },
  ],
  ...extra,
});

describe("lerLigacoes", () => {
  it("vazio desliga; aceita um objecto ou uma lista", () => {
    expect(lerLigacoes("")).toEqual([]);
    expect(lerLigacoes(undefined)).toEqual([]);
    expect(lerLigacoes(JSON.stringify({ id: "a", url: "https://x.ao/api/v1/", chave: CHAVE }))[0].url).toBe("https://x.ao/api/v1");
  });
  it("recusa url sem HTTPS, chave mal escrita e ids repetidos", () => {
    expect(() => lerLigacoes(JSON.stringify([{ id: "a", url: "http://x.ao/api/v1", chave: CHAVE }]))).toThrow(/https/);
    expect(() => lerLigacoes(JSON.stringify([{ id: "a", url: "https://x.ao/api/v1", chave: "kg_curta" }]))).toThrow(/chave/);
    const l = { url: "https://x.ao/api/v1", chave: CHAVE };
    expect(() => lerLigacoes(JSON.stringify([{ id: "a", ...l }, { id: "a", ...l }]))).toThrow(/duas vezes/);
    expect(() => lerLigacoes("{")).toThrow(/JSON/);
  });
  it("aceita o KanGest na própria máquina por http (testes)", () => {
    expect(lerLigacoes(JSON.stringify([{ id: "a", url: "http://[::1]:7800/api/v1", chave: CHAVE }]))).toHaveLength(1);
  });
});

describe("ligacaoDaEncomenda", () => {
  const huambo: Ligacao = { id: "huambo", url: "https://h.ao/api/v1", chave: CHAVE, lojas: { huambo: 1 }, padrao: true };
  const lubango: Ligacao = { id: "lubango", url: "https://l.ao/api/v1", chave: CHAVE, lojas: { lubango: 3 } };
  it("um KanGest por loja: o da loja da encomenda, com o armazém dela", () => {
    expect(ligacaoDaEncomenda([huambo, lubango], { store_id: "lubango" })).toEqual({ ligacao: lubango, armazem_id: 3 });
  });
  it("sem loja (ou de uma loja sem KanGest): o padrão, no armazém do posto da chave", () => {
    expect(ligacaoDaEncomenda([lubango, huambo], { store_id: "" })).toEqual({ ligacao: huambo });
    expect(ligacaoDaEncomenda([lubango, huambo], { store_id: "catumbela" })).toEqual({ ligacao: huambo });
  });
  it("servidor central: a mesma ligação, o armazém da loja", () => {
    expect(ligacaoDaEncomenda([central], { pickup_store_id: "huambo" })).toEqual({ ligacao: central, armazem_id: 1 });
  });
});

describe("corpoNE", () => {
  const refs = new Map([["b1", "LIV-001"], ["b2", ""]]);
  it("linhas com o preço com IVA cobrado no site, portes numa linha e o armazém da loja", () => {
    const { corpo, erros } = corpoNE(encomenda(), refs, { ...central, generico: "DIGITAL" }, 2);
    expect(erros).toEqual([]);
    expect(corpo).toMatchObject({ tipo: "NE", referencia: "LIV-1001", armazem_id: 2 });
    expect(corpo.linhas).toEqual([
      { referencia: "LIV-001", quantidade: 2, preco_com_iva: 570000 },
      { referencia: "DIGITAL", quantidade: 1, preco_com_iva: 90000, descricao: "Caminho a Cristo (digital)" },
      { referencia: "PORTES", quantidade: 1, preco_com_iva: 150000, descricao: "Portes de envio" },
    ]);
    expect(corpo.cliente).toBeUndefined();
  });
  it("produto sem artigo no KanGest e sem genérico: erro a decidir, não uma factura errada", () => {
    const { erros } = corpoNE(encomenda(), refs, central);
    expect(erros.join(" ")).toMatch(/Caminho a Cristo/);
  });
  it("portes sem artigo dos portes: erro", () => {
    const { erros } = corpoNE(encomenda({ items: [{ book_id: "b1", quantity: 1, price: 10 }] }), refs, { ...central, portes: undefined });
    expect(erros.join(" ")).toMatch(/portes/);
  });
  it("cliente com NIF: identificado na factura", () => {
    const { corpo } = corpoNE(encomenda({ customer_nif: " 5000111222 ", shipping_cost: 0, items: [{ book_id: "b1", quantity: 1, price: 10 }] }), refs, central);
    expect(corpo.cliente).toMatchObject({ nif: "5000111222", nome: "Ana", email: "ana@x.ao", telefone: "923000000" });
  });
});

describe("FR e pagamento", () => {
  it("modo de pagamento pelo código, pela categoria ou transferência", () => {
    expect(modoPagamento({ payment_method_code: "multicaixa_express" }, central)).toBe("MB");
    expect(modoPagamento({ payment_method_code: "x", payment_category: "transfer" }, central)).toBe("TB");
    expect(modoPagamento({}, central)).toBe("TB");
  });
  it("a FR vem da NE: linhas sem preço e o pagamento do total da NE", () => {
    const fr = corpoFR(encomenda(), { id: 77, total: 870000, linhas: [{ referencia: "LIV-001", quantidade: 2, preco_com_iva: 570000 }, { referencia: "PORTES", quantidade: 1, preco_com_iva: 150000, descricao: "Portes de envio" }] }, central);
    expect(fr).toEqual({
      tipo: "FR", doc_origem_id: 77, referencia: "LIV-1001",
      linhas: [{ referencia: "LIV-001", quantidade: 2 }, { referencia: "PORTES", quantidade: 1, descricao: "Portes de envio" }],
      pagamentos: [{ modo: "MB", valor: 870000 }],
    });
  });
  it("novas tentativas cada vez mais espaçadas, até 6 horas", () => {
    const t0 = new Date("2026-11-19T10:00:00Z");
    expect(proximaTentativa(1, t0)).toBe("2026-11-19T10:01:00.000Z");
    expect(proximaTentativa(4, t0)).toBe("2026-11-19T10:08:00.000Z");
    expect(proximaTentativa(30, t0)).toBe("2026-11-19T16:00:00.000Z");
  });
});

describe("nota de crédito (reembolso)", () => {
  it("a partir da FR, com as linhas da NE sem preço e o motivo", () => {
    expect(corpoNC(encomenda(), { id: 51 }, [{ referencia: "LIV-001", quantidade: 2, preco_com_iva: 570000 }, { referencia: "PORTES", quantidade: 1, preco_com_iva: 150000, descricao: "Portes de envio" }])).toEqual({
      tipo: "NC", doc_origem_id: 51, referencia: "LIV-1001", motivo: "Reembolso da encomenda LIV-1001 na loja online",
      linhas: [{ referencia: "LIV-001", quantidade: 2 }, { referencia: "PORTES", quantidade: 1, descricao: "Portes de envio" }],
    });
  });
});

describe("assinaturaValida", () => {
  const corpo = '{"id":1,"evento":"stock.alterado"}';
  const assinar = (t: number, segredo = "whsec_teste") => `t=${t},v1=${createHmac("sha256", segredo).update(`${t}.${corpo}`).digest("hex")}`;
  it("confere o HMAC-SHA256 de «t.corpo»", async () => {
    expect(await assinaturaValida(corpo, assinar(1000), "whsec_teste", 1000)).toBe(true);
  });
  it("recusa outro segredo, outro corpo, avisos velhos e cabeçalhos estragados", async () => {
    expect(await assinaturaValida(corpo, assinar(1000, "outro"), "whsec_teste", 1000)).toBe(false);
    expect(await assinaturaValida(corpo + " ", assinar(1000), "whsec_teste", 1000)).toBe(false);
    expect(await assinaturaValida(corpo, assinar(1000), "whsec_teste", 1000 + 301)).toBe(false);
    expect(await assinaturaValida(corpo, "t=1000", "whsec_teste", 1000)).toBe(false);
    expect(await assinaturaValida(corpo, null, "whsec_teste", 1000)).toBe(false);
  });
});

describe("avisos e relatórios", () => {
  it("stock por armazém: o disponível, se é vendido no site e a loja de cada armazém", () => {
    const l = linhasStock(central, { referencia: "LIV-001", armazens: [
      { armazem_id: 1, quantidade: 10, reservado: 2, disponivel: 8 },
      { armazem_id: 2, quantidade: 5, reservado: 0 },
      { armazem_id: 9, quantidade: 1 },
    ] });
    expect(l.map(({ actualizado: _, ...r }) => r)).toEqual([
      { ligacao: "central", referencia: "LIV-001", armazem_id: 1, quantidade: 10, reservado: 2, disponivel: 8, online: true, store_id: "huambo" },
      { ligacao: "central", referencia: "LIV-001", armazem_id: 2, quantidade: 5, reservado: 0, disponivel: 5, online: false, store_id: "lubango" },
      { ligacao: "central", referencia: "LIV-001", armazem_id: 9, quantidade: 1, reservado: 0, disponivel: 1, online: false, store_id: null },
    ]);
    expect(linhasStock(central, { armazens: [] })).toEqual([]);
  });
  it("preço do site a partir do PVP com IVA do KanGest, se a ligação mandar nos preços", () => {
    expect(precoDoArtigo(central, { preco1_iva: 570000 })).toBe(5700);
    expect(precoDoArtigo({ ...central, precos: false }, { preco1_iva: 570000 })).toBeNull();
    expect(precoDoArtigo(central, { preco1_iva: 0 })).toBeNull();
  });
  it("vendas por loja e por mês, em Kz", () => {
    const v = linhasVendas(central, [
      { mes: "2026-10", armazem_id: 1, total: 12345678, docs: 40 },
      { mes: "2026-10", armazem_id: 2, total: 500000, docs: 3 },
      { mes: "2026-11", armazem_id: 7, total: 100, docs: 1 },
    ], "balcao");
    expect(v.map(({ actualizado: _, ...r }) => r)).toEqual([
      { ligacao: "central", store_id: "huambo", ano: 2026, mes: 10, canal: "balcao", total: 123456.78, docs: 40 },
      { ligacao: "central", store_id: "lubango", ano: 2026, mes: 10, canal: "balcao", total: 5000, docs: 3 },
      { ligacao: "central", store_id: "", ano: 2026, mes: 11, canal: "balcao", total: 1, docs: 1 },
    ]);
    const so: Ligacao = { id: "lub", url: "https://l.ao/api/v1", chave: CHAVE, lojas: { lubango: 1 } };
    expect(linhasVendas(so, [{ chave: "2026-09", total: 100000, docs: 2 }], "api")[0]).toMatchObject({ store_id: "lubango", mes: 9, canal: "api", total: 1000 });
  });
});

describe("vendaDoDocumento (Painel de Gestão)", () => {
  const doc = (extra: Record<string, unknown> = {}) => ({
    id: 1532, tipo_codigo: "FR", numero_doc: "FR P12026/1532", data_hora: "2026-11-19T10:42:07", armazem_id: 2, api_chave_id: null,
    total: 1140000, estado: "N", linhas: [{ referencia: "LIV-001", descricao: "O DESEJADO", quantidade: 2, total: 1140000 }], ...extra,
  });
  it("venda do balcão: a loja do armazém, a hora de Angola, Kz", () => {
    const v = vendaDoDocumento(central, doc())!;
    expect(v).toMatchObject({ origem: "kangest:central:1532", quando: "2026-11-19T10:42:07+01:00", alvo: "lubango", canal: "balcao", tipo: "FR", total: 11400, anulado: false });
    expect(v.itens).toEqual([{ chave: "LIV-001", referencia: "LIV-001", book_id: null, titulo: "O DESEJADO", quantidade: 2, total: 11400 }]);
  });
  it("nota de crédito a abater; anulada fica marcada", () => {
    const nc = vendaDoDocumento(central, doc({ tipo_codigo: "NC", total: 350000, linhas: [{ referencia: "LIV-001", quantidade: 1, total: 350000 }] }))!;
    expect([nc.total, nc.itens[0].quantidade]).toEqual([-3500, -1]);
    expect(vendaDoDocumento(central, doc({ estado: "A" }))!.anulado).toBe(true);
  });
  it("de fora: as da loja online (chave da API), compras e documentos de stock", () => {
    expect(vendaDoDocumento(central, doc({ api_chave_id: 3 }))).toBeNull();
    expect(vendaDoDocumento(central, doc({ tipo_codigo: "NE" }))).toBeNull();
    expect(vendaDoDocumento(central, doc({ tipo_codigo: "ES" }))).toBeNull();
  });
  it("armazém sem loja ligada: «sem-loja»; um KanGest por loja: a loja dele", () => {
    expect(vendaDoDocumento(central, doc({ armazem_id: 9 }))!.alvo).toBe("sem-loja");
    const so: Ligacao = { id: "lub", url: "https://l.ao/api/v1", chave: CHAVE, lojas: { lubango: 1 } };
    expect(vendaDoDocumento(so, doc({ armazem_id: 7 }))!.alvo).toBe("lubango");
  });
});

describe("pedir", () => {
  const resposta = (status: number, corpo: unknown) => async () => new Response(JSON.stringify(corpo), { status });
  it("manda a chave e a Idempotency-Key", async () => {
    let visto: RequestInit | undefined;
    const f = (async (_u: string, i: RequestInit) => { visto = i; return new Response('{"id":1}', { status: 201 }); }) as unknown as typeof fetch;
    expect(await pedir(central, "POST", "/documentos", { tipo: "NE" }, "ne-LIV-1001", f)).toEqual({ id: 1 });
    expect((visto!.headers as Record<string, string>).Authorization).toBe(`Bearer ${CHAVE}`);
    expect((visto!.headers as Record<string, string>)["Idempotency-Key"]).toBe("ne-LIV-1001");
  });
  it("422 é definitivo (precisa de alguém); 429, 5xx e sem ligação voltam a tentar", async () => {
    const e1 = await pedir(central, "POST", "/documentos", {}, undefined, resposta(422, { erro: { codigo: "validacao", mensagem: "Stock insuficiente.", pedido: 9 } }) as unknown as typeof fetch).catch((e) => e);
    expect(e1).toBeInstanceOf(ErroKanGest);
    expect([e1.definitivo, e1.message]).toEqual([true, "Stock insuficiente. (pedido n.º 9)"]);
    const e2 = await pedir(central, "GET", "/", undefined, undefined, resposta(429, {}) as unknown as typeof fetch).catch((e) => e);
    expect(e2.definitivo).toBe(false);
    const e3 = await pedir(central, "GET", "/", undefined, undefined, (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch).catch((e) => e);
    expect([e3.definitivo, e3.message]).toEqual([false, "Sem ligação ao KanGest (central): ECONNREFUSED"]);
  });
});

/** Base falsa com o mínimo do cliente do Supabase que a fila usa. */
function baseFalsa(tabelas: Record<string, Record<string, any>[]>) {
  const rpcs: { f: string; a: unknown }[] = [];
  const consulta = (nome: string) => {
    const filtros: ((r: Record<string, any>) => boolean)[] = [];
    let patch: Record<string, unknown> | null = null;
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { filtros.push((r) => r[k] !== v); return q; },
      lte: (k: string, v: string) => { filtros.push((r) => String(r[k]) <= v); return q; },
      in: (k: string, v: unknown[]) => { filtros.push((r) => v.includes(r[k])); return q; },
      update: (p: Record<string, unknown>) => { patch = p; return q; },
      maybeSingle: async () => ({ data: (tabelas[nome] || []).find((r) => filtros.every((f) => f(r))) ?? null }),
      then: (ok: (v: unknown) => unknown) => {
        const linhas = (tabelas[nome] || []).filter((r) => filtros.every((f) => f(r)));
        if (patch) linhas.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: linhas, error: null }).then(ok);
      },
    };
    return q;
  };
  // kangest_reservar como a função da base: o primeiro pendente na hora (ou preso há 10 min) passa a «processando»
  const reservar = () => {
    const agora = new Date().toISOString();
    const preso = new Date(Date.now() - 10 * 60_000).toISOString();
    const job = [...(tabelas.kangest_fila || [])].sort((a, b) => a.id - b.id)
      .find((r) => (r.estado === "pendente" && String(r.proxima) <= agora) || (r.estado === "processando" && String(r.actualizado) < preso));
    if (job) Object.assign(job, { estado: "processando", actualizado: agora });
    return job ? [job] : [];
  };
  const rpc = async (f: string, a: unknown) => {
    rpcs.push({ f, a });
    return { data: f === "kangest_reservar" ? reservar() : 1, error: null };
  };
  return { db: { from: consulta, rpc }, rpcs };
}

describe("processarFila", () => {
  const passado = "2000-01-01T00:00:00.000Z";
  it("NE no armazém da loja, depois a FR a partir dela; o stock do site é recalculado", async () => {
    const fila = [
      { id: 1, order_id: "o1", accao: "ne", estado: "pendente", tentativas: 0, proxima: passado, resultado: null },
      { id: 2, order_id: "o1", accao: "fr", estado: "pendente", tentativas: 0, proxima: passado, resultado: null },
    ];
    const { db, rpcs } = baseFalsa({ kangest_fila: fila, orders: [encomenda()], stock_books: [{ id: "b1", kigest_ref: "LIV-001" }] });
    const pedidos: any[] = [];
    const f = (async (url: string, i: RequestInit) => {
      const corpo = JSON.parse(String(i.body));
      pedidos.push({ url, corpo, idem: (i.headers as Record<string, string>)["Idempotency-Key"] });
      const doc = corpo.tipo === "NE" ? { id: 50, numero_doc: "NE W2026/1", total: 870000, armazem_id: 2 } : { id: 51, numero_doc: "FR W2026/9", total: 870000, fe: { estado: "P" } };
      return new Response(JSON.stringify(doc), { status: 201 });
    }) as unknown as typeof fetch;
    const lig = { ...central, generico: "DIGITAL" };
    expect(await processarFila(db, [lig], 20, f)).toEqual({ feitos: 2, falhas: 0, adiados: 0 });
    expect(pedidos.map((p) => [p.corpo.tipo, p.idem])).toEqual([["NE", "ne-LIV-1001"], ["FR", "fr-LIV-1001"]]);
    expect(pedidos[0].corpo.armazem_id).toBe(2);
    expect(pedidos[1].corpo).toMatchObject({ doc_origem_id: 50, pagamentos: [{ modo: "MB", valor: 870000 }] });
    expect(fila.map((x) => x.estado)).toEqual(["feito", "feito"]);
    expect(fila[1].resultado).toMatchObject({ numero: "FR W2026/9", fe: { estado: "P" } });
    const lotes = rpcs.filter((r) => r.f === "kangest_recalcular_stock_lote");
    expect(lotes).toHaveLength(1);
    expect((lotes[0].a as any).p_referencias).toContain("LIV-001");
  });
  it("FR antes da NE espera; erro de validação fica para alguém resolver", async () => {
    const fila = [{ id: 2, order_id: "o1", accao: "fr", estado: "pendente", tentativas: 0, proxima: passado, resultado: null },
      { id: 1, order_id: "o1", accao: "ne", estado: "pendente", tentativas: 0, proxima: "2999-01-01T00:00:00.000Z", resultado: null }];
    const { db } = baseFalsa({ kangest_fila: fila, orders: [encomenda()], stock_books: [] });
    expect(await processarFila(db, [central], 20, (async () => new Response("{}")) as unknown as typeof fetch)).toEqual({ feitos: 0, falhas: 0, adiados: 1 });
    expect(fila[0].estado).toBe("pendente");

    const fila2 = [{ id: 3, order_id: "o1", accao: "ne", estado: "pendente", tentativas: 0, proxima: passado, resultado: null }];
    const b2 = baseFalsa({ kangest_fila: fila2, orders: [encomenda()], stock_books: [] });
    await processarFila(b2.db, [central], 20, (async () => new Response("{}")) as unknown as typeof fetch);
    expect(fila2[0].estado).toBe("erro");
    expect(String((fila2[0] as any).erro)).toMatch(/não tem artigo no KanGest/);
  });
  it("dois ciclos ao mesmo tempo não emitem a mesma nota de encomenda", async () => {
    const fila = [
      { id: 1, order_id: "o1", accao: "ne", estado: "pendente", tentativas: 0, proxima: passado, resultado: null },
      { id: 2, order_id: "o1", accao: "fr", estado: "pendente", tentativas: 0, proxima: passado, resultado: null },
    ];
    const { db } = baseFalsa({ kangest_fila: fila, orders: [encomenda()], stock_books: [{ id: "b1", kigest_ref: "LIV-001" }] });
    const tipos: string[] = [];
    const f = (async (_url: string, i: RequestInit) => {
      const corpo = JSON.parse(String(i.body));
      tipos.push(corpo.tipo);
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ id: corpo.tipo === "NE" ? 50 : 51, numero_doc: corpo.tipo, total: 870000 }), { status: 201 });
    }) as unknown as typeof fetch;
    const lig = { ...central, generico: "DIGITAL" };
    await Promise.all([processarFila(db, [lig], 20, f), processarFila(db, [lig], 20, f)]);
    expect(tipos.filter((t) => t === "NE")).toHaveLength(1);
    expect(fila[0].estado).toBe("feito");
    // a FR ou saiu a seguir à NE, ou espera por ela (nunca fica presa como «processando»)
    expect(["feito", "pendente"]).toContain(fila[1].estado);
  });
  it("sem tempo: nada fica reservado", async () => {
    const fila = [{ id: 1, order_id: "o1", accao: "ne", estado: "pendente", tentativas: 0, proxima: passado, resultado: null }];
    const { db } = baseFalsa({ kangest_fila: fila, orders: [encomenda()], stock_books: [] });
    expect(await processarFila(db, [central], 20, fetch, 0)).toEqual({ feitos: 0, falhas: 0, adiados: 0 });
    expect(fila[0].estado).toBe("pendente");
  });
  it("sem ligação ao KanGest: volta a tentar mais tarde", async () => {
    const fila = [{ id: 1, order_id: "o1", accao: "ne", estado: "pendente", tentativas: 0, proxima: passado, resultado: null }];
    const { db } = baseFalsa({ kangest_fila: fila, orders: [encomenda({ items: [{ book_id: "b1", quantity: 1, price: 10 }], shipping_cost: 0 })], stock_books: [{ id: "b1", kigest_ref: "LIV-001" }] });
    await processarFila(db, [central], 20, (async () => { throw new Error("timeout"); }) as unknown as typeof fetch);
    expect([fila[0].estado, fila[0].tentativas]).toEqual(["pendente", 1]);
  });
});

describe("testarLigacao", () => {
  const todas = PERMISSOES_LIGACAO.map(([p]) => p);
  const kangest = (perms: string[], artigos: string[] = ["PORTES"]) => (async (url: string) => {
    const caminho = url.replace(central.url, "");
    if (caminho === "/") {
      return new Response(JSON.stringify({ versao: "1.3.0", empresa: { nome: "Livraria" }, chave: { nome: "site", permissoes: perms }, posto: { descricao: "Online" } }));
    }
    if (caminho === "/tabelas") {
      return new Response(JSON.stringify({ armazens: [{ id: 1, nome: "Huambo" }, { id: 2, nome: "Lubango" }], modos_pagamento: [{ codigo: "MB" }, { codigo: "TB" }, { codigo: "NU" }] }));
    }
    const ref = decodeURIComponent(caminho.replace("/artigos/codigo/", ""));
    return artigos.includes(ref) ? new Response(JSON.stringify({ id: 9 })) : new Response(JSON.stringify({ erro: { mensagem: "Nenhum artigo" } }), { status: 404 });
  }) as unknown as typeof fetch;
  const lojas = [{ id: "huambo", name: "Huambo" }, { id: "lubango", name: "Lubango" }];

  it("tudo certo", async () => {
    const r = await testarLigacao(central, lojas, kangest(todas));
    expect(r.ok).toBe(true);
    expect(r.verificacoes.filter((v: any) => v.nivel === "erro")).toEqual([]);
    expect(r.armazens).toEqual([{ id: 1, nome: "Huambo" }, { id: 2, nome: "Lubango" }]);
  });
  it("aponta permissões, armazéns, modos e artigos que faltam", async () => {
    const lig = { ...central, lojas: { huambo: 1, sumbe: 7 }, armazens_online: [3], pagamentos: { multicaixa_express: "XX" }, generico: "DIGITAL" };
    const r = await testarLigacao(lig, lojas, kangest(todas.filter((p) => p !== "vendas.nota_credito")));
    const erros = r.verificacoes.filter((v: any) => v.nivel === "erro").map((v: any) => v.texto).join(" | ");
    expect(r.ok).toBe(false);
    expect(erros).toMatch(/vendas\.nota_credito/);
    expect(erros).toMatch(/sumbe não é uma loja do site/);
    expect(erros).toMatch(/armazém 7/);
    expect(erros).toMatch(/«armazens_online»: o armazém 3/);
    expect(erros).toMatch(/modo XX/);
    expect(erros).toMatch(/«generico»: o artigo DIGITAL/);
  });
  it("chave recusada e KanGest antigo", async () => {
    const recusa = (async () => new Response(JSON.stringify({ erro: { mensagem: "Chave inválida" } }), { status: 401 })) as unknown as typeof fetch;
    const r = await testarLigacao(central, lojas, recusa);
    expect([r.ok, r.verificacoes[0].texto]).toEqual([false, "A chave da API não é aceite (revogada, expirada ou de outro KanGest)."]);
    expect([versaoAntiga("1.2.9"), versaoAntiga("1.3.0"), versaoAntiga("1.10.0"), versaoAntiga("2.0.0-beta")]).toEqual([true, false, false, false]);
  });
});
