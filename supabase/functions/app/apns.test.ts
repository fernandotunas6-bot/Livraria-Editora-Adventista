import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  _esquecerJwt, apnsConfig, apnsEndpoint, apnsJwt, apnsPayload, apnsTokenOf, isApnsToken, sendApns, type ApnsConfig,
} from "./apns.ts";

const TOKEN = "a1".repeat(32);

/**
 * Uma chave .p8 a sério (P-256, PKCS#8), gerada para os testes. As marcas do PEM montam-se aos
 * bocados para o verificador de segredos (scripts/verificar-segredos.mjs) não as tomar por uma
 * chave guardada no repositório.
 */
const MARCA = (lado: "BEGIN" | "END") => `-----${lado} ${"PRIVATE"} KEY-----`;
let PEM = "";
let publica: CryptoKey;
beforeAll(async () => {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", par.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  PEM = `${MARCA("BEGIN")}\n${b64}\n${MARCA("END")}`;
  publica = par.publicKey;
});
afterEach(() => _esquecerJwt());

const env = (vars: Record<string, string>) => (k: string) => vars[k];
const config = (): ApnsConfig => apnsConfig(env({ APNS_KEY_ID: "KEY1234567", APNS_TEAM_ID: "TEAM123456", APNS_PRIVATE_KEY: PEM }))!;

const b64urlDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

describe("tokens do APNs", () => {
  it("aceita o token hexadecimal do aparelho, e só esse", () => {
    expect(isApnsToken(TOKEN)).toBe(true);
    expect(isApnsToken(TOKEN.toUpperCase())).toBe(true);
    expect(isApnsToken("ab".repeat(80))).toBe(true);
    for (const mau of ["", "abc", "zz".repeat(32), `${TOKEN}a`, "ab".repeat(101), null, `https://x/${TOKEN}`]) {
      expect(isApnsToken(mau)).toBe(false);
    }
  });

  it("guarda-se em push_subscriptions como apns:<token>", () => {
    expect(apnsEndpoint(TOKEN.toUpperCase())).toBe(`apns:${TOKEN}`);
    expect(apnsTokenOf(`apns:${TOKEN}`)).toBe(TOKEN);
    expect(apnsTokenOf("https://fcm.googleapis.com/fcm/send/x")).toBeNull();
    expect(apnsTokenOf("apns:nao-e-token")).toBeNull();
  });
});

describe("apnsConfig", () => {
  it("sem os três segredos, sem APNs", () => {
    expect(apnsConfig(env({}))).toBeNull();
    expect(apnsConfig(env({ APNS_KEY_ID: "KEY1234567", APNS_TEAM_ID: "TEAM123456" }))).toBeNull();
    expect(apnsConfig(env({ APNS_KEY_ID: "curto", APNS_TEAM_ID: "TEAM123456", APNS_PRIVATE_KEY: MARCA("BEGIN") }))).toBeNull();
  });

  it("produção e o bundle do app por omissão; sandbox a pedido", () => {
    const c = config();
    expect(c.host).toBe("api.push.apple.com");
    expect(c.topic).toBe("ao.livrariaadventista.app");
    const s = apnsConfig(env({ APNS_KEY_ID: "KEY1234567", APNS_TEAM_ID: "TEAM123456", APNS_PRIVATE_KEY: PEM, APNS_ENV: "sandbox", APNS_TOPIC: "x.y" }))!;
    expect(s.host).toBe("api.sandbox.push.apple.com");
    expect(s.topic).toBe("x.y");
  });

  it("aceita o .p8 com \\n escritos (como fica colado num segredo)", () => {
    const c = apnsConfig(env({ APNS_KEY_ID: "KEY1234567", APNS_TEAM_ID: "TEAM123456", APNS_PRIVATE_KEY: PEM.replace(/\n/g, "\\n") }))!;
    expect(c.privateKey).toBe(PEM);
  });
});

describe("apnsJwt", () => {
  it("ES256 com o kid e o emissor da conta, assinado pela chave", async () => {
    const jwt = await apnsJwt(config(), 1_700_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({ iss: "TEAM123456", iat: 1_700_000_000 });
    const assinatura = b64urlDecode(s);
    expect(assinatura.length).toBe(64);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publica, assinatura, new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});

describe("apnsPayload", () => {
  it("o alerta, o som e a página a abrir", () => {
    expect(apnsPayload({ title: "Pagamento confirmado", body: "LA-1", url: "/profile?tab=orders", tag: "encomenda" })).toEqual({
      aps: { alert: { title: "Pagamento confirmado", body: "LA-1" }, sound: "default", "thread-id": "encomenda" },
      url: "/profile?tab=orders",
    });
  });
});

describe("apnsPayload — número no ícone", () => {
  it("só com um número inteiro, até 999", () => {
    expect(apnsPayload({ title: "t", body: "b", url: "/", badge: 3 }).aps.badge).toBe(3);
    expect(apnsPayload({ title: "t", body: "b", url: "/", badge: 0 }).aps.badge).toBe(0);
    expect(apnsPayload({ title: "t", body: "b", url: "/", badge: 5000 }).aps.badge).toBe(999);
    expect("badge" in apnsPayload({ title: "t", body: "b", url: "/" }).aps).toBe(false);
    expect("badge" in apnsPayload({ title: "t", body: "b", url: "/", badge: -1 }).aps).toBe(false);
  });
});

describe("sendApns", () => {
  const resposta = (status: number, corpo?: unknown) => new Response(corpo ? JSON.stringify(corpo) : null, { status });

  it("envia para o aparelho com o tópico e o JWT", async () => {
    const fetchFn = vi.fn(async () => resposta(200));
    expect(await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn, nowSeconds: 1_700_000_000 })).toBe("sent");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.push.apple.com/3/device/${TOKEN}`);
    const h = init.headers as Record<string, string>;
    expect(h["apns-topic"]).toBe("ao.livrariaadventista.app");
    expect(h["apns-push-type"]).toBe("alert");
    expect(h.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(String(init.body)).aps.alert.title).toBe("t");
  });

  it("o mesmo JWT serve durante 50 minutos", async () => {
    const fetchFn = vi.fn(async () => resposta(200));
    const auth = (i: number) => ((fetchFn.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Record<string, string>).authorization;
    await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn, nowSeconds: 1_700_000_000 });
    await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn, nowSeconds: 1_700_000_000 + 49 * 60 });
    await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn, nowSeconds: 1_700_000_000 + 51 * 60 });
    expect(auth(1)).toBe(auth(0));
    expect(auth(2)).not.toBe(auth(0));
  });

  it("aparelho que já não existe: apagar o token", async () => {
    for (const [status, reason] of [[410, "Unregistered"], [400, "BadDeviceToken"], [400, "DeviceTokenNotForTopic"]] as const) {
      const fetchFn = vi.fn(async () => resposta(status, { reason }));
      expect(await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn })).toBe("gone");
    }
  });

  it("outras falhas só contam (o token fica)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: vi.fn(async () => resposta(429, { reason: "TooManyRequests" })) })).toBe("failed");
    expect(await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn: vi.fn(async () => { throw new Error("rede"); }) })).toBe("failed");
  });

  it("JWT recusado: o próximo envio assina outro", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchFn = vi.fn(async () => resposta(403, { reason: "ExpiredProviderToken" }));
    await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn, nowSeconds: 1_700_000_000 });
    fetchFn.mockImplementation(async () => resposta(200));
    await sendApns(config(), TOKEN, { title: "t", body: "b", url: "/" }, { fetchFn, nowSeconds: 1_700_000_001 });
    const auth = (i: number) => ((fetchFn.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Record<string, string>).authorization;
    expect(auth(1)).not.toBe(auth(0));
  });
});
