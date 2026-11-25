// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Sincronização do KanGest Livraria com a base central (docs/KANGEST-SINCRONIZACAO.md; fase 3 de docs/ECOSSISTEMA.md).
//
// Um posto (uma instalação do KanGest Livraria, o servidor de uma loja) identifica-se pela sua chave Ed25519,
// registada no emparelhamento. Cada pedido leva:
//   - x-kangest-posto, x-kangest-hora (segundos Unix), x-kangest-nonce e x-kangest-assinatura: a assinatura Ed25519
//     de `kangest-sinc/1 \n posto \n hora \n nonce \n sha256(corpo)`;
//   - o corpo selado para o centro: X25519 (uma chave efémera do posto com a chave do centro), HKDF-SHA256 e
//     AES-256-GCM, com os cabeçalhos como dados associados. É o esquema do HPKE, feito com a WebCrypto.
// A resposta vai selada com a segunda chave da mesma sessão: só quem fez o pedido a abre.
//
// Os dados pessoais (o NIF e o nome do cliente da factura) entram na base já cifrados por coluna (AES-256-GCM), com
// um índice cego (HMAC-SHA256) para os ligar sem os decifrar. As chaves vivem nos segredos da Edge Function:
//   KANGEST_SINC_CHAVES = [{"kid":"1","privada":"<X25519, base64>","publica":"<base64>"}]  (a primeira é a actual)
//   KANGEST_DADOS_CHAVE = <32 bytes ao acaso, base64>
// e geram-se com scripts/kangest/chaves-sinc.mjs.
//
// Este ficheiro só usa a WebCrypto (Deno na Edge Function, Node nos testes) e não toca na base de dados.

type Row = Record<string, any>;
/** Bytes num ArrayBuffer próprio: é o que a WebCrypto aceita (BufferSource) no TypeScript do Deno. */
type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8 = (s: string): Bytes => new Uint8Array(enc.encode(s));

export const VERSAO = "kangest-sinc/1";
/** Diferença máxima entre a hora do pedido e a do servidor. */
export const JANELA_SEG = 300;
/** Itens por lote: documentos, stock e artigos juntos. */
export const MAX_DOCUMENTOS = 200;
export const MAX_LINHAS = 500;
/** Armazéns por artigo no stock (um KanGest tem poucos; isto só trava um lote absurdo). */
export const MAX_ARMAZENS = 100;

export function paraB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function deB64(s: string): Bytes {
  const t = atob(String(s ?? ""));
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}

function juntar(a: Uint8Array, b: Uint8Array): Bytes {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(dados: Bytes | string): Promise<string> {
  const bytes = typeof dados === "string" ? utf8(dados) : dados;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

// ---------------------------------------------------------------------------------------------------------------
// Chaves do centro
// ---------------------------------------------------------------------------------------------------------------

export type ChaveCentro = { kid: string; privada: string; publica: string };

/** As chaves X25519 do centro (KANGEST_SINC_CHAVES). A primeira é a que se dá aos postos; as outras ainda se aceitam. */
export function lerChavesSinc(texto: string | undefined | null): ChaveCentro[] {
  if (!texto?.trim()) return [];
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return [];
  }
  const lista = Array.isArray(v) ? v : [v];
  const ok = (s: unknown) => {
    try {
      return typeof s === "string" && deB64(s).length === 32;
    } catch {
      return false;
    }
  };
  return lista
    .filter((c: Row) => c && typeof c.kid === "string" && c.kid.trim() && ok(c.privada) && ok(c.publica))
    .map((c: Row) => ({ kid: c.kid.trim(), privada: c.privada, publica: c.publica }));
}

// PKCS#8 de uma chave privada X25519 (RFC 8410): a WebCrypto não importa a privada «raw».
const PKCS8_X25519 = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);

const privadaX25519 = (raw: Bytes) =>
  crypto.subtle.importKey("pkcs8", juntar(PKCS8_X25519, raw), { name: "X25519" }, false, ["deriveBits"]);
const publicaX25519 = (raw: Bytes) => crypto.subtle.importKey("raw", raw, { name: "X25519" }, false, []);

// ---------------------------------------------------------------------------------------------------------------
// A sessão de um pedido: X25519 → HKDF-SHA256 → AES-256-GCM
// ---------------------------------------------------------------------------------------------------------------

/**
 * As duas chaves de uma sessão a partir do segredo partilhado X25519: a do pedido e a da resposta.
 * HKDF-SHA256 com sal = chave efémera ‖ chave do centro e info = «kangest-sinc/1»; 64 bytes, metade para cada uma.
 * O KanGest faz o mesmo em Rust (src-tauri/src/sinc/cifra.rs), com os vectores de teste de kangestSinc.test.ts.
 */
export async function chavesDaSessao(partilhado: Bytes, epk: Bytes, centro: Bytes): Promise<{ pedido: Bytes; resposta: Bytes }> {
  const base = await crypto.subtle.importKey("raw", partilhado, "HKDF", false, ["deriveBits"]);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: juntar(epk, centro), info: utf8(VERSAO) }, base, 512),
  );
  return { pedido: bits.slice(0, 32), resposta: bits.slice(32) };
}

export async function cifrarAesGcm(chave: Bytes, iv: Bytes, aad: string, dados: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", chave, "AES-GCM", false, ["encrypt"]);
  return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, k, dados));
}

export async function decifrarAesGcm(chave: Bytes, iv: Bytes, aad: string, ct: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", chave, "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, k, ct));
}

/** O que o posto assina em cada pedido. */
export function mensagemAssinada(posto: string, hora: string, nonce: string, corpoHex: string): string {
  return `${VERSAO}\n${posto}\n${hora}\n${nonce}\n${corpoHex}`;
}

/** Os dados associados do envelope do pedido: prendem o corpo cifrado aos cabeçalhos assinados. */
export function aadDoPedido(posto: string, hora: string, nonce: string): string {
  return `${VERSAO}\n${posto}\n${hora}\n${nonce}`;
}

const aadDaResposta = (nonce: string) => `${VERSAO}\nresposta\n${nonce}`;

export async function assinaturaValida(publicaB64: string, mensagem: string, assinaturaB64: string): Promise<boolean> {
  try {
    const pk = deB64(publicaB64);
    const sig = deB64(assinaturaB64);
    if (pk.length !== 32 || sig.length !== 64) return false;
    const k = await crypto.subtle.importKey("raw", pk, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, k, sig, utf8(mensagem));
  } catch {
    return false;
  }
}

/** A hora do pedido (segundos Unix) está dentro da janela? Contra pedidos antigos guardados e repetidos. */
export function horaValida(hora: string | null, agoraSeg = Math.floor(Date.now() / 1000)): boolean {
  if (!hora || !/^\d{9,11}$/.test(hora)) return false;
  return Math.abs(agoraSeg - Number(hora)) <= JANELA_SEG;
}

/** Nonce: 16 a 64 caracteres seguros. */
export const nonceValido = (n: string | null) => !!n && /^[A-Za-z0-9_-]{16,64}$/.test(n);
export const uuidValido = (u: string | null) => !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u);

export type Envelope = { v: number; kid: string; epk: string; iv: string; ct: string };

/** Abre o envelope de um pedido e devolve o JSON e a chave da resposta. Lança se tiver sido mexido. */
export async function abrirPedido(env: Envelope, chaves: ChaveCentro[], aad: string): Promise<{ dados: any; chaveResposta: Bytes }> {
  if (!env || env.v !== 1) throw new Error("Envelope desconhecido.");
  const chave = chaves.find((c) => c.kid === env.kid);
  if (!chave) throw new Error("Chave do centro desconhecida: volte a emparelhar o posto.");
  const epk = deB64(env.epk);
  const iv = deB64(env.iv);
  if (epk.length !== 32 || iv.length !== 12) throw new Error("Envelope inválido.");
  const partilhado = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "X25519", public: await publicaX25519(epk) }, await privadaX25519(deB64(chave.privada)), 256),
  );
  const k = await chavesDaSessao(partilhado, epk, deB64(chave.publica));
  const claro = await decifrarAesGcm(k.pedido, iv, aad, deB64(env.ct));
  return { dados: JSON.parse(dec.decode(claro)), chaveResposta: k.resposta };
}

/** Sela a resposta com a chave da sessão do pedido. */
export async function selarResposta(chave: Bytes, nonce: string, dados: unknown): Promise<{ v: 1; iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await cifrarAesGcm(chave, iv, aadDaResposta(nonce), utf8(JSON.stringify(dados)));
  return { v: 1, iv: paraB64(iv), ct: paraB64(ct) };
}

/** O lado do posto em TypeScript, para os testes e como referência do que o KanGest faz em Rust. */
export async function selarPedido(centroPublicaB64: string, kid: string, aad: string, dados: unknown): Promise<{ envelope: Envelope; chaveResposta: Bytes }> {
  const eph = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const centro = deB64(centroPublicaB64);
  const partilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: "X25519", public: await publicaX25519(centro) }, eph.privateKey, 256));
  const k = await chavesDaSessao(partilhado, epk, centro);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await cifrarAesGcm(k.pedido, iv, aad, utf8(JSON.stringify(dados)));
  return { envelope: { v: 1, kid, epk: paraB64(epk), iv: paraB64(iv), ct: paraB64(ct) }, chaveResposta: k.resposta };
}

export async function abrirResposta(chave: Bytes, nonce: string, r: { iv: string; ct: string }): Promise<any> {
  return JSON.parse(dec.decode(await decifrarAesGcm(chave, deB64(r.iv), aadDaResposta(nonce), deB64(r.ct))));
}

// ---------------------------------------------------------------------------------------------------------------
// Emparelhamento
// ---------------------------------------------------------------------------------------------------------------

// 32 símbolos sem os que se confundem (0/O, 1/I): 256 é múltiplo de 32, por isso cada símbolo sai com a mesma
// probabilidade; 8 símbolos são 40 bits, com 10 minutos de validade, uso único e limite de pedidos.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function codigoEmparelhamento(): string {
  const s = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => ALFABETO[x % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizarCodigo(c: unknown): string {
  return String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ---------------------------------------------------------------------------------------------------------------
// Dados pessoais cifrados por coluna
// ---------------------------------------------------------------------------------------------------------------

export type CifraDados = { cifra: CryptoKey; indice: CryptoKey };

/** As duas chaves dos dados pessoais a partir de KANGEST_DADOS_CHAVE (32 bytes): a da cifra e a do índice cego. */
export async function lerCifraDados(segredoB64: string | undefined | null): Promise<CifraDados | null> {
  let raw: Bytes;
  try {
    raw = deB64(String(segredoB64 ?? "").trim());
  } catch {
    return null;
  }
  if (raw.length !== 32) return null;
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  const derivar = (info: string, alg: AesKeyGenParams | HmacImportParams, usos: KeyUsage[]) =>
    crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(info) }, base, alg, false, usos);
  return {
    cifra: await derivar("kangest-dados/cifra", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
    indice: await derivar("kangest-dados/indice", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign"]),
  };
}

/** «v1:» + base64(iv ‖ texto cifrado); vazio fica vazio. */
export async function cifrarCampo(c: CifraDados, texto: string): Promise<string> {
  if (!texto) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, c.cifra, utf8(texto)));
  return `v1:${paraB64(juntar(iv, ct))}`;
}

export async function decifrarCampo(c: CifraDados, valor: string): Promise<string> {
  if (!valor) return "";
  if (!valor.startsWith("v1:")) throw new Error("Campo cifrado desconhecido.");
  const b = deB64(valor.slice(3));
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, c.cifra, b.slice(12)));
}

/** Índice cego: o mesmo NIF dá sempre o mesmo valor, sem se poder voltar ao NIF sem a chave. */
export async function indiceCego(c: CifraDados, texto: string): Promise<string> {
  const normal = String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normal) return "";
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", c.indice, utf8(normal))));
}

/** O NIF do Consumidor Final (vazio, só noves ou zero): não é um dado pessoal e não se guarda. */
export function consumidorFinal(nif: unknown): boolean {
  const n = String(nif ?? "").replace(/\D/g, "");
  return !n || /^9+$/.test(n) || /^0+$/.test(n);
}

const inteiro = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const texto = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * O lote como entra na base (public.kangest_receber): só os campos conhecidos, com os tamanhos limitados e os dados
 * pessoais cifrados. Lança se o lote for grande demais (o posto parte-o em lotes mais pequenos).
 */
export async function prepararLote(lote: unknown, cifra: CifraDados): Promise<Row[]> {
  if (!Array.isArray(lote)) throw new Error("O lote tem de ser uma lista.");
  if (lote.length > MAX_DOCUMENTOS) throw new Error(`No máximo ${MAX_DOCUMENTOS} itens por lote.`);
  const out: Row[] = [];
  for (const item of lote) {
    // o stock de um artigo em cada armazém, como no aviso stock.alterado do KanGest (webhooks.rs)
    if (item?.tipo === "stock") {
      const armazens = Array.isArray(item.armazens) ? item.armazens : [];
      if (armazens.length > MAX_ARMAZENS) throw new Error(`No máximo ${MAX_ARMAZENS} armazéns por artigo.`);
      out.push({
        tipo: "stock",
        artigo_id: inteiro(item.artigo_id),
        referencia: texto(item.referencia, 60).trim(),
        armazens: armazens.map((a: Row) => ({
          armazem_id: inteiro(a.armazem_id),
          quantidade: numero(a.quantidade),
          reservado: numero(a.reservado),
          disponivel: numero(a.disponivel),
        })),
      });
      continue;
    }
    // o artigo (nome, preço com IVA, se está activo), como no aviso artigo.alterado
    if (item?.tipo === "artigo") {
      const a = item.artigo || {};
      out.push({
        tipo: "artigo",
        artigo_id: inteiro(item.artigo_id),
        artigo: {
          referencia: texto(a.referencia, 60).trim(),
          descricao: texto(a.descricao, 300),
          tipo: texto(a.tipo, 2),
          preco1_iva: inteiro(a.preco1_iva),
          ativo: a.ativo !== false && a.ativo !== 0,
          codigo_barras: texto(a.codigo_barras, 60),
        },
      });
      continue;
    }
    if (item?.tipo !== "documento") {
      out.push({ tipo: texto(item?.tipo, 40) });
      continue;
    }
    const d = item.documento || {};
    const linhas = Array.isArray(item.linhas) ? item.linhas : [];
    if (linhas.length > MAX_LINHAS) throw new Error(`No máximo ${MAX_LINHAS} linhas por documento.`);
    const cf = consumidorFinal(d.entidade_nif);
    out.push({
      tipo: "documento",
      documento: {
        documento_id: inteiro(d.id),
        tipo_codigo: texto(d.tipo_codigo, 10),
        grupo: texto(d.grupo, 30),
        serie: texto(d.serie, 40),
        numero: inteiro(d.numero),
        numero_doc: texto(d.numero_doc, 60),
        data_emissao: texto(d.data_emissao, 10),
        data_hora: texto(d.data_hora, 19),
        armazem_id: d.armazem_id == null ? null : inteiro(d.armazem_id),
        consumidor_final: cf,
        entidade_nif_cifrado: cf ? "" : await cifrarCampo(cifra, texto(d.entidade_nif, 30)),
        entidade_nif_indice: cf ? "" : await indiceCego(cifra, texto(d.entidade_nif, 30)),
        entidade_nome_cifrado: cf ? "" : await cifrarCampo(cifra, texto(d.entidade_nome, 200)),
        total_liquido: inteiro(d.total_liquido),
        total_iva: inteiro(d.total_iva),
        total: inteiro(d.total),
        estado: ["N", "A", "F"].includes(d.estado) ? d.estado : "N",
        motivo_anulacao: texto(d.motivo_anulacao, 300),
        referencia: texto(d.referencia, 100),
        hash: texto(d.hash, 400),
        hash_anterior: texto(d.hash_anterior, 400),
        hash_controlo: texto(d.hash_controlo, 10),
        hash_versao: inteiro(d.hash_versao),
        // os da 1.4.5 (o canal, o operador, o vencimento, o pendente e o documento de origem), só quando o posto os
        // manda: um posto antigo não os tem, e a recepção distingue «não mandou» de «vazio»
        ...(d.canal === "balcao" || d.canal === "api" ? { canal: d.canal } : {}),
        ...(d.operador != null ? { operador: texto(d.operador, 120) } : {}),
        ...(typeof d.vencimento === "string" && /^\d{4}-\d{2}-\d{2}/.test(d.vencimento) ? { vencimento: d.vencimento.slice(0, 10) } : {}),
        ...(d.valor_pendente != null ? { valor_pendente: inteiro(d.valor_pendente) } : {}),
        ...(d.doc_origem != null ? { doc_origem: texto(d.doc_origem, 60) } : {}),
      },
      linhas: linhas.map((l: Row) => ({
        linha: inteiro(l.linha),
        referencia: texto(l.referencia, 60),
        descricao: texto(l.descricao, 300),
        quantidade: numero(l.quantidade),
        preco_unitario: inteiro(l.preco_unitario),
        desconto_pct: numero(l.desconto_pct),
        taxa_iva_pct: numero(l.taxa_iva_pct),
        valor_liquido: inteiro(l.valor_liquido),
        valor_iva: inteiro(l.valor_iva),
        total: inteiro(l.total),
      })),
    });
  }
  return out;
}

/**
 * As dívidas por loja para o painel (GET /admin/relatorios/dividas): os nomes dos clientes do balcão vêm cifrados
 * (como os mandou o posto) e decifram-se aqui, no servidor, só para quem vê os relatórios. Um nome que não abra fica
 * «(cifrado)»: a dívida mostra-se na mesma. Os do site vêm em claro, das encomendas.
 */
export async function dividasParaOPainel(linhas: Row[], cifra: CifraDados | null): Promise<Row[]> {
  const out: Row[] = [];
  for (const r of linhas) {
    let cliente = String(r.cliente ?? "");
    if (!cliente && r.cliente_cifrado) {
      try {
        cliente = cifra ? await decifrarCampo(cifra, String(r.cliente_cifrado)) : "(cifrado)";
      } catch {
        cliente = "(cifrado)";
      }
    }
    out.push({
      store_id: r.store_id ?? null, origem: r.origem === "site" ? "site" : "balcao", numero: String(r.numero ?? ""),
      data: r.data ?? null, vencimento: r.vencimento ?? null, total: numero(r.total), pendente: numero(r.pendente), cliente,
    });
  }
  return out;
}
