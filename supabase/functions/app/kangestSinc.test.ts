// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import {
  isbn13Valido, limparEstadoComputador, limparFotosKanGest, limparLivrosKanGest, limparLivroStock, limparSessoesKanGest, MAX_FOTO_BYTES,
  MAX_LIVROS, MAX_PROMOCOES, dataValida, limparPromocoesKanGest, tipoDaImagem,
  aadDoPedido, abrirPedido, abrirResposta, assinaturaValida, chavesDaSessao, cifrarAesGcm, cifrarCampo, codigoEmparelhamento,
  consumidorFinal, deB64, decifrarCampo, dividasParaOPainel, MAX_RESUMO_FECHO, horaValida, indiceCego, lerChavesSinc, lerCifraDados, mensagemAssinada, nonceValido,
  normalizarCodigo, paraB64, prepararLote, selarPedido, selarResposta, sha256Hex, type ChaveCentro,
} from "./kangestSinc.ts";

const enc = new TextEncoder();
const seq = (n: number, inicio: number) => Uint8Array.from({ length: n }, (_, i) => (inicio + i) & 255);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const POSTO = "00000000-0000-4000-8000-000000000001";

/** Um par X25519 do centro como o gera scripts/kangest/chaves-sinc.mjs (as duas chaves em base64, 32 bytes). */
async function chaveDoCentro(kid = "1"): Promise<ChaveCentro> {
  const par = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  return { kid, privada: paraB64(pkcs8.slice(-32)), publica: paraB64(publica) };
}

describe("a sessão de um pedido (vectores partilhados com o KanGest em Rust)", () => {
  // src-tauri/src/sinc/cifra.rs tem os mesmos vectores: se um lado mudar, os dois testes falham.
  it("HKDF-SHA256: as chaves do pedido e da resposta", async () => {
    const k = await chavesDaSessao(seq(32, 0x01), seq(32, 0x40), seq(32, 0x80));
    expect(hex(k.pedido)).toBe("aca8ebc1dd701aa1814bcfc1c4588451cfdaef2e9b552e5b518efb3f41ef45b3");
    expect(hex(k.resposta)).toBe("8fcd419a5ea44cd7f7708570740d7e9a7f650bd4379bf07db9f5234e41536b59");
  });

  it("AES-256-GCM com os cabeçalhos como dados associados", async () => {
    const k = await chavesDaSessao(seq(32, 0x01), seq(32, 0x40), seq(32, 0x80));
    const ct = await cifrarAesGcm(k.pedido, seq(12, 0xa0), aadDoPedido(POSTO, "1764000000", "abcdefghijklmnop"), enc.encode('{"lote":[]}'));
    expect(paraB64(ct)).toBe("h5lHHV5bMDz0HrYWewmePz6sxl47k0cH920P");
  });
});

describe("pedido selado e assinado", () => {
  it("o centro abre o que o posto selou, e o posto abre a resposta", async () => {
    const centro = await chaveDoCentro();
    const aad = aadDoPedido(POSTO, "1764000000", "abcdefghijklmnop");
    const { envelope, chaveResposta } = await selarPedido(centro.publica, centro.kid, aad, { lote: [{ tipo: "documento" }] });
    const aberto = await abrirPedido(envelope, [centro], aad);
    expect(aberto.dados).toEqual({ lote: [{ tipo: "documento" }] });
    expect(hex(aberto.chaveResposta)).toBe(hex(chaveResposta));
    const r = await selarResposta(aberto.chaveResposta, "abcdefghijklmnop", { recebidos: 1 });
    expect(await abrirResposta(chaveResposta, "abcdefghijklmnop", r)).toEqual({ recebidos: 1 });
    // a resposta de um pedido não abre com o nonce de outro
    await expect(abrirResposta(chaveResposta, "outro-nonce-qualquer", r)).rejects.toThrow();
  });

  it("recusa o envelope mexido, com outros cabeçalhos, de outra chave ou com um kid desconhecido", async () => {
    const centro = await chaveDoCentro();
    const aad = aadDoPedido(POSTO, "1764000000", "abcdefghijklmnop");
    const { envelope } = await selarPedido(centro.publica, centro.kid, aad, { lote: [] });
    const ct = deB64(envelope.ct);
    ct[0] ^= 1;
    await expect(abrirPedido({ ...envelope, ct: paraB64(ct) }, [centro], aad)).rejects.toThrow();
    await expect(abrirPedido(envelope, [centro], aadDoPedido(POSTO, "1764000001", "abcdefghijklmnop"))).rejects.toThrow();
    await expect(abrirPedido(envelope, [{ ...(await chaveDoCentro()), kid: "1" }], aad)).rejects.toThrow();
    await expect(abrirPedido({ ...envelope, kid: "9" }, [centro], aad)).rejects.toThrow(/volte a emparelhar/);
    await expect(abrirPedido({ ...envelope, v: 2 }, [centro], aad)).rejects.toThrow(/desconhecido/);
  });

  it("uma chave antiga ainda se aceita durante a troca (kid)", async () => {
    const antiga = await chaveDoCentro("1");
    const nova = await chaveDoCentro("2");
    const aad = aadDoPedido(POSTO, "1764000000", "abcdefghijklmnop");
    const { envelope } = await selarPedido(antiga.publica, "1", aad, { ok: true });
    expect((await abrirPedido(envelope, [nova, antiga], aad)).dados).toEqual({ ok: true });
  });

  it("assinatura Ed25519 sobre a mensagem com o resumo do corpo", async () => {
    const par = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publica = paraB64(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)));
    const corpo = JSON.stringify({ v: 1 });
    const msg = mensagemAssinada(POSTO, "1764000000", "abcdefghijklmnop", await sha256Hex(corpo));
    const sig = paraB64(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, par.privateKey, enc.encode(msg))));
    expect(await assinaturaValida(publica, msg, sig)).toBe(true);
    // outro corpo, outra hora, outra chave, lixo
    expect(await assinaturaValida(publica, mensagemAssinada(POSTO, "1764000000", "abcdefghijklmnop", await sha256Hex("{}")), sig)).toBe(false);
    expect(await assinaturaValida(publica, mensagemAssinada(POSTO, "1764000001", "abcdefghijklmnop", await sha256Hex(corpo)), sig)).toBe(false);
    const outra = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    expect(await assinaturaValida(paraB64(new Uint8Array(await crypto.subtle.exportKey("raw", outra.publicKey))), msg, sig)).toBe(false);
    expect(await assinaturaValida("lixo", msg, sig)).toBe(false);
    expect(await assinaturaValida(publica, msg, "")).toBe(false);
  });

  it("a hora tem de estar a menos de 5 minutos, e o nonce bem formado", () => {
    expect(horaValida("1764000000", 1764000000 + 299)).toBe(true);
    expect(horaValida("1764000000", 1764000000 - 300)).toBe(true);
    expect(horaValida("1764000000", 1764000000 + 301)).toBe(false);
    expect(horaValida("17640000.5", 1764000000)).toBe(false);
    expect(horaValida(null)).toBe(false);
    expect(nonceValido("abcdefghijklmnop")).toBe(true);
    expect(nonceValido("curto")).toBe(false);
    expect(nonceValido("com espaços e mais coisas")).toBe(false);
  });
});

describe("chaves e códigos", () => {
  it("KANGEST_SINC_CHAVES: lista ou objecto, só chaves de 32 bytes", async () => {
    const c = await chaveDoCentro();
    expect(lerChavesSinc(JSON.stringify([c]))).toEqual([c]);
    expect(lerChavesSinc(JSON.stringify(c))).toEqual([c]);
    expect(lerChavesSinc(JSON.stringify([{ ...c, publica: paraB64(seq(16, 0)) }]))).toEqual([]);
    expect(lerChavesSinc("não é json")).toEqual([]);
    expect(lerChavesSinc(undefined)).toEqual([]);
  });

  it("códigos de emparelhamento: XXXX-XXXX, sem 0/O nem 1/I, e a normalização do que se escreve", () => {
    for (let i = 0; i < 50; i++) expect(codigoEmparelhamento()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizarCodigo(" abcd-ef23 ")).toBe("ABCDEF23");
  });
});

describe("dados pessoais cifrados por coluna", () => {
  const segredo = paraB64(seq(32, 7));

  it("cifra e decifra; o mesmo texto dá cifras diferentes; o índice cego é sempre o mesmo", async () => {
    const c = (await lerCifraDados(segredo))!;
    const a = await cifrarCampo(c, "5000123456");
    const b = await cifrarCampo(c, "5000123456");
    expect(a).toMatch(/^v1:/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("5000123456");
    expect(await decifrarCampo(c, a)).toBe("5000123456");
    expect(await indiceCego(c, "5000 123 456")).toBe(await indiceCego(c, "5000123456"));
    expect(await indiceCego(c, "5000123456")).not.toBe(await indiceCego(c, "5000123457"));
    // outra chave não abre nem dá o mesmo índice
    const outra = (await lerCifraDados(paraB64(seq(32, 8))))!;
    await expect(decifrarCampo(outra, a)).rejects.toThrow();
    expect(await indiceCego(outra, "5000123456")).not.toBe(await indiceCego(c, "5000123456"));
    expect(await lerCifraDados("curta")).toBeNull();
  });

  it("o lote: só os campos conhecidos, os dados pessoais cifrados e o Consumidor Final sem nada", async () => {
    const c = (await lerCifraDados(segredo))!;
    const documento = {
      id: 15, tipo_codigo: "FR", grupo: "vendas", serie: "W2026", numero: 3, numero_doc: "FR W2026/3", data_emissao: "2026-11-25",
      data_hora: "2026-11-25T10:00:00", entidade_nif: "5000123456", entidade_nome: "Ana Silva", total_liquido: 10000, total_iva: 1400,
      total: 11400, estado: "N", hash: "abc", hash_anterior: "", hash_controlo: "aAbB", hash_versao: 1, armazem_id: 1, extra: "fora",
    };
    const [d] = await prepararLote([{ tipo: "documento", documento, linhas: [{ linha: 1, referencia: "00007", quantidade: 2, total: 11400, outro: 1 }] }], c);
    expect(d.documento.extra).toBeUndefined();
    expect(d.documento.documento_id).toBe(15);
    expect(d.documento.consumidor_final).toBe(false);
    expect(JSON.stringify(d)).not.toContain("5000123456");
    expect(JSON.stringify(d)).not.toContain("Ana Silva");
    expect(await decifrarCampo(c, d.documento.entidade_nome_cifrado)).toBe("Ana Silva");
    expect(d.documento.entidade_nif_indice).toBe(await indiceCego(c, "5000123456"));
    expect(d.linhas).toEqual([{ linha: 1, referencia: "00007", descricao: "", quantidade: 2, preco_unitario: 0, desconto_pct: 0, taxa_iva_pct: 0, valor_liquido: 0, valor_iva: 0, total: 11400 }]);

    const [cf] = await prepararLote([{ tipo: "documento", documento: { ...documento, entidade_nif: "999999999", entidade_nome: "Consumidor Final" } }], c);
    expect(cf.documento).toMatchObject({ consumidor_final: true, entidade_nif_cifrado: "", entidade_nif_indice: "", entidade_nome_cifrado: "" });
    expect(consumidorFinal("")).toBe(true);
    expect(consumidorFinal("5000123456")).toBe(false);

    // um posto antigo não manda os campos da 1.4.5; um novo manda-os, limpos
    expect(d.documento).not.toHaveProperty("canal");
    expect(d.documento).not.toHaveProperty("valor_pendente");
    const [novo] = await prepararLote([{ tipo: "documento", documento: {
      ...documento, canal: "api", operador: "Rui", vencimento: "2026-12-25T00:00:00", valor_pendente: "5700", doc_origem: "FT W2026/1",
    } }], c);
    expect(novo.documento).toMatchObject({ canal: "api", operador: "Rui", vencimento: "2026-12-25", valor_pendente: 5700, doc_origem: "FT W2026/1" });
    const [mau] = await prepararLote([{ tipo: "documento", documento: { ...documento, canal: "outro", vencimento: "amanhã" } }], c);
    expect(mau.documento).not.toHaveProperty("canal");
    expect(mau.documento).not.toHaveProperty("vencimento");

    await expect(prepararLote({}, c)).rejects.toThrow(/lista/);
    await expect(prepararLote(Array.from({ length: 201 }, () => ({ tipo: "documento" })), c)).rejects.toThrow(/200/);
  });

  it("as dívidas para o painel: o nome do balcão decifrado; o que não abre fica «(cifrado)»", async () => {
    const c = (await lerCifraDados(segredo))!;
    const nome = await cifrarCampo(c, "Ana Silva");
    const outra = (await lerCifraDados(paraB64(seq(32, 8))))!;
    const r = await dividasParaOPainel([
      { store_id: "l1", origem: "balcao", numero: "FT A/1", data: "2026-11-25", vencimento: "2026-12-25", total: "114.00", pendente: "57.00", cliente: "", cliente_cifrado: nome },
      { store_id: "l1", origem: "site", numero: "LIV-9", total: 90, pendente: 90, cliente: "Rui", cliente_cifrado: "" },
      { store_id: "l1", origem: "balcao", numero: "FT A/2", total: 1, pendente: 1, cliente: "", cliente_cifrado: await cifrarCampo(outra, "Outro") },
    ], c);
    expect(r[0]).toEqual({ store_id: "l1", origem: "balcao", numero: "FT A/1", data: "2026-11-25", vencimento: "2026-12-25", total: 114, pendente: 57, cliente: "Ana Silva" });
    expect(r[1].cliente).toBe("Rui");
    expect(r[2].cliente).toBe("(cifrado)");
    expect((await dividasParaOPainel([{ origem: "balcao", cliente_cifrado: nome, pendente: 1 }], null))[0].cliente).toBe("(cifrado)");
    expect(JSON.stringify(r)).not.toContain("cliente_cifrado");
  });

  it("o fecho de caixa: só os campos conhecidos, o resumo com limite e as encomendas como texto", async () => {
    const c = (await lerCifraDados(segredo))!;
    const [f] = await prepararLote([{ tipo: "fecho", fecho: {
      fecho_id: 3, sessao_id: 9, numero_z: 12, posto: "Caixa 1", aberta_em: "2026-11-25T08:00:00", fechada_em: "2026-11-25T18:00:00",
      total_vendido: "342000", numerario_esperado: 228000, valor_contado: 228000, online_total: 364000, online_incluidas: true,
      reconstruido: "sim", selo: "a".repeat(64), selo_resumo: "b".repeat(64), resumo: { sessao: { numero_z: 12 } }, encomendas: ["LIV-77", 5], extra: "fora",
    } }], c);
    expect(f.tipo).toBe("fecho");
    expect(f.fecho).toMatchObject({ fecho_id: 3, numero_z: 12, total_vendido: 342000, online_incluidas: true, reconstruido: false, encomendas: ["LIV-77", "5"] });
    expect(f.fecho.extra).toBeUndefined();
    expect(f.fecho.resumo).toEqual({ sessao: { numero_z: 12 } });
    const [lista] = await prepararLote([{ tipo: "fecho", fecho: { fecho_id: 1, resumo: [1, 2] } }], c);
    expect(lista.fecho.resumo).toEqual({});
    await expect(prepararLote([{ tipo: "fecho", fecho: { fecho_id: 1, resumo: { x: "y".repeat(MAX_RESUMO_FECHO) } } }], c)).rejects.toThrow(/resumo de um fecho/);
  });

  it("o stock e os artigos: o estado de cada armazém e o artigo, só com os campos conhecidos", async () => {
    const c = (await lerCifraDados(segredo))!;
    const [s, a, outro] = await prepararLote([
      {
        tipo: "stock", artigo_id: 7, referencia: " LIV-001 ", descricao: "fora",
        armazens: [{ armazem_id: 1, armazem: "Loja", quantidade: 5, reservado: 1, disponivel: 4, ultima_entrada: "x" }],
      },
      {
        tipo: "artigo", artigo_id: 7,
        artigo: { referencia: "LIV-001", descricao: "Caminho a Cristo", tipo: "P", preco1_iva: 285000.4, ativo: true, codigo_barras: "978", custo_medio: 1 },
      },
      { tipo: "outra-coisa", x: 1 },
    ], c);
    expect(s).toEqual({ tipo: "stock", artigo_id: 7, referencia: "LIV-001", armazens: [{ armazem_id: 1, quantidade: 5, reservado: 1, disponivel: 4 }] });
    expect(a).toEqual({
      tipo: "artigo", artigo_id: 7,
      artigo: { referencia: "LIV-001", descricao: "Caminho a Cristo", tipo: "P", preco1_iva: 285000, ativo: true, codigo_barras: "978" },
    });
    expect(outro).toEqual({ tipo: "outra-coisa" });
    // inactivo como no SQLite do KanGest (0) ou como no aviso (false)
    const [i0, i1] = await prepararLote([
      { tipo: "artigo", artigo: { referencia: "A", ativo: 0 } },
      { tipo: "artigo", artigo: { referencia: "B", ativo: false } },
    ], c);
    expect([i0.artigo.ativo, i1.artigo.ativo]).toEqual([false, false]);
    await expect(prepararLote([{ tipo: "stock", referencia: "X", armazens: Array.from({ length: 101 }, (_, i) => ({ armazem_id: i })) }], c)).rejects.toThrow(/armazéns/);
  });
});

describe("limparEstadoComputador", () => {
  it("guarda só os campos da lista, com os tipos e os limites conferidos", () => {
    const e = limparEstadoComputador({
      versao: "1.4.7 Livraria", sistema: "macos aarch64", nucleos: 8, memoria: 17179869184, espaco_livre: 52_000_000_000,
      base_bytes: 9_000_000, ultima_copia: "2026-11-26T08:00:00Z", copia_externa_erro: false, modo: "servidor",
      fe_rejeitados: 0, por_enviar: 3, verificacao: "ok", bandeja: true, acordado: true,
      // o que não está na lista não passa
      cliente: "Ana Domingos", nif: "5417000001", caminho: "/Users/ana/Library",
    });
    expect(e).toEqual({
      versao: "1.4.7 Livraria", sistema: "macos aarch64", nucleos: 8, memoria: 17179869184, espaco_livre: 52_000_000_000,
      base_bytes: 9_000_000, ultima_copia: "2026-11-26T08:00:00.000Z", copia_externa_erro: false, modo: "servidor",
      fe_rejeitados: 0, por_enviar: 3, verificacao: "ok", bandeja: true, acordado: true,
    });
  });

  it("deita fora os valores com o tipo ou o limite errado", () => {
    expect(limparEstadoComputador({ nucleos: -1, memoria: "muita", modo: "administrador", verificacao: "talvez", ultima_copia: "ontem", bandeja: "sim", versao: `x${"\u0007"}y` }))
      .toEqual({ versao: "xy" });
    expect(limparEstadoComputador(null)).toBeNull();
    expect(limparEstadoComputador([1, 2])).toBeNull();
    expect(limparEstadoComputador("estado")).toBeNull();
  });
});

describe("prepararLote: os movimentos da tesouraria (o ERP central)", () => {
  it("passa só os campos da lista e recusa a data ou o valor errados", async () => {
    const c = await lerCifraDados(paraB64(seq(32, 9)));
    const [m] = await prepararLote([{
      tipo: "movimento",
      movimento: { movimento_id: 7, data: "2026-11-26", data_hora: "2026-11-26T10:00:00", conta: "Caixa", tipo: "entrada", valor: 570000, categoria: "Vendas", documento: "FR 2026/7", anulado: false, descricao: "Pago pela Ana Domingos", entidade: "Ana" },
    }], c!);
    expect(m).toEqual({
      tipo: "movimento",
      movimento: { movimento_id: 7, data: "2026-11-26", data_hora: "2026-11-26T10:00:00", conta: "Caixa", tipo: "entrada", valor: 570000, categoria: "Vendas", documento: "FR 2026/7", anulado: false },
    });
    await expect(prepararLote([{ tipo: "movimento", movimento: { movimento_id: 8, data: "26/11/2026", valor: 1 } }], c!)).rejects.toThrow(/data/);
    await expect(prepararLote([{ tipo: "movimento", movimento: { movimento_id: 9, data: "2026-11-26", valor: -1 } }], c!)).rejects.toThrow(/negativo/);
  });
});

describe("limparSessoesKanGest (KANGEST ONE, A3)", () => {
  it("passa só os campos da lista, sem tokens, e recusa as chaves inválidas ou repetidas", () => {
    const l = limparSessoesKanGest([
      {
        id: "0123456789abcdef", nome: "Admin\u0007", login: "admin", perfil: "ADMIN", conta_site: false, recurso: true,
        aparelho: "Programa KanGest (Posto#1)", local: "", pela_internet: false, offline: false,
        inicio: "2026-11-26T10:00:00+01:00", token: "segredo", refresh_token: "segredo",
      },
      { id: "0123456789abcdef", nome: "Repetida" },
      { id: "XYZ", nome: "Chave inválida" },
      { id: "fedcba9876543210", nome: "x".repeat(200), recurso: "sim", inicio: "ontem" },
      "texto",
      null,
    ]);
    expect(l).toEqual([
      {
        id: "0123456789abcdef", nome: "Admin", login: "admin", perfil: "ADMIN", conta_site: false, recurso: true,
        aparelho: "Programa KanGest (Posto#1)", local: "", pela_internet: false, offline: false, inicio: "2026-11-26T09:00:00.000Z",
      },
      {
        id: "fedcba9876543210", nome: "x".repeat(80), login: "", perfil: "", conta_site: false, recurso: false,
        aparelho: "", local: "", pela_internet: false, offline: false, inicio: null,
      },
    ]);
    expect(JSON.stringify(l)).not.toContain("segredo");
  });

  it("sem lista dá null (um KanGest antigo); no máximo 100", () => {
    expect(limparSessoesKanGest(undefined)).toBeNull();
    expect(limparSessoesKanGest({ id: "0123456789abcdef" })).toBeNull();
    expect(limparSessoesKanGest([])).toEqual([]);
    const muitas = Array.from({ length: 130 }, (_, i) => ({ id: i.toString(16).padStart(16, "0") }));
    expect(limparSessoesKanGest(muitas)).toHaveLength(100);
  });
});

describe("limparLivroStock (KANGEST ONE, B1)", () => {
  it("passa só os campos da lista e deixa de fora o que não se pode marcar", () => {
    const l = limparLivroStock({
      epoca: "20261126T115500",
      aberturas: [
        { armazem_id: 1, referencia: " LIV-001 ", quantidade: 12.00049, momento: "2026-11-26T10:00:00+01:00", custo: 999 },
        { armazem_id: 1, referencia: "", quantidade: 1 },
        { armazem_id: -1, referencia: "X", quantidade: 1 },
        { armazem_id: 2, referencia: "X", quantidade: "3" },
      ],
      movimentos: [
        { mov_id: 7, armazem_id: 1, referencia: "LIV-001", quantidade: -2, tipo: "venda", documento: "FR A/12", momento: "ontem", cliente: "Ana" },
        { mov_id: 8, armazem_id: 1, referencia: "LIV-001", quantidade: 1, tipo: "outra" },
        { mov_id: 0, armazem_id: 1, referencia: "LIV-001", quantidade: 1, tipo: "venda" },
        { armazem_id: 1, referencia: "LIV-001", quantidade: 1, tipo: "venda" },
      ],
      segredo: "x",
    });
    expect(l).toEqual({
      epoca: "20261126T115500",
      aberturas: [{ armazem_id: 1, referencia: "LIV-001", quantidade: 12, momento: "2026-11-26T09:00:00.000Z" }],
      movimentos: [
        { mov_id: 7, armazem_id: 1, referencia: "LIV-001", quantidade: -2, tipo: "venda", documento: "FR A/12", momento: null },
        { mov_id: 8, armazem_id: 1, referencia: "LIV-001", quantidade: 1, tipo: "outra", documento: "", momento: null },
      ],
    });
    expect(JSON.stringify(l)).not.toContain("Ana");
  });

  it("sem nada dá null; no máximo 2000 de cada", () => {
    expect(limparLivroStock(undefined)).toBeNull();
    expect(limparLivroStock([1])).toBeNull();
    expect(limparLivroStock({})).toEqual({ epoca: "", aberturas: [], movimentos: [] });
    expect(limparLivroStock({ epoca: "x'; drop" })!.epoca).toBe("");
    const muitos = Array.from({ length: 2100 }, (_, i) => ({ mov_id: i + 1, armazem_id: 1, referencia: "R", quantidade: 1, tipo: "venda" }));
    expect(limparLivroStock({ movimentos: muitos })!.movimentos).toHaveLength(2000);
  });
});

describe("limparFotosKanGest (as fotografias do KanGest para as capas do site)", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const webp = new Uint8Array([...enc.encode("RIFF"), 1, 0, 0, 0, ...enc.encode("WEBPVP8 "), 0, 0]);
  const dataUrl = (tipo: string, b: Uint8Array) => `data:image/${tipo};base64,${paraB64(b)}`;

  it("conhece JPEG, PNG e WebP pelos primeiros bytes, e mais nada", () => {
    expect(tipoDaImagem(jpeg)).toEqual({ tipo: "image/jpeg", extensao: "jpg" });
    expect(tipoDaImagem(png)).toEqual({ tipo: "image/png", extensao: "png" });
    expect(tipoDaImagem(webp)).toEqual({ tipo: "image/webp", extensao: "webp" });
    expect(tipoDaImagem(enc.encode("<svg onload=alert(1)></svg>"))).toBeNull();
  });

  it("sem fotografias (um KanGest antigo) é null", () => {
    expect(limparFotosKanGest(undefined)).toBeNull();
    expect(limparFotosKanGest([])).toBeNull();
    expect(limparFotosKanGest({ artigo_id: 1 })).toBeNull();
  });

  it("aceita uma fotografia com a referência, a versão e os bytes conferidos", () => {
    const l = limparFotosKanGest([{ artigo_id: 7, referencia: " LIV-001 ", versao: "2026-11-27T10:00:00.000", imagem: dataUrl("jpeg", jpeg) }]);
    expect(l?.recusadas).toEqual([]);
    expect(l?.fotos).toHaveLength(1);
    expect(l?.fotos[0]).toMatchObject({ artigo_id: 7, referencia: "LIV-001", versao: "2026-11-27T10:00:00.000", tipo: "image/jpeg", extensao: "jpg" });
    expect(Array.from(l!.fotos[0].bytes)).toEqual(Array.from(jpeg));
  });

  it("só uma por volta: o resto fica para a volta seguinte", () => {
    const f = (id: number) => ({ artigo_id: id, referencia: `R${id}`, versao: "v", imagem: dataUrl("png", png) });
    const l = limparFotosKanGest([f(1), f(2), f(3)]);
    expect(l?.fotos.map((x) => x.artigo_id)).toEqual([1]);
  });

  it("recusa, com o motivo, o que não é uma imagem verdadeira ou é grande demais", () => {
    const l = limparFotosKanGest([{ artigo_id: 1, referencia: "R1", versao: "v", imagem: dataUrl("png", jpeg) }]);
    expect(l?.fotos).toEqual([]);
    expect(l?.recusadas).toEqual([{ artigo_id: 1, estado: "recusada", erro: "Os bytes da fotografia não são do tipo que diz." }]);
    const svg = limparFotosKanGest([{ artigo_id: 2, referencia: "R2", imagem: "data:image/svg+xml;base64,PHN2Zz4=" }]);
    expect(svg?.recusadas[0]).toMatchObject({ artigo_id: 2, estado: "recusada" });
    const sem = limparFotosKanGest([{ artigo_id: 3, referencia: "", imagem: dataUrl("webp", webp) }]);
    expect(sem?.recusadas[0]?.erro).toBe("O artigo não tem referência.");
    const grande = new Uint8Array(MAX_FOTO_BYTES + 10);
    grande.set(jpeg);
    const g = limparFotosKanGest([{ artigo_id: 4, referencia: "R4", imagem: dataUrl("jpeg", grande) }]);
    expect(g?.recusadas[0]?.erro).toBe("A fotografia é grande demais para o site.");
  });

  it("ignora o que nem tem um artigo", () => {
    const l = limparFotosKanGest([{ referencia: "R1", imagem: dataUrl("jpeg", jpeg) }, null, "x"]);
    expect(l).toEqual({ fotos: [], recusadas: [] });
  });
});

describe("limparLivrosKanGest (os dados das fichas do KanGest para os produtos do site)", () => {
  it("confere o ISBN-13 pelo algarismo de controlo", () => {
    expect(isbn13Valido("9788534520775")).toBe(true);
    expect(isbn13Valido("9788534520776")).toBe(false);
    expect(isbn13Valido("5601234567890")).toBe(false);
    expect(isbn13Valido("978853452077")).toBe(false);
  });

  it("sem livros (um KanGest antigo) é null", () => {
    expect(limparLivrosKanGest(undefined)).toBeNull();
    expect(limparLivrosKanGest([])).toBeNull();
    expect(limparLivrosKanGest({ artigo_id: 1 })).toBeNull();
  });

  it("limpa os textos, os números e o ISBN, e deixa de fora o que não serve", () => {
    const l = limparLivrosKanGest([
      { artigo_id: 7, referencia: " LIV-001 ", autor: "  Ellen\n G.   White ", editora: "CPB", idioma: "Português", ano: 2024, paginas: 128, isbn: "978-85-345-2077-5" },
      { artigo_id: 8, referencia: "LIV-002", ano: 0, paginas: 2.5, isbn: "9788534520776", autor: "" },
      { artigo_id: 9, referencia: "", autor: "Sem referência" },
      { referencia: "LIV-003", autor: "Sem artigo" },
    ]);
    expect(l).toEqual([
      { artigo_id: 7, referencia: "LIV-001", autor: "Ellen G. White", editora: "CPB", idioma: "Português", ano: 2024, paginas: 128, isbn: "9788534520775" },
    ]);
  });

  it(`no máximo ${MAX_LIVROS} por volta, e os textos com o tamanho das colunas`, () => {
    const muitos = Array.from({ length: MAX_LIVROS + 5 }, (_, i) => ({ artigo_id: i + 1, referencia: `R${i + 1}`, autor: "A".repeat(400) }));
    const l = limparLivrosKanGest(muitos)!;
    expect(l).toHaveLength(MAX_LIVROS);
    expect(l[0].autor).toHaveLength(300);
  });
});

describe("limparPromocoesKanGest (as promoções do KanGest para os produtos do site)", () => {
  it("só datas que existem no calendário", () => {
    expect(dataValida("2026-12-24")).toBe("2026-12-24");
    expect(dataValida("2026-02-30")).toBeNull();
    expect(dataValida("24/12/2026")).toBeNull();
    expect(dataValida(null)).toBeNull();
  });

  it("sem promoções (um KanGest antigo) é null", () => {
    expect(limparPromocoesKanGest(undefined)).toBeNull();
    expect(limparPromocoesKanGest([])).toBeNull();
  });

  it("limpa a percentagem, as datas e o PVP; 0 retira, e o que não tem artigo sai", () => {
    const l = limparPromocoesKanGest([
      { artigo_id: 7, referencia: " LIV-001 ", desconto: 12.345, inicio: "2026-12-01", fim: "2026-12-24", preco1_iva: 570000 },
      { artigo_id: 8, referencia: "LIV-002", desconto: 100, inicio: "ontem", fim: "2026-02-30", preco1_iva: 12.5 },
      { artigo_id: 9, referencia: "LIV-003", desconto: -5 },
      { referencia: "LIV-004", desconto: 10 },
    ]);
    expect(l).toEqual([
      { artigo_id: 7, referencia: "LIV-001", desconto: 12.35, inicio: "2026-12-01", fim: "2026-12-24", preco1_iva: 570000 },
      { artigo_id: 8, referencia: "LIV-002", desconto: 0, inicio: null, fim: null, preco1_iva: null },
      { artigo_id: 9, referencia: "LIV-003", desconto: 0, inicio: null, fim: null, preco1_iva: null },
    ]);
  });

  it(`no máximo ${MAX_PROMOCOES} por volta`, () => {
    const muitas = Array.from({ length: MAX_PROMOCOES + 3 }, (_, i) => ({ artigo_id: i + 1, referencia: `R${i + 1}`, desconto: 5 }));
    expect(limparPromocoesKanGest(muitas)).toHaveLength(MAX_PROMOCOES);
  });
});
