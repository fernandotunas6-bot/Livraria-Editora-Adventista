/**
 * Notificações para as apps instaladas (a de colportores, app/colportor), pelo Firebase Cloud
 * Messaging, API HTTP v1. Código puro: a rede e o relógio entram por argumento, para os testes.
 *
 * A chave é a da conta de serviço do projecto Firebase (o JSON que a consola dá), no segredo
 * FCM_SERVICE_ACCOUNT. Sem ele, não se envia nada. Com ela pede-se à Google um token de acesso
 * de uma hora (JWT assinado em RS256), que se guarda até perto do fim.
 */

export type ServiceAccount = { project_id: string; client_email: string; private_key: string };
export type AppPush = { title: string; body: string; url: string };

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** A conta de serviço a partir do segredo, ou null se faltar ou não for o JSON da consola. */
export function parseServiceAccount(raw: string | null | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const project_id = String(j.project_id || "");
    const client_email = String(j.client_email || "");
    const private_key = String(j.private_key || "").replace(/\\n/g, "\n");
    if (!/^[a-z0-9-]{4,40}$/.test(project_id) || !client_email.includes("@") || !private_key.includes("PRIVATE KEY")) return null;
    return { project_id, client_email, private_key };
  } catch {
    return null;
  }
}

/** Um token FCM tem este aspecto (o servidor só faz pedidos à Google, mas não guarda lixo). */
export function isFcmToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 4096 && /^[A-Za-z0-9_:\-.]+$/.test(value);
}

/**
 * A mensagem para um aparelho. Vai como notificação (o Android mostra-a com a app fechada) e com
 * o destino em `data.url`, o mesmo caminho do site (/colportor?tab=entregas): a app abre o ecrã
 * certo. Prioridade alta: uma oferta de entrega tem prazo.
 */
export function fcmMessage(token: string, push: AppPush) {
  return {
    message: {
      token,
      notification: { title: push.title.slice(0, 120), body: push.body.slice(0, 500) },
      data: { url: push.url.slice(0, 500) },
      android: { priority: "HIGH", notification: { channel_id: "avisos" } },
    },
  };
}

/** O endereço de envio do projecto. */
export const fcmSendUrl = (projectId: string) => `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

/**
 * O que fazer com uma resposta de erro: 'gone' quando o aparelho já não existe (app desinstalada,
 * token trocado), e o token apaga-se; 'failed' no resto (tenta-se no aviso seguinte).
 */
export function fcmFailure(status: number, body: unknown): "gone" | "failed" {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  if (status === 404 || /UNREGISTERED/.test(text)) return "gone";
  if (status === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text)) return "gone";
  return "failed";
}

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** O JWT com que se pede o token de acesso: assinado com a chave da conta, válido uma hora. */
export async function serviceAccountJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

let cached: { email: string; token: string; until: number } | null = null;

/** Para os testes. */
export const forgetAccessToken = () => { cached = null; };

/** O token de acesso da Google, guardado até cinco minutos antes de acabar. Null se a Google recusar. */
export async function accessToken(account: ServiceAccount, fetcher: Fetch, nowMs: number): Promise<string | null> {
  if (cached && cached.email === account.client_email && cached.until > nowMs) return cached.token;
  const jwt = await serviceAccountJwt(account, Math.floor(nowMs / 1000));
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data?.access_token) return null;
  cached = { email: account.client_email, token: data.access_token, until: nowMs + (Number(data.expires_in) || 3600) * 1000 - 300_000 };
  return cached.token;
}

/** Envia para um aparelho: 'sent', 'gone' (apagar o token) ou 'failed'. */
export async function sendToDevice(
  account: ServiceAccount, bearer: string, token: string, push: AppPush, fetcher: Fetch,
): Promise<"sent" | "gone" | "failed"> {
  try {
    const res = await fetcher(fcmSendUrl(account.project_id), {
      method: "POST",
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      body: JSON.stringify(fcmMessage(token, push)),
    });
    if (res.ok) return "sent";
    return fcmFailure(res.status, await res.text().catch(() => ""));
  } catch {
    return "failed";
  }
}
