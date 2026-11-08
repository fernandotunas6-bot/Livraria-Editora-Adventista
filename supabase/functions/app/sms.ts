/**
 * SMS pela PRO2SMS (https://pro2sms.ao/api/) e pela Twilio
 * (https://www.twilio.com/docs/messaging/api/message-resource). Guia em docs/SMS.md.
 *
 * Funções puras, mais os pedidos às API com o `fetch` injectável, para serem testadas sem rede. O
 * que usa a base de dados (registo, limites, códigos) fica em index.ts.
 *
 * As credenciais vêm dos segredos PRO2SMS_API_KEY, TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN, e vão só
 * nos cabeçalhos: os endereços ficam nos registos dos servidores.
 */

export type SmsProvider = "pro2sms" | "twilio";
export const SMS_PROVIDER_NAME: Record<SmsProvider, string> = { pro2sms: "PRO2SMS", twilio: "Twilio" };
export const smsProvider = (value: unknown, fallback: SmsProvider): SmsProvider =>
  value === "pro2sms" || value === "twilio" ? value : fallback;

export const PRO2SMS_API = "https://pro2sms.ao/wp-json/pro2sms/v2";
export const TWILIO_API = "https://api.twilio.com/2010-04-01";
export const VERIFY_API = "https://verify.twilio.com/v2";

type Row = Record<string, any>;

/**
 * O número só com dígitos (2449XXXXXXXX), ou "" se não servir. Sem indicativo conta como Angola;
 * outro país só com "+" ou "00" à frente. É assim nos registos e nos códigos; a Twilio recebe-o com
 * o "+" (`smsE164`).
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

export const smsE164 = (number: string) => `+${number}`;

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
 * para 70 caracteres, o que chega a duplicar o custo; por isso vai sem acentos nem emojis.
 */
export function smsText(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[“”„«»‘’–—…•·€ ]/g, (c) => TYPOGRAPHY[c] ?? "")
    .replace(/[*~`]/g, "")
    .replace(/[^\x20-\x7e\n]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Comprimento em GSM-7: estes caracteres gastam dois. */
const gsmLength = (text: string) => text.length + (text.match(/[\^|\\[\]{}~]/g)?.length ?? 0);

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

/** Quanto tempo vale um código. Na Twilio Verify é assim; na PRO2SMS, somos nós que o contamos. */
export const OTP_MINUTES = 10;

/** Um código de 6 dígitos, sem o desvio de usar o resto da divisão. Só para a PRO2SMS. */
export function otpCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return String(buffer[0] % 1_000_000).padStart(6, "0");
}

export function otpMessage(siteName: string, code: string): string {
  return clipSms(smsText(`${siteName}: o seu codigo e ${code}. Valido ${OTP_MINUTES} minutos. Nao o partilhe com ninguem.`));
}

/**
 * O código da PRO2SMS guarda-se só como este resumo, ligado à conta e ao número: não serve noutra
 * conta nem noutro número. O `pepper` fica fora da base de dados, porque 6 dígitos sem ele descobrem-se.
 */
export async function otpHash(userId: string, number: string, code: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}:${number}:${code}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isVerifyService = (sid: unknown) => /^VA[0-9a-f]{32}$/i.test(String(sid ?? ""));

export type SmsResult = { ok: boolean; id?: string; status?: string; parts?: number; code?: string; error?: string };

/** A Twilio responde com a mensagem (`sid`, `status`) ou com o erro (`code`, `message`, `status`). */
export function parseSmsResponse(httpStatus: number, body: Row | null): SmsResult {
  if (httpStatus >= 200 && httpStatus < 300 && !body?.error_code && body?.status !== "failed") {
    const parts = Number(body?.num_segments);
    return {
      ok: true,
      id: String(body?.sid ?? ""),
      status: String(body?.status ?? ""),
      ...(parts > 0 ? { parts } : {}),
    };
  }
  return {
    ok: false,
    code: String(body?.code ?? body?.error_code ?? (httpStatus ? `http_${httpStatus}` : "sem_resposta")),
    error: String(body?.message ?? body?.error_message ?? "A Twilio recusou o pedido."),
  };
}

/** O que dizer à equipa no painel, conforme o erro da Twilio. */
export function smsErrorText(code: string | undefined, fallback = ""): string {
  const known: Record<string, string> = {
    20003: "A Twilio recusou as credenciais: veja os segredos TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN.",
    20429: "Limite de pedidos da Twilio excedido.",
    21211: "Número inválido.",
    21212: "O remetente não é válido.",
    21408: "Angola não está autorizada nesta conta: ligue-a na Twilio, em Messaging → Settings → Geo Permissions.",
    21606: "Este remetente não pode enviar para este destino, nesta conta da Twilio.",
    21608: "Conta de teste da Twilio: só envia para números verificados. Verifique o número ou active a conta.",
    21610: "Este número pediu para não receber SMS.",
    21612: "A Twilio não consegue enviar para este destino com este remetente.",
    21614: "Este número não é um telemóvel: não recebe SMS.",
    60200: "Número inválido.",
    60202: "Demasiadas tentativas. Peça um código novo.",
    60203: "Demasiados códigos pedidos para este número. Aguarde 10 minutos.",
    60212: "Demasiados códigos pedidos para este número. Aguarde um pouco.",
    60410: "A Twilio bloqueou o envio para este prefixo, por suspeita de fraude. O bloqueio dura 12 horas; veja em Verify → Fraud Guard.",
    invalid_phone: "Número inválido.",
    daily_limit: "Teto diário de SMS atingido.",
    insufficient_balance: "Sem saldo na PRO2SMS: carregue a conta.",
    missing_api_key: "Falta a chave da PRO2SMS (segredo PRO2SMS_API_KEY).",
    invalid_api_key: "Chave da PRO2SMS inválida ou revogada: gere outra e actualize o segredo PRO2SMS_API_KEY.",
    permission_denied: "A chave da PRO2SMS não tem esta permissão: veja em API & Integrações, na PRO2SMS.",
    account_not_approved: "A conta da PRO2SMS ainda não está aprovada para produção.",
    ip_not_allowed: "O servidor está fora da lista de IP permitidos desta chave: retire a lista, na PRO2SMS.",
    sender_not_authorized: "O remetente não está aprovado na PRO2SMS.",
    sender_override_disabled: "Esta chave não deixa escolher o remetente: deixe o campo vazio ou active a opção, na PRO2SMS.",
    rate_limit_exceeded: "Limite de pedidos da PRO2SMS excedido.",
    api_disabled: "A API da PRO2SMS está temporariamente indisponível.",
  };
  return (code && known[code]) || fallback || "Não foi possível enviar a SMS.";
}

/**
 * A resposta da PRO2SMS. Sucesso: `{ sms_id, status, cost }` ou `{ message_id, status, parts, charged }`.
 * Erro: `{ code, message }` ou `{ success: false, error, message }`.
 */
export function parsePro2smsResponse(httpStatus: number, body: Row | null): SmsResult {
  if (httpStatus >= 200 && httpStatus < 300 && body?.success !== false) {
    const parts = Number(body?.parts);
    return {
      ok: true,
      id: String(body?.sms_id ?? body?.message_id ?? ""),
      status: String(body?.status ?? ""),
      ...(parts > 0 ? { parts } : {}),
    };
  }
  return {
    ok: false,
    code: String(body?.code ?? body?.error ?? (httpStatus ? `http_${httpStatus}` : "sem_resposta")),
    error: String(body?.message ?? "A PRO2SMS recusou o pedido."),
  };
}

/** Sem chavetas: a PRO2SMS trata {nome} como uma etiqueta e substitui-a por dados do contacto. */
export const pro2smsText = (text: string) => text.replace(/[{}]/g, "");

/** Pedido à API da PRO2SMS. Nunca lança: a falha volta como `{ ok: false }`, com o corpo se o houver. */
export async function pro2smsRequest(
  key: string,
  path: string,
  body?: Row,
  fetchImpl: typeof fetch = fetch,
): Promise<SmsResult & { body?: Row }> {
  try {
    const res = await fetchImpl(`${PRO2SMS_API}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-PRO2SMS-Key": key },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const out = await res.json().catch(() => null) as Row | null;
    return { ...parsePro2smsResponse(res.status, out), ...(out ? { body: out } : {}) };
  } catch (err) {
    return { ok: false, code: "sem_resposta", error: `Sem resposta da PRO2SMS: ${(err as Error)?.message || err}` };
  }
}

/** MG… é um serviço de mensagens da Twilio; o resto (número ou nome até 11 caracteres) é o `From`. */
export const smsSender = (sender: string): Record<string, string> =>
  /^MG[0-9a-f]{32}$/i.test(sender) ? { MessagingServiceSid: sender } : { From: sender };

export type TwilioCredentials = { sid: string; token: string };

async function twilioFetch(
  credentials: TwilioCredentials,
  url: string,
  form: Record<string, string> | undefined,
  fetchImpl: typeof fetch,
): Promise<SmsResult & { body?: Row }> {
  try {
    const res = await fetchImpl(url, {
      method: form ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${btoa(`${credentials.sid}:${credentials.token}`)}`,
        ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      ...(form ? { body: new URLSearchParams(form).toString() } : {}),
      // Quem espera por isto é um pedido de quem está no site.
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null) as Row | null;
    return { ...parseSmsResponse(res.status, body), ...(body ? { body } : {}) };
  } catch (err) {
    return { ok: false, code: "sem_resposta", error: `Sem resposta da Twilio: ${(err as Error)?.message || err}` };
  }
}

/** Pedido à API de mensagens. Nunca lança: a falha volta como `{ ok: false }`, com o corpo se o houver. */
export function twilioRequest(credentials: TwilioCredentials, path: string, form?: Record<string, string>, fetchImpl: typeof fetch = fetch) {
  return twilioFetch(credentials, `${TWILIO_API}/Accounts/${credentials.sid}${path}`, form, fetchImpl);
}

/** Envia o código pela Twilio Verify, que o gera e o guarda. Em português: sem `Locale`, vai conforme o país. */
export function verifySend(credentials: TwilioCredentials, service: string, to: string, fetchImpl: typeof fetch = fetch) {
  return twilioFetch(credentials, `${VERIFY_API}/Services/${service}/Verifications`, { To: to, Channel: "sms", Locale: "pt" }, fetchImpl);
}

export function verifyCheck(credentials: TwilioCredentials, service: string, to: string, code: string, fetchImpl: typeof fetch = fetch) {
  return twilioFetch(credentials, `${VERIFY_API}/Services/${service}/VerificationCheck`, { To: to, Code: code }, fetchImpl);
}

export type VerifyOutcome = "approved" | "wrong" | "expired" | "attempts" | "unavailable";

/**
 * O resultado de uma verificação. Depois de aprovada, expirada ou com as tentativas esgotadas, a
 * Twilio apaga-a e responde 404. Só `approved` confirma: o campo `valid` é antigo.
 */
export function verifyOutcome(res: SmsResult): VerifyOutcome {
  if (res.ok) {
    if (res.status === "approved") return "approved";
    if (res.status === "pending") return "wrong";
    if (res.status === "max_attempts_reached") return "attempts";
    return "expired";
  }
  if (res.code === "60202") return "attempts";
  if (res.code === "20404" || res.code === "http_404") return "expired";
  return "unavailable";
}
