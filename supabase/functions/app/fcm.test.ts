import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { _esquecerAcesso, fcmConfig, fcmEndpoint, fcmJwt, fcmMessage, fcmTokenOf, isFcmToken, sendFcm, type FcmConfig } from "./fcm.ts";

const TOKEN = `dGVzdGU6${"A".repeat(140)}_-:x`;

/**
 * Uma conta de serviço a sério (RSA 2048, PKCS#8), gerada para os testes. As marcas do PEM montam-se
 * aos bocados para o verificador de segredos (scripts/verificar-segredos.mjs).
 */
const MARCA = (lado: "BEGIN" | "END") => `-----${lado} ${"PRIVATE"} KEY-----`;
let PEM = "";
let publica: CryptoKey;
beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  PEM = `${MARCA("BEGIN")}\n${btoa(bin).replace(/(.{64})/g, "$1\n")}\n${MARCA("END")}\n`;
  publica = par.publicKey;
});
afterEach(() => _esquecerAcesso());

const conta = () => JSON.stringify({ project_id: "livraria-app", client_email: "envio@livraria-app.iam.gserviceaccount.com", private_key: PEM });
const config = (): FcmConfig => fcmConfig((k) => (k === "FCM_SERVICE_ACCOUNT" ? conta() : undefined))!;
const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const resposta = (status: number, corpo?: unknown) => new Response(corpo ? JSON.stringify(corpo) : null, { status });

describe("tokens do Firebase", () => {
  it("aceita o token de registo, e só esse", () => {
    expect(isFcmToken(TOKEN)).toBe(true);
    for (const mau of ["", "curto", `${TOKEN} `.repeat(2), `${"A".repeat(120)}/x`, "A".repeat(401), null]) {
      expect(isFcmToken(mau)).toBe(false);
    }
  });

  it("guarda-se em push_subscriptions como fcm:<token>", () => {
    expect(fcmEndpoint(TOKEN)).toBe(`fcm:${TOKEN}`);
    expect(fcmTokenOf(`fcm:${TOKEN}`)).toBe(TOKEN);
    expect(fcmTokenOf(`apns:${"ab".repeat(32)}`)).toBeNull();
    expect(fcmTokenOf("https://fcm.googleapis.com/fcm/send/x")).toBeNull();
  });
});

describe("fcmConfig", () => {
  it("sem a conta de serviço, ou com o JSON errado, sem Firebase", () => {
    expect(fcmConfig(() => undefined)).toBeNull();
    expect(fcmConfig(() => "não é json")).toBeNull();
    expect(fcmConfig(() => JSON.stringify({ project_id: "x" }))).toBeNull();
  });

  it("lê o projecto, o email e a chave (com os \\n do JSON da consola)", () => {
    const c = fcmConfig(() => JSON.stringify({ project_id: "livraria-app", client_email: "a@b.iam.gserviceaccount.com", private_key: PEM.replace(/\n/g, "\\n") }))!;
    expect(c.projectId).toBe("livraria-app");
    expect(c.privateKey).toBe(PEM.trim());
  });
});

describe("fcmJwt", () => {
  it("RS256, para o OAuth da Google, com o escopo do FCM, assinado pela chave", async () => {
    const jwt = await fcmJwt(config(), 1_700_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({
      iss: "envio@livraria-app.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publica, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe("fcmMessage", () => {
  it("o aviso, a página a abrir e o canal do app", () => {
    expect(fcmMessage(TOKEN, { title: "Pagamento confirmado", body: "LA-1", url: "/profile?tab=orders", tag: "encomenda" })).toEqual({
      message: {
        token: TOKEN,
        notification: { title: "Pagamento confirmado", body: "LA-1" },
        data: { url: "/profile?tab=orders" },
        android: { priority: "high", ttl: "86400s", notification: { channel_id: "livraria", tag: "encomenda" } },
      },
    });
  });
});

describe("sendFcm", () => {
  /** O OAuth da Google e o FCM, por ordem: primeiro o token de acesso, depois o envio. */
  const rede = (envio: Response | (() => Response)) => vi.fn(async (url: string) => (
    String(url).startsWith("https://oauth2.googleapis.com/") ? resposta(200, { access_token: "acesso-1", expires_in: 3599 }) : (typeof envio === "function" ? envio() : envio)
  ));

  it("troca o JWT por um token de acesso e envia para o projecto", async () => {
    const fetchFn = rede(resposta(200, { name: "projects/livraria-app/messages/1" }));
    expect(await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: fetchFn as unknown as typeof fetch, nowSeconds: 1_700_000_000 })).toBe("sent");
    const [urlOAuth, initOAuth] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(urlOAuth).toBe("https://oauth2.googleapis.com/token");
    expect(String(initOAuth.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    const [urlEnvio, initEnvio] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(urlEnvio).toBe("https://fcm.googleapis.com/v1/projects/livraria-app/messages:send");
    expect((initEnvio.headers as Record<string, string>).authorization).toBe("Bearer acesso-1");
  });

  it("o token de acesso serve durante 50 minutos", async () => {
    const fetchFn = rede(() => resposta(200, {}));
    const f = fetchFn as unknown as typeof fetch;
    await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: f, nowSeconds: 1_700_000_000 });
    await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: f, nowSeconds: 1_700_000_000 + 49 * 60 });
    await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: f, nowSeconds: 1_700_000_000 + 51 * 60 });
    const oauth = fetchFn.mock.calls.filter(([u]) => String(u).startsWith("https://oauth2")).length;
    expect(oauth).toBe(2);
  });

  it("aparelho que já não existe: apagar o token", async () => {
    for (const r of [resposta(404, { error: { status: "NOT_FOUND" } }), resposta(400, { error: { status: "INVALID_ARGUMENT", details: [{ errorCode: "UNREGISTERED" }] } })]) {
      expect(await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: rede(r) as unknown as typeof fetch })).toBe("gone");
      _esquecerAcesso();
    }
  });

  it("uma mensagem recusada não apaga o token (podia ser erro nosso)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const r = resposta(400, { error: { status: "INVALID_ARGUMENT" } });
    expect(await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: rede(r) as unknown as typeof fetch })).toBe("failed");
  });

  it("sem rede ou sem OAuth, só conta", async () => {
    expect(await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: vi.fn(async () => { throw new Error("rede"); }) as unknown as typeof fetch })).toBe("failed");
    expect(await sendFcm(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: vi.fn(async () => resposta(401)) as unknown as typeof fetch })).toBe("failed");
  });
});
