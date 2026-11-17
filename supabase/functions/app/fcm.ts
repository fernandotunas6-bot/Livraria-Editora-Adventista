/**
 * Notificações para o app Android pelo Firebase Cloud Messaging (API HTTP v1, docs/APPS.md).
 *
 * O WebView do app não recebe Web Push. O app regista-se no Firebase e entrega o token a
 * `/push/native/subscribe`; fica em `push_subscriptions` como `fcm:<token>`, ao lado dos
 * navegadores e dos iPhones (`apns:`), e as mesmas funções de envio mandam para os três.
 *
 * Autenticação: a conta de serviço do projecto Firebase (o JSON que a consola dá), no segredo
 * FCM_SERVICE_ACCOUNT da Edge Function. Com ela assina-se um JWT RS256 e troca-se por um token de
 * acesso OAuth da Google, que vale uma hora (guardado 50 minutos).
 *
 * Sem nada de Deno nem de Supabase: testado no `npm test` (fcm.test.ts).
 */

import type { PushPayload } from "./apns.ts";

export const FCM_PREFIX = "fcm:";
const ESCOPO = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

/** Um token de registo do Firebase: letras, algarismos e `-_:`, com mais de 100 caracteres. */
export function isFcmToken(value: unknown): boolean {
  const s = String(value ?? "").trim();
  return s.length >= 100 && s.length <= 400 && /^[A-Za-z0-9_:-]+$/.test(s);
}

export const fcmEndpoint = (token: string) => `${FCM_PREFIX}${String(token).trim()}`;

/** O token do Firebase de um endereço guardado, ou null se for de outro aparelho. */
export function fcmTokenOf(endpoint: unknown): string | null {
  const s = String(endpoint ?? "");
  if (!s.startsWith(FCM_PREFIX)) return null;
  const token = s.slice(FCM_PREFIX.length);
  return isFcmToken(token) ? token : null;
}

/** A conta de serviço do segredo, ou null sem Firebase ligado (ou com o JSON errado). */
export function fcmConfig(env: (name: string) => string | undefined): FcmConfig | null {
  const raw = String(env("FCM_SERVICE_ACCOUNT") || "").trim();
  if (!raw) return null;
  try {
    const conta = JSON.parse(raw);
    const projectId = String(conta.project_id || "").trim();
    const clientEmail = String(conta.client_email || "").trim();
    const privateKey = String(conta.private_key || "").replace(/\\n/g, "\n").trim();
    if (!/^[a-z0-9-]{4,40}$/.test(projectId) || !clientEmail.includes("@") || !privateKey.includes("PRIVATE KEY")) return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

/** A mensagem do FCM: o aviso, a página a abrir ao tocar e o canal dos avisos do app. */
export function fcmMessage(token: string, payload: PushPayload) {
  return {
    message: {
      token,
      notification: {
        title: String(payload.title || "Livraria Adventista").slice(0, 120),
        body: String(payload.body || "").slice(0, 400),
      },
      data: { url: String(payload.url || "/") },
      android: {
        priority: "high",
        ttl: "86400s",
        notification: {
          channel_id: "livraria",
          ...(payload.tag ? { tag: String(payload.tag).slice(0, 64) } : {}),
        },
      },
    },
  };
}

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/** O JWT da conta de serviço (RS256), para trocar por um token de acesso. */
export async function fcmJwt(cfg: FcmConfig, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const claims = b64urlJson({ iss: cfg.clientEmail, scope: ESCOPO, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 });
  const base64 = cfg.privateKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

let acessoGuardado: { conta: string; ate: number; token: string } | null = null;
/** A troca em curso: os envios de um lote esperam todos pela mesma, em vez de pedirem um token cada um. */
let acessoAPedir: { conta: string; promessa: Promise<string> } | null = null;

/** Só para os testes. */
export const _esquecerAcesso = () => { acessoGuardado = null; acessoAPedir = null; };

async function pedirAcesso(cfg: FcmConfig, fetchFn: typeof fetch, nowSeconds: number) {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await fcmJwt(cfg, nowSeconds) }),
  });
  if (!res.ok) throw new Error(`FCM OAuth ${res.status}`);
  const token = String((await res.json())?.access_token || "");
  if (!token) throw new Error("FCM OAuth sem token");
  acessoGuardado = { conta: cfg.clientEmail, ate: nowSeconds + 50 * 60, token };
  return token;
}

/** O token de acesso OAuth (uma hora; renova-se aos 50 minutos ou se o FCM o recusar). */
function tokenDeAcesso(cfg: FcmConfig, fetchFn: typeof fetch, nowSeconds: number): Promise<string> {
  if (acessoGuardado && acessoGuardado.conta === cfg.clientEmail && nowSeconds < acessoGuardado.ate) return Promise.resolve(acessoGuardado.token);
  if (acessoAPedir && acessoAPedir.conta === cfg.clientEmail) return acessoAPedir.promessa;
  const pedido = { conta: cfg.clientEmail, promessa: pedirAcesso(cfg, fetchFn, nowSeconds) };
  acessoAPedir = pedido;
  const acabou = () => { if (acessoAPedir === pedido) acessoAPedir = null; };
  pedido.promessa.then(acabou, acabou);
  return pedido.promessa;
}

/** Um aviso para um aparelho Android: 'sent', 'gone' (o token já não serve: apagar) ou 'failed'. */
export async function sendFcm(
  cfg: FcmConfig,
  token: string,
  payload: PushPayload,
  { fetchFn = fetch, nowSeconds = Math.floor(Date.now() / 1000) }: { fetchFn?: typeof fetch; nowSeconds?: number } = {},
): Promise<"sent" | "gone" | "failed"> {
  if (!isFcmToken(token)) return "gone";
  let res: Response;
  try {
    const acesso = await tokenDeAcesso(cfg, fetchFn, nowSeconds);
    res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${acesso}`, "content-type": "application/json" },
      body: JSON.stringify(fcmMessage(token, payload)),
    });
  } catch {
    return "failed";
  }
  if (res.ok) return "sent";
  let estado = "";
  try {
    const corpo = await res.json();
    estado = String(corpo?.error?.status || "");
    const detalhe = (corpo?.error?.details || []).map((d: { errorCode?: string }) => d?.errorCode).find(Boolean);
    if (detalhe) estado = String(detalhe);
  } catch {
    // sem corpo
  }
  // O aparelho já não existe (app desinstalado, token velho) ou o token não é deste projecto.
  // INVALID_ARGUMENT não apaga: tanto vem de um token mau como de uma mensagem mal feita, e um erro
  // nosso apagava os telemóveis todos.
  if (res.status === 404 || estado === "UNREGISTERED" || estado === "SENDER_ID_MISMATCH") return "gone";
  if (res.status === 401) acessoGuardado = null;
  console.log("fcm:", res.status, estado);
  return "failed";
}
