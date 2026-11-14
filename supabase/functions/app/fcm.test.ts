import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  accessToken, fcmFailure, fcmMessage, fcmSendUrl, forgetAccessToken, isFcmToken, parseServiceAccount, sendToDevice, serviceAccountJwt,
} from "./fcm.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const conta = { project_id: "livraria-teste", client_email: "fcm@livraria-teste.iam.gserviceaccount.com", private_key: privateKey };
const TOKEN = "dQw4w9WgXcQ:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx_exemplo";

beforeEach(() => forgetAccessToken());

describe("parseServiceAccount", () => {
  it("lê o JSON da consola, com as quebras de linha da chave escapadas", () => {
    const raw = JSON.stringify({ ...conta, private_key: privateKey.replace(/\n/g, "\\n") });
    expect(parseServiceAccount(raw)).toEqual(conta);
  });
  it("sem segredo, com lixo ou sem a chave: null", () => {
    expect(parseServiceAccount(null)).toBeNull();
    expect(parseServiceAccount("não é json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "x" }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ ...conta, private_key: "abc" }))).toBeNull();
  });
});

describe("isFcmToken", () => {
  it("aceita um token e recusa o que não tem o aspecto de um", () => {
    expect(isFcmToken(TOKEN)).toBe(true);
    expect(isFcmToken("curto")).toBe(false);
    expect(isFcmToken("https://evil.example/aaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isFcmToken(`${TOKEN} com espaço`)).toBe(false);
    expect(isFcmToken(123)).toBe(false);
  });
});

describe("fcmMessage", () => {
  it("notificação de prioridade alta, com o destino nos dados", () => {
    const m = fcmMessage(TOKEN, { title: "Entrega para si", body: "Viana · 2 km", url: "/colportor?tab=entregas" });
    expect(m.message).toMatchObject({
      token: TOKEN,
      notification: { title: "Entrega para si", body: "Viana · 2 km" },
      data: { url: "/colportor?tab=entregas" },
      android: { priority: "HIGH", notification: { channel_id: "avisos" } },
    });
    expect(fcmSendUrl("livraria-teste")).toBe("https://fcm.googleapis.com/v1/projects/livraria-teste/messages:send");
  });
});

describe("fcmFailure", () => {
  it("aparelho que já não existe: apaga-se o token", () => {
    expect(fcmFailure(404, '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}')).toBe("gone");
    expect(fcmFailure(400, '{"error":{"status":"INVALID_ARGUMENT","message":"The registration token is not a valid FCM registration token"}}')).toBe("gone");
  });
  it("o resto tenta-se outra vez", () => {
    expect(fcmFailure(500, "")).toBe("failed");
    expect(fcmFailure(429, '{"error":{"status":"QUOTA_EXCEEDED"}}')).toBe("failed");
    expect(fcmFailure(400, '{"error":{"status":"INVALID_ARGUMENT","message":"Invalid JSON payload"}}')).toBe("failed");
  });
});

describe("serviceAccountJwt", () => {
  it("assina em RS256 com a chave da conta, por uma hora", async () => {
    const jwt = await serviceAccountJwt(conta, 1_800_000_000);
    const [h, c, s] = jwt.split(".");
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(claims).toMatchObject({ iss: conta.client_email, aud: "https://oauth2.googleapis.com/token", iat: 1_800_000_000, exp: 1_800_003_600 });
    expect(claims.scope).toContain("firebase.messaging");
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("accessToken e sendToDevice", () => {
  const resposta = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body),
  });

  it("pede o token uma vez e guarda-o até perto do fim", async () => {
    let pedidos = 0;
    const fetcher = async (url: string) => { pedidos++; expect(url).toBe("https://oauth2.googleapis.com/token"); return resposta(200, { access_token: "ya29.abc", expires_in: 3600 }); };
    expect(await accessToken(conta, fetcher, 1_000_000)).toBe("ya29.abc");
    expect(await accessToken(conta, fetcher, 1_000_000 + 50 * 60_000)).toBe("ya29.abc");
    expect(pedidos).toBe(1);
    await accessToken(conta, fetcher, 1_000_000 + 56 * 60_000);
    expect(pedidos).toBe(2);
  });

  it("se a Google recusar a chave, null", async () => {
    expect(await accessToken(conta, async () => resposta(401, { error: "invalid_grant" }), 1_000_000)).toBeNull();
  });

  it("envia com o token de acesso e diz o que aconteceu", async () => {
    const push = { title: "T", body: "B", url: "/colportor" };
    let visto: { url: string; auth: string } | null = null;
    const ok = await sendToDevice(conta, "ya29.abc", TOKEN, push, async (url, init) => { visto = { url, auth: init.headers.authorization }; return resposta(200, { name: "x" }); });
    expect(ok).toBe("sent");
    expect(visto).toEqual({ url: fcmSendUrl("livraria-teste"), auth: "Bearer ya29.abc" });
    expect(await sendToDevice(conta, "t", TOKEN, push, async () => resposta(404, { error: { details: [{ errorCode: "UNREGISTERED" }] } }))).toBe("gone");
    expect(await sendToDevice(conta, "t", TOKEN, push, async () => { throw new Error("rede"); })).toBe("failed");
  });
});
