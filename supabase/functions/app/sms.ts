/**
 * SMS pela PRO2SMS (https://pro2sms.ao/api/). Guia em docs/SMS.md.
 *
 * Funções puras, mais o pedido à API com o `fetch` injectável, para serem testadas sem rede. O
 * que usa a base de dados (registo, limites, códigos) fica em index.ts.
 *
 * A chave vem do segredo PRO2SMS_API_KEY e vai só no cabeçalho, nunca no endereço: os endereços
 * ficam nos registos dos servidores.
 */

export const PRO2SMS_URL = "https://pro2sms.ao/wp-json/pro2sms/v2";

type Row = Record<string, any>;

/**
 * O número como a API o quer (2449XXXXXXXX), ou "" se não servir. Sem indicativo conta como
 * Angola; outro país só com "+" ou "00" à frente.
 */
export function smsNumber(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits)) return `244${digits}`;
  if (/^2449\d{8}$/.test(digits)) return digits;
  if (/^002449\d{8}$/.test(digits)) return digits.slice(2);
  const international = raw.startsWith("+") ? digits : raw.startsWith("00") ? digits.slice(2) : "";
  // 244 sem ser telemóvel (fixo, incompleto) não recebe SMS.
  if (international.startsWith("244")) return "";
  return /^[1-9]\d{7,14}$/.test(international) ? international : "";
}

export const isAngolaMobile = (number: string) => /^2449\d{8}$/.test(number);

/** Para mostrar sem expor o número inteiro: "+244 9•• ••• 123". */
export function maskedNumber(number: string): string {
  return number.length < 6 ? "•••" : `+${number.slice(0, 3)} ${number[3]}•• ••• ${number.slice(-3)}`;
}

const TYPOGRAPHY: Record<string, string> = {
  "“": '"', "”": '"', "„": '"', "«": '"', "»": '"', "‘": "'", "’": "'",
  "–": "-", "—": "-", "…": "...", "•": "-", "·": "-", "€": "EUR", " ": " ",
};

/**
 * O texto de uma SMS. Um único «ã» muda a codificação de GSM para UCS-2 e cada parte passa de 160
 * para 70 caracteres, o que chega a duplicar o custo; por isso vai sem acentos nem emojis. Sem
 * chavetas: a PRO2SMS trata {nome} como uma etiqueta e substituía-a por dados do contacto.
 */
export function smsText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[“”„«»‘’–—…•·€ ]/g, (c) => TYPOGRAPHY[c] ?? "")
    .replace(/[*~`{}]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Comprimento em GSM-7: estes caracteres gastam dois. */
const gsmLength = (text: string) => text.length + (text.match(/[\^|\\[\]~]/g)?.length ?? 0);

/** Quantas partes (e quantas SMS a pagar) dá um texto já limpo por `smsText`. */
export function smsParts(text: string): number {
  const length = gsmLength(text);
  if (length === 0) return 0;
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

/** Corta o texto para caber em `maxParts` partes, sem cortar a meio de uma palavra quando dá. */
export function clipSms(text: string, maxParts = 1): string {
  const room = maxParts <= 1 ? 160 : 153 * maxParts;
  if (gsmLength(text) <= room) return text;
  let out = text;
  while (gsmLength(out) > room - 3) out = out.slice(0, -1);
  const space = out.lastIndexOf(" ");
  if (space > room * 0.6) out = out.slice(0, space);
  return `${out.trimEnd()}...`;
}

/** Título, detalhe (cortado se preciso) e uma ligação que nunca fica cortada. */
export function smsNotice(parts: { title: string; detail?: string; link?: string }, maxParts = 1): string {
  const title = smsText(parts.title);
  const link = smsText(parts.link);
  const detail = smsText(parts.detail);
  const room = (maxParts <= 1 ? 160 : 153 * maxParts) - (link ? link.length + 1 : 0);
  const head = clipSms(detail ? `${title}: ${detail}` : title, 99);
  const fitted = gsmLength(head) <= room ? head : (() => {
    let out = head;
    while (gsmLength(out) > room - 3) out = out.slice(0, -1);
    return `${out.trimEnd()}...`;
  })();
  return link ? `${fitted}\n${link}` : fitted;
}

/** Um código de 6 dígitos, sem o desvio de usar o resto da divisão. */
export function otpCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

export const OTP_MINUTES = 10;

export function otpMessage(siteName: string, code: string): string {
  return clipSms(smsText(`${siteName}: o seu codigo e ${code}. Valido ${OTP_MINUTES} minutos. Nao o partilhe com ninguem.`));
}

/**
 * O código guarda-se só como este resumo, ligado à conta e ao número: não serve noutra conta nem
 * noutro número. O `pepper` fica fora da base de dados, porque 6 dígitos sem ele descobrem-se logo.
 */
export async function otpHash(userId: string, number: string, code: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${number}:${code}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SmsResult = { ok: boolean; id?: string; status?: string; charged?: number; code?: string; error?: string };

/** A API responde de duas formas em erro: `{ code, message }` e `{ success: false, error, message }`. */
export function parseSmsResponse(httpStatus: number, body: Row | null): SmsResult {
  if (httpStatus >= 200 && httpStatus < 300 && body?.success !== false) {
    const charged = Number(body?.charged ?? body?.cost);
    return {
      ok: true,
      id: String(body?.sms_id ?? body?.message_id ?? ""),
      status: String(body?.status ?? ""),
      ...(Number.isFinite(charged) ? { charged } : {}),
    };
  }
  return {
    ok: false,
    code: String(body?.code ?? body?.error ?? (httpStatus ? `http_${httpStatus}` : "sem_resposta")),
    error: String(body?.message ?? "A PRO2SMS recusou o pedido."),
  };
}

/** O que dizer à equipa no painel, conforme o erro da PRO2SMS. */
export function smsErrorText(code: string | undefined, fallback = ""): string {
  const known: Record<string, string> = {
    insufficient_balance: "Sem saldo na PRO2SMS: carregue a conta.",
    invalid_phone: "Número inválido.",
    missing_api_key: "Falta a chave da API (segredo PRO2SMS_API_KEY).",
    invalid_api_key: "Chave da API inválida ou revogada.",
    permission_denied: "A chave da API não tem esta permissão: veja em API & Integrações, na PRO2SMS.",
    account_not_approved: "A conta da PRO2SMS ainda não está aprovada para produção.",
    ip_not_allowed: "O servidor está fora da lista de IP permitidos desta chave: retire a lista, na PRO2SMS.",
    sender_not_authorized: "O remetente não está aprovado na PRO2SMS.",
    sender_override_disabled: "Esta chave não deixa escolher o remetente: deixe o campo vazio ou active a opção, na PRO2SMS.",
    rate_limit_exceeded: "Limite de pedidos da PRO2SMS excedido.",
    api_disabled: "A API da PRO2SMS está temporariamente indisponível.",
  };
  return (code && known[code]) || fallback || "Não foi possível enviar a SMS.";
}

/** Pedido à API. Nunca lança: a falha volta como `{ ok: false }`, com o corpo em `body` se o houver. */
export async function pro2smsRequest(
  key: string,
  path: string,
  options: { method?: string; body?: Row } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<SmsResult & { body?: Row }> {
  try {
    const res = await fetchImpl(`${PRO2SMS_URL}${path}`, {
      method: options.method || (options.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", "X-PRO2SMS-Key": key },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      // Quem espera por isto é um pedido de quem está no site.
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null) as Row | null;
    return { ...parseSmsResponse(res.status, body), ...(body ? { body } : {}) };
  } catch (err) {
    return { ok: false, code: "sem_resposta", error: `Sem resposta da PRO2SMS: ${(err as Error)?.message || err}` };
  }
}
