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

/** O resumo de um fecho de caixa (o relatório Z sem dados pessoais) tem um tamanho razoável. */
export const MAX_RESUMO_FECHO = 200_000;
const inteiro = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const texto = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const numero = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const lista = (v: unknown, max: number): Row[] =>
  (Array.isArray(v) ? v.slice(0, max) : []).map((x) => (x && typeof x === "object" && !Array.isArray(x) ? x as Row : {}));

/** Os modos de pagamento de um documento (um talão tem um ou dois; isto só trava o absurdo). */
export const MAX_PAGAMENTOS = 20;

/**
 * O que o site precisa para mostrar um documento como o KanGest o imprime, no talão e no A4 (sinc/mod.rs,
 * `impressao_do_documento`; pedido do dono a 27/11: «visualizar os recibos igual ao do KanGest»):
 * - o tipo, o desconto, o que se entregou, o troco e a moeda;
 * - o que se pagou com cada modo;
 * - os documentos que um recibo liquida;
 * - a unidade, a isenção e o lote de cada linha;
 * - o n.º do certificado.
 *
 * Só os campos conhecidos, com os tamanhos limitados. Sem os dados do cliente (seguem cifrados, à parte). Um posto
 * antigo não a manda: o documento mostra-se sem os pagamentos.
 */
export function limparImpressao(v: unknown): Row {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const i = v as Row;
  const talvez = (x: unknown) => (x == null || x === "" ? null : numero(x));
  return {
    tipo_desc: texto(i.tipo_desc, 80),
    classe: texto(i.classe, 20),
    prefixo_extenso: texto(i.prefixo_extenso, 40),
    texto_rodape: texto(i.texto_rodape, 300),
    total_bruto: inteiro(i.total_bruto),
    total_desconto: inteiro(i.total_desconto),
    total_retencao: inteiro(i.total_retencao),
    valor_entregue: inteiro(i.valor_entregue),
    troco: inteiro(i.troco),
    moeda: texto(i.moeda, 3).toUpperCase(),
    cambio: talvez(i.cambio),
    total_moeda: talvez(i.total_moeda),
    motivo: texto(i.motivo, 300),
    certificado: texto(i.certificado, 40),
    pagamentos: lista(i.pagamentos, MAX_PAGAMENTOS).map((p) => ({
      modo_codigo: texto(p.modo_codigo, 10),
      descricao: texto(p.descricao, 80),
      valor: inteiro(p.valor),
      moeda: texto(p.moeda, 3).toUpperCase(),
      valor_moeda: talvez(p.valor_moeda),
      cambio: talvez(p.cambio),
    })),
    liquidacoes: lista(i.liquidacoes, MAX_LINHAS).map((l) => ({
      numero_doc: texto(l.numero_doc, 60),
      data_emissao: texto(l.data_emissao, 10),
      total: inteiro(l.total),
      valor: inteiro(l.valor),
    })),
    linhas: lista(i.linhas, MAX_LINHAS).map((l) => ({
      linha: inteiro(l.linha),
      unidade: texto(l.unidade, 12),
      motivo_isencao: texto(l.motivo_isencao, 10),
      lote: texto(l.lote, 40),
      validade: texto(l.validade, 10),
    })),
  };
}

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
    // um fecho de caixa arquivado (o Z): o resumo vem sem os nomes dos clientes (sinc/fechos.rs) e com o selo do arquivo
    if (item?.tipo === "fecho") {
      const f = item.fecho || {};
      const resumo = f.resumo && typeof f.resumo === "object" && !Array.isArray(f.resumo) ? f.resumo : {};
      if (JSON.stringify(resumo).length > MAX_RESUMO_FECHO) throw new Error(`O resumo de um fecho tem no máximo ${MAX_RESUMO_FECHO} caracteres.`);
      const encomendas = Array.isArray(f.encomendas) ? f.encomendas : [];
      out.push({
        tipo: "fecho",
        fecho: {
          fecho_id: inteiro(f.fecho_id),
          sessao_id: inteiro(f.sessao_id),
          numero_z: f.numero_z == null ? null : inteiro(f.numero_z),
          posto: texto(f.posto, 120),
          armazem_id: f.armazem_id == null ? null : inteiro(f.armazem_id),
          aberta_em: texto(f.aberta_em, 19),
          fechada_em: texto(f.fechada_em, 19),
          operador: texto(f.operador, 120),
          fechado_por: texto(f.fechado_por, 120),
          total_vendido: inteiro(f.total_vendido),
          numerario_esperado: inteiro(f.numerario_esperado),
          valor_contado: inteiro(f.valor_contado),
          online_total: inteiro(f.online_total),
          online_incluidas: f.online_incluidas === true,
          reconstruido: f.reconstruido === true,
          selo: texto(f.selo, 64),
          selo_resumo: texto(f.selo_resumo, 64),
          resumo,
          encomendas: encomendas.slice(0, MAX_LINHAS).map((n: unknown) => texto(n, 60)),
        },
      });
      continue;
    }
    // um movimento da tesouraria (o ERP central; sinc/financeiro.rs): sem a descrição livre nem o cliente
    if (item?.tipo === "movimento") {
      const m = item.movimento || {};
      const data = texto(m.data, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Movimento sem data válida.");
      const valor = inteiro(m.valor);
      if (valor < 0) throw new Error("O valor de um movimento não pode ser negativo.");
      out.push({
        tipo: "movimento",
        movimento: {
          movimento_id: inteiro(m.movimento_id),
          data,
          data_hora: texto(m.data_hora, 19),
          conta: texto(m.conta, 80),
          tipo: m.tipo === "entrada" ? "entrada" : "saida",
          valor,
          categoria: texto(m.categoria, 80),
          documento: texto(m.documento, 40),
          anulado: m.anulado === true,
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
        // o histórico importado do KIGEST (0080 do KanGest): fora da cadeia do KanGest e, nos relatórios, sem contar a dobrar
        ...(d.importado === 1 || d.importado === true ? { importado: true } : {}),
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
      impressao: limparImpressao(item.impressao),
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

// ------------------------------------------------------------------ o estado do computador de cada posto

const MODOS_DO_POSTO = ["sozinho", "servidor", "cliente"] as const;
const VERIFICACOES = ["ok", "avisos", "graves"] as const;

/**
 * O estado do computador que o KanGest manda em cada volta (dentro do envelope assinado e cifrado), para o painel o
 * mostrar por posto (KanGestPostos.jsx). Só uma lista fechada de campos, com os tipos e os limites conferidos: números e
 * marcas do computador, nunca dados pessoais nem da loja. O que não for um objecto dá `null` (não se grava nada).
 */
export function limparEstadoComputador(e: unknown): Record<string, unknown> | null {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const v = e as Record<string, unknown>;
  const inteiro = (x: unknown, max: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? Math.floor(x) : null);
  const texto = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : null);
  const umDe = <T extends string>(x: unknown, lista: readonly T[]) => (typeof x === "string" && (lista as readonly string[]).includes(x) ? x : null);
  const data = (x: unknown) => (typeof x === "string" && x.length <= 40 && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : null);
  const marca = (x: unknown) => (typeof x === "boolean" ? x : null);
  const limpo: Record<string, unknown> = {
    versao: texto(v.versao, 40),
    sistema: texto(v.sistema, 40),
    nucleos: inteiro(v.nucleos, 1024),
    memoria: inteiro(v.memoria, 1e15),
    espaco_livre: inteiro(v.espaco_livre, 1e16),
    base_bytes: inteiro(v.base_bytes, 1e15),
    ultima_copia: data(v.ultima_copia),
    copia_externa_erro: marca(v.copia_externa_erro),
    modo: umDe(v.modo, MODOS_DO_POSTO),
    fe_rejeitados: inteiro(v.fe_rejeitados, 1e6),
    por_enviar: inteiro(v.por_enviar, 1e7),
    verificacao: umDe(v.verificacao, VERIFICACOES),
    bandeja: marca(v.bandeja),
    acordado: marca(v.acordado),
  };
  for (const k of Object.keys(limpo)) if (limpo[k] === null) delete limpo[k];
  return limpo;
}

// ------------------------------------------------------------------ as sessões abertas em cada posto (KANGEST ONE, A3)

const CHAVE_DA_SESSAO = /^[0-9a-f]{16}$/;

/**
 * As sessões abertas que o KanGest manda em cada volta (sinc/sessoes.rs): quem entrou, o perfil, o aparelho e desde
 * quando, nunca tokens. Só os campos da lista, com os tipos e os limites conferidos, e no máximo 100. Sem lista (um
 * KanGest antigo) dá `null`, e a base não mexe nas sessões desse posto (public.kangest_sessoes_receber).
 */
export function limparSessoesKanGest(l: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(l)) return null;
  const texto = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
  const marca = (x: unknown) => x === true;
  const data = (x: unknown) => (typeof x === "string" && x.length <= 40 && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : null);
  const vistas = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const s of l) {
    if (out.length >= 100) break;
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const v = s as Record<string, unknown>;
    const id = typeof v.id === "string" ? v.id : "";
    if (!CHAVE_DA_SESSAO.test(id) || vistas.has(id)) continue;
    vistas.add(id);
    out.push({
      id,
      nome: texto(v.nome, 80),
      login: texto(v.login, 120),
      perfil: texto(v.perfil, 40),
      conta_site: marca(v.conta_site),
      recurso: marca(v.recurso),
      aparelho: texto(v.aparelho, 80),
      local: texto(v.local, 80),
      pela_internet: marca(v.pela_internet),
      offline: marca(v.offline),
      inicio: data(v.inicio),
    });
  }
  return out;
}

// ------------------------------------------------------------------ o livro único de stock (KANGEST ONE, B1)

const MAX_LIVRO = 2000;

/**
 * O que se escreveu na pesquisa dos documentos do KanGest no painel: um NIF (procura-se pelo índice cego, sem decifrar
 * nada) ou parte do número do documento («FR», «K2026/15»). Outra coisa não procura.
 */
export function pesquisaDeDocumentos(q: unknown): { nif: string } | { numero: string } | null {
  const s = String(q ?? "").trim();
  if (!s) return null;
  const nif = s.replace(/[\s.-]/g, "").toUpperCase();
  if (/^\d{9,10}$/.test(nif) || /^\d{9}[A-Z]{2}\d{3}$/.test(nif)) return { nif };
  // só letras, algarismos, espaço, «/» e «-»: entra num filtro ilike sem caracteres especiais
  const numero = s.replace(/\s+/g, " ").slice(0, 40);
  return /^[\p{L}\d /-]+$/u.test(numero) ? { numero } : null;
}

/**
 * Os contactos de uma ficha de cliente ou fornecedor do KanGest (o NIF, os telefones, o email, a morada, a pessoa de
 * contacto e as observações), decifrados para o painel. Sem a chave, ou se não abrir, `null`: a ficha mostra-se sem eles.
 */
export async function pessoaisDaEntidade(cifra: CifraDados | null, cifrado: unknown): Promise<Record<string, unknown> | null> {
  if (!cifra || typeof cifrado !== "string" || !cifrado) return null;
  try {
    const v = JSON.parse(await decifrarCampo(cifra, cifrado));
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, unknown> = {};
    for (const k of PESSOAIS_DA_ENTIDADE) if (k in v) out[k] = v[k];
    return out;
  } catch {
    return null;
  }
}

/** O cliente de um documento do KanGest, decifrado para o painel. Um campo que não abra fica «(cifrado)». */
export async function clienteDoDocumento(
  cifra: CifraDados | null,
  d: { consumidor_final?: boolean; entidade_nome_cifrado?: string; entidade_nif_cifrado?: string },
): Promise<{ nome: string; nif: string }> {
  if (d.consumidor_final !== false) return { nome: "Consumidor final", nif: "999999999" };
  const abrir = async (v?: string) => {
    if (!v) return "";
    if (!cifra) return "(cifrado)";
    try {
      return await decifrarCampo(cifra, v);
    } catch {
      return "(cifrado)";
    }
  };
  return { nome: await abrir(d.entidade_nome_cifrado), nif: await abrir(d.entidade_nif_cifrado) };
}

/** O tamanho máximo de uma fotografia do KanGest para o site, já descodificada (a do KanGest tem até 800 px). */
export const MAX_FOTO_BYTES = 750_000;

/** Uma fotografia de um artigo do KanGest, pronta para o Storage: o tipo vem dos primeiros bytes, não do que diz. */
export interface FotoKanGest {
  artigo_id: number;
  referencia: string;
  versao: string;
  tipo: "image/jpeg" | "image/png" | "image/webp";
  extensao: "jpg" | "png" | "webp";
  bytes: Bytes;
}

/** O tipo de uma imagem pelos primeiros bytes (JPEG, PNG ou WebP), ou `null`. */
export function tipoDaImagem(b: Uint8Array): Pick<FotoKanGest, "tipo" | "extensao"> | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { tipo: "image/jpeg", extensao: "jpg" };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { tipo: "image/png", extensao: "png" };
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { tipo: "image/webp", extensao: "webp" };
  return null;
}

/**
 * As fotografias dos artigos que o KanGest manda para os produtos do site sem capa (KANGEST ONE, integração total;
 * sinc/capas.rs, `para_o_site`). No máximo uma por volta, para o pedido caber no limite. Cada uma tem de ser uma data
 * URL de JPEG, PNG ou WebP, e os bytes têm de ser mesmo dessa imagem. O que não passa sai com o motivo em `recusadas`,
 * para o posto não a mandar outra vez. Sem nada (um KanGest antigo), `null`.
 */
export function limparFotosKanGest(x: unknown): { fotos: FotoKanGest[]; recusadas: { artigo_id: number; estado: string; erro: string }[] } | null {
  if (!Array.isArray(x) || !x.length) return null;
  const fotos: FotoKanGest[] = [];
  const recusadas: { artigo_id: number; estado: string; erro: string }[] = [];
  for (const f of x.slice(0, 1)) {
    if (!f || typeof f !== "object" || Array.isArray(f)) continue;
    const v = f as Record<string, unknown>;
    const artigo_id = typeof v.artigo_id === "number" && Number.isSafeInteger(v.artigo_id) && v.artigo_id > 0 ? v.artigo_id : 0;
    if (!artigo_id) continue;
    const recusar = (erro: string) => recusadas.push({ artigo_id, estado: "recusada", erro });
    const referencia = typeof v.referencia === "string" ? v.referencia.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
    const versao = typeof v.versao === "string" ? v.versao.replace(/[^0-9A-Za-z:. T_-]/g, "").slice(0, 40) : "";
    const imagem = typeof v.imagem === "string" ? v.imagem : "";
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imagem);
    if (!referencia) { recusar("O artigo não tem referência."); continue; }
    if (!m) { recusar("A fotografia não é uma imagem JPEG, PNG ou WebP."); continue; }
    if (m[2].length > Math.ceil((MAX_FOTO_BYTES * 4) / 3) + 4) { recusar("A fotografia é grande demais para o site."); continue; }
    let bytes: Bytes;
    try {
      bytes = deB64(m[2]);
    } catch {
      recusar("A fotografia não se pôde ler.");
      continue;
    }
    const tipo = tipoDaImagem(bytes);
    if (!tipo || tipo.tipo !== `image/${m[1]}`) { recusar("Os bytes da fotografia não são do tipo que diz."); continue; }
    fotos.push({ artigo_id, referencia, versao, ...tipo, bytes });
  }
  return { fotos, recusadas };
}

/** Os livros que o KanGest manda numa volta (sinc/fichas.rs, `MAX_LIVROS`). */
export const MAX_LIVROS = 50;

/** O que a ficha de um artigo do KanGest tem e o produto do site não (só os campos que vêm). */
export interface LivroKanGest {
  artigo_id: number;
  referencia: string;
  autor?: string;
  editora?: string;
  idioma?: string;
  ano?: number;
  paginas?: number;
  isbn?: string;
  /** o género do site ligado à família do artigo (o site só aceita um género que já tenha) */
  genero?: string;
}

/** Um ISBN-13 só com algarismos, começado por 978 ou 979 e com o algarismo de controlo certo. */
export function isbn13Valido(s: string): boolean {
  if (!/^97[89][0-9]{10}$/.test(s)) return false;
  const soma = [...s.slice(0, 12)].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === Number(s[12]);
}

/**
 * Os dados das fichas do KanGest para os produtos do site que não os têm (KANGEST ONE, integração total; sinc/fichas.rs,
 * `livros_para_o_site`; docs/KANGEST-SINCRONIZACAO.md §19). No máximo `MAX_LIVROS` por volta. Os textos ficam numa
 * linha e com o tamanho das colunas, o ano e as páginas só como inteiros dentro do razoável, e o ISBN só se for um
 * ISBN-13 válido. Um livro sem nada que sirva sai. Sem nada (um KanGest antigo), `null`.
 */
export function limparLivrosKanGest(x: unknown): LivroKanGest[] | null {
  if (!Array.isArray(x) || !x.length) return null;
  const texto = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
  const inteiro = (v: unknown, max: number) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= max ? v : 0);
  const out: LivroKanGest[] = [];
  for (const l of x.slice(0, MAX_LIVROS)) {
    if (!l || typeof l !== "object" || Array.isArray(l)) continue;
    const v = l as Record<string, unknown>;
    const artigo_id = inteiro(v.artigo_id, Number.MAX_SAFE_INTEGER);
    const referencia = texto(v.referencia, 60);
    if (!artigo_id || !referencia) continue;
    const livro: LivroKanGest = { artigo_id, referencia };
    const autor = texto(v.autor, 300);
    const editora = texto(v.editora, 300);
    const idioma = texto(v.idioma, 60);
    const ano = inteiro(v.ano, 3000);
    const paginas = inteiro(v.paginas, 100_000);
    const isbn = typeof v.isbn === "string" ? v.isbn.replace(/[^0-9]/g, "") : "";
    if (autor) livro.autor = autor;
    if (editora) livro.editora = editora;
    if (idioma) livro.idioma = idioma;
    if (ano) livro.ano = ano;
    if (paginas) livro.paginas = paginas;
    if (isbn13Valido(isbn)) livro.isbn = isbn;
    const genero = texto(v.genero, 80);
    if (genero) livro.genero = genero;
    if (Object.keys(livro).length > 2) out.push(livro);
  }
  return out.length ? out : null;
}

/** As promoções que o KanGest manda numa volta (sinc/promocoes.rs, `MAX`). */
export const MAX_PROMOCOES = 50;

/** A promoção de um artigo do KanGest: a percentagem (0 retira a que o KanGest pôs), as datas e o PVP com IVA. */
export interface PromocaoKanGest {
  artigo_id: number;
  referencia: string;
  desconto: number;
  inicio: string | null;
  fim: string | null;
  preco1_iva: number | null;
}

/** Uma data AAAA-MM-DD que existe mesmo no calendário, ou `null`. */
export function dataValida(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/**
 * As promoções dos artigos do KanGest para os produtos do site (KANGEST ONE, integração total; sinc/promocoes.rs;
 * docs/KANGEST-SINCRONIZACAO.md §20). No máximo `MAX_PROMOCOES` por volta. A percentagem fica entre 0 e 99,99 (0
 * retira), as datas só se existirem no calendário e o PVP só como inteiro de cêntimos. Sem nada (um KanGest antigo),
 * `null`.
 */
export function limparPromocoesKanGest(x: unknown): PromocaoKanGest[] | null {
  if (!Array.isArray(x) || !x.length) return null;
  const out: PromocaoKanGest[] = [];
  for (const l of x.slice(0, MAX_PROMOCOES)) {
    if (!l || typeof l !== "object" || Array.isArray(l)) continue;
    const v = l as Record<string, unknown>;
    const artigo_id = typeof v.artigo_id === "number" && Number.isSafeInteger(v.artigo_id) && v.artigo_id > 0 ? v.artigo_id : 0;
    const referencia = typeof v.referencia === "string" ? v.referencia.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
    if (!artigo_id || !referencia) continue;
    const d = typeof v.desconto === "number" && Number.isFinite(v.desconto) ? Math.round(v.desconto * 100) / 100 : 0;
    const pvp = typeof v.preco1_iva === "number" && Number.isSafeInteger(v.preco1_iva) && v.preco1_iva > 0 ? v.preco1_iva : null;
    out.push({
      artigo_id,
      referencia,
      desconto: d > 0 && d < 100 ? d : 0,
      inicio: dataValida(v.inicio),
      fim: dataValida(v.fim),
      preco1_iva: pvp,
    });
  }
  return out.length ? out : null;
}

/**
 * O que o KanGest manda para o livro de stock (sinc/livro.rs): as aberturas (a existência de cada artigo em cada
 * armazém, na primeira volta) e os movimentos novos (`movimentos_stock`, com o id local, o tipo e o documento). Só os
 * campos da lista, com os tipos e os limites conferidos, e no máximo 2000 de cada. Um movimento sem id não se pode
 * marcar no posto e fica de fora; um de tipo desconhecido segue, para a base o devolver como erro
 * (public.stock_livro_receber). Sem nada (um KanGest antigo), `null`.
 */
export function limparLivroStock(x: unknown): { epoca: string; aberturas: Record<string, unknown>[]; movimentos: Record<string, unknown>[] } | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const v = x as Record<string, unknown>;
  const texto = (t: unknown, max: number) => (typeof t === "string" ? t.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
  const id = (n: unknown) => (typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null);
  const armazem = (n: unknown) => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null);
  const qtd = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e9 ? Math.round(n * 1000) / 1000 : null);
  const data = (t: unknown) => (typeof t === "string" && t.length <= 40 && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString() : null);
  const lista = (l: unknown) => (Array.isArray(l) ? l.filter((i) => i && typeof i === "object" && !Array.isArray(i)).slice(0, MAX_LIVRO) : []);
  const aberturas = [];
  for (const a of lista(v.aberturas) as Record<string, unknown>[]) {
    const r = { armazem_id: armazem(a.armazem_id), referencia: texto(a.referencia, 60), quantidade: qtd(a.quantidade), momento: data(a.momento) };
    if (r.armazem_id !== null && r.referencia && r.quantidade !== null) aberturas.push(r);
  }
  const movimentos = [];
  for (const m of lista(v.movimentos) as Record<string, unknown>[]) {
    const mov_id = id(m.mov_id);
    if (mov_id === null) continue;
    const tipo = texto(m.tipo, 20);
    movimentos.push({
      mov_id,
      armazem_id: armazem(m.armazem_id),
      referencia: texto(m.referencia, 60),
      quantidade: qtd(m.quantidade),
      // um tipo fora da lista segue como veio: a base devolve-o como erro, e o posto vê-o
      tipo: tipo || "desconhecido",
      documento: texto(m.documento, 60),
      momento: data(m.momento),
    });
  }
  // a época da abertura (a mesma em todas as aberturas dela): letras, algarismos e pouco mais
  const epoca = typeof v.epoca === "string" && /^[0-9A-Za-z:.+_-]{1,40}$/.test(v.epoca) ? v.epoca : "";
  return { epoca, aberturas, movimentos };
}

/** As fichas que o KanGest manda numa volta (sinc/registos.rs, `LOTE` = 100; o site aceita até 200). */
export const MAX_REGISTOS = 200;
/** O tamanho máximo dos dados de uma ficha, em texto. */
const MAX_DADOS_REGISTO = 20_000;
/** Os dados pessoais de uma entidade, que se guardam cifrados (a mesma chave do NIF dos documentos). */
export const PESSOAIS_DA_ENTIDADE = ["nif", "telefone", "telefone2", "email", "endereco", "pessoa_contacto", "observacoes"];
/** Nomes de campos que nunca entram na base, mesmo que um KanGest os mande por engano. */
const CAMPO_PROIBIDO = /hash|segredo|totp|pin|senha|password|token|recuperacao/i;

/** Uma ficha pronta para `kangest_registos_receber`. */
export interface RegistoKanGest {
  registo: "entidade" | "artigo" | "utilizador";
  chave: number;
  dados: Record<string, unknown>;
  pessoais_cifrado: string;
}

/**
 * As fichas do KanGest (entidades, artigos completos, utilizadores; sinc/registos.rs; docs/KANGEST-SINCRONIZACAO.md
 * §22), limpas: só os três tipos, o número inteiro, os dados num objecto razoável, sem campos de senhas ou segredos, e,
 * numa entidade, os dados pessoais cifrados à parte. Sem fichas (um KanGest antigo), `null`.
 */
export async function prepararRegistos(x: unknown, cifra: CifraDados): Promise<RegistoKanGest[] | null> {
  if (!Array.isArray(x) || !x.length) return null;
  const out: RegistoKanGest[] = [];
  for (const item of x.slice(0, MAX_REGISTOS)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const v = item as Record<string, unknown>;
    const registo = v.registo;
    if (registo !== "entidade" && registo !== "artigo" && registo !== "utilizador") continue;
    const chave = typeof v.chave === "number" && Number.isSafeInteger(v.chave) && v.chave > 0 ? v.chave : 0;
    if (!chave || !v.dados || typeof v.dados !== "object" || Array.isArray(v.dados)) continue;
    if (JSON.stringify(v.dados).length > MAX_DADOS_REGISTO) continue;
    const dados: Record<string, unknown> = {};
    for (const [k, valor] of Object.entries(v.dados as Record<string, unknown>)) {
      if (!CAMPO_PROIBIDO.test(k)) dados[k] = valor;
    }
    let pessoais_cifrado = "";
    if (registo === "entidade") {
      const pessoais: Record<string, unknown> = {};
      for (const k of PESSOAIS_DA_ENTIDADE) {
        if (k in dados) {
          if (dados[k] !== null && dados[k] !== "") pessoais[k] = dados[k];
          delete dados[k];
        }
      }
      pessoais_cifrado = Object.keys(pessoais).length ? await cifrarCampo(cifra, JSON.stringify(pessoais)) : "";
    }
    out.push({ registo, chave, dados, pessoais_cifrado });
  }
  return out.length ? out : null;
}

/** O tamanho máximo da fotografia das configurações de um posto (sinc/configuracoes.rs, `MAX_FOTOGRAFIA`, com folga). */
export const MAX_CONFIGURACOES = 400_000;

/** Tira, a qualquer profundidade, as chaves com cara de segredo (o posto já as tirou; aqui é por cautela). */
function semSegredos(v: unknown, profundidade = 0): unknown {
  if (profundidade > 8) return null;
  if (Array.isArray(v)) return v.map((x) => semSegredos(x, profundidade + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (!CAMPO_PROIBIDO.test(k)) out[k] = semSegredos(x, profundidade + 1);
    }
    return out;
  }
  return v;
}

/**
 * As configurações de um posto (pedido do dono a 27/11: «permita que as configurações sejam guardadas no banco de
 * dados»; sinc/configuracoes.rs): o resumo SHA-256 e a fotografia, sem segredos. `null` se não tiver a forma certa ou
 * passar do tamanho.
 */
export function limparConfiguracoes(x: unknown): { resumo: string; dados: Record<string, unknown> } | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const v = x as Record<string, unknown>;
  const resumo = typeof v.resumo === "string" && /^[0-9a-f]{64}$/.test(v.resumo) ? v.resumo : "";
  if (!resumo || !v.dados || typeof v.dados !== "object" || Array.isArray(v.dados)) return null;
  if (JSON.stringify(v.dados).length > MAX_CONFIGURACOES) return null;
  return { resumo, dados: semSegredos(v.dados) as Record<string, unknown> };
}
