/**
 * Notificações para o app iOS pelo APNs da Apple (docs/APPS.md).
 *
 * O WKWebView do app não recebe Web Push. O app regista-se no APNs e entrega o token do aparelho
 * a `/push/native/subscribe`; o token fica em `push_subscriptions` como os dos navegadores, com o
 * endereço `apns:<token>`. Assim cada aviso que já existe (encomendas, pagamento, biblioteca,
 * comunidade, novidades da app) chega também ao iPhone, pelas mesmas funções de envio, e as
 * contagens do painel incluem os iPhones.
 *
 * Autenticação por token: um JWT ES256 assinado com a chave `.p8` da conta Apple Developer, que
 * a Apple aceita durante uma hora (e não quer renovado mais do que de 20 em 20 minutos). Segredos
 * da Edge Function: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (o conteúdo do .p8), e
 * opcionalmente APNS_TOPIC (o bundle ID) e APNS_ENV=sandbox (só para builds do Xcode em debug;
 * o TestFlight e a App Store usam produção).
 *
 * Sem nada de Deno nem de Supabase: testado no `npm test` (apns.test.ts).
 */

export const APNS_PREFIX = "apns:";
export const APNS_TOPIC_PADRAO = "ao.livrariaadventista.app";

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
  topic: string;
  host: string;
};

/** `badge`: o número no ícone do app (os avisos por ler); sem ele o número não muda. */
export type PushPayload = { title: string; body: string; url: string; tag?: string; badge?: number };

/** Um token de aparelho do APNs: hexadecimal, número par de algarismos (hoje 64). */
export function isApnsToken(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return s.length >= 64 && s.length <= 200 && s.length % 2 === 0 && /^[0-9a-f]+$/i.test(s);
}

/** O endereço guardado em `push_subscriptions.endpoint` para um token do APNs. */
export const apnsEndpoint = (token: string) => `${APNS_PREFIX}${String(token).trim().toLowerCase()}`;

/** O token do APNs de um endereço guardado, ou null se for de um navegador. */
export function apnsTokenOf(endpoint: unknown): string | null {
  const s = String(endpoint ?? "");
  if (!s.startsWith(APNS_PREFIX)) return null;
  const token = s.slice(APNS_PREFIX.length);
  return isApnsToken(token) ? token : null;
}

/** A configuração dos segredos, ou null sem APNs ligado. */
export function apnsConfig(env: (name: string) => string | undefined): ApnsConfig | null {
  const keyId = String(env("APNS_KEY_ID") || "").trim();
  const teamId = String(env("APNS_TEAM_ID") || "").trim();
  // O .p8 colado num segredo chega muitas vezes com `\n` escritos em vez de mudanças de linha.
  const privateKey = String(env("APNS_PRIVATE_KEY") || "").replace(/\\n/g, "\n").trim();
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId) || !privateKey.includes("PRIVATE KEY")) return null;
  const topic = String(env("APNS_TOPIC") || "").trim() || APNS_TOPIC_PADRAO;
  const host = String(env("APNS_ENV") || "").trim().toLowerCase() === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  return { keyId, teamId, privateKey, topic, host };
}

/** O que o iPhone mostra: título, texto e o som; `url` é a página a abrir ao tocar. */
export function apnsPayload(payload: PushPayload) {
  return {
    aps: {
      alert: { title: String(payload.title || "Livraria Adventista").slice(0, 120), body: String(payload.body || "").slice(0, 400) },
      sound: "default",
      ...(payload.tag ? { "thread-id": String(payload.tag).slice(0, 64) } : {}),
      ...(Number.isInteger(payload.badge) && (payload.badge as number) >= 0 ? { badge: Math.min(payload.badge as number, 999) } : {}),
    },
    url: String(payload.url || "/"),
  };
}

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/** A chave do .p8 (PKCS#8, curva P-256) para assinar. */
async function chaveDeAssinatura(pem: string): Promise<CryptoKey> {
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** O JWT do APNs. O WebCrypto já dá a assinatura no formato do JWT (r‖s, 64 bytes). */
export async function apnsJwt(cfg: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64urlJson({ alg: "ES256", kid: cfg.keyId });
  const claims = b64urlJson({ iss: cfg.teamId, iat: nowSeconds });
  const data = new TextEncoder().encode(`${header}.${claims}`);
  const key = await chaveDeAssinatura(cfg.privateKey);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, data));
  return `${header}.${claims}.${b64url(sig)}`;
}

/** O JWT dura uma hora; renova-se aos 50 minutos (e logo, se a Apple o recusar). */
const JWT_VALIDADE_S = 50 * 60;
let jwtGuardado: { chave: string; iat: number; token: string } | null = null;

async function jwtActual(cfg: ApnsConfig, nowSeconds: number) {
  const chave = `${cfg.teamId}:${cfg.keyId}`;
  if (jwtGuardado && jwtGuardado.chave === chave && nowSeconds - jwtGuardado.iat < JWT_VALIDADE_S) return jwtGuardado.token;
  const token = await apnsJwt(cfg, nowSeconds);
  jwtGuardado = { chave, iat: nowSeconds, token };
  return token;
}

/** Só para os testes. */
export const _esquecerJwt = () => { jwtGuardado = null; };

/** As razões da Apple que querem dizer «este aparelho já não recebe»: o token sai. */
const RAZOES_SEM_APARELHO = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

/** Um aviso para um aparelho: 'sent', 'gone' (o token já não serve: apagar) ou 'failed'. */
export async function sendApns(
  cfg: ApnsConfig,
  token: string,
  payload: PushPayload,
  { fetchFn = fetch, nowSeconds = Math.floor(Date.now() / 1000) }: { fetchFn?: typeof fetch; nowSeconds?: number } = {},
): Promise<"sent" | "gone" | "failed"> {
  if (!isApnsToken(token)) return "gone";
  let res: Response;
  try {
    res = await fetchFn(`https://${cfg.host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${await jwtActual(cfg, nowSeconds)}`,
        "apns-topic": cfg.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(nowSeconds + 24 * 3600),
        "content-type": "application/json",
      },
      body: JSON.stringify(apnsPayload(payload)),
    });
  } catch {
    return "failed";
  }
  if (res.ok) return "sent";
  let razao = "";
  try {
    razao = String((await res.json())?.reason || "");
  } catch {
    // sem corpo
  }
  if (res.status === 410 || RAZOES_SEM_APARELHO.has(razao)) return "gone";
  // O JWT foi recusado: o próximo envio assina outro.
  if (res.status === 403) jwtGuardado = null;
  console.log("apns:", res.status, razao);
  return "failed";
}
