// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SITEVERIFY_URL, turnstileEnabled, verifyTurnstile } from "./turnstile.ts";

const resposta = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("turnstileEnabled", () => {
  it("só com as duas chaves", () => {
    expect(turnstileEnabled("0xSITE", "0xSEGREDO")).toBe(true);
    expect(turnstileEnabled("", "0xSEGREDO")).toBe(false);
    expect(turnstileEnabled("0xSITE", "")).toBe(false);
    expect(turnstileEnabled(undefined, null)).toBe(false);
  });
});

describe("verifyTurnstile", () => {
  it("sem segredo, não pede nada", async () => {
    const fetchFn = vi.fn();
    expect(await verifyTurnstile("", { secret: "", fetchFn })).toEqual({ ok: true, skipped: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sem token, recusa sem ir ao Cloudflare", async () => {
    const fetchFn = vi.fn();
    expect(await verifyTurnstile(undefined, { secret: "s", fetchFn })).toEqual({ ok: false, reason: "missing-input-response" });
    expect(await verifyTurnstile("x".repeat(3000), { secret: "s", fetchFn })).toMatchObject({ ok: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("token válido passa, e vai o IP de quem pede", async () => {
    const fetchFn = resposta({ success: true });
    expect(await verifyTurnstile("tok", { secret: "s", ip: "1.2.3.4", fetchFn })).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    const corpo = new URLSearchParams(String(init.body));
    expect(corpo.get("secret")).toBe("s");
    expect(corpo.get("response")).toBe("tok");
    expect(corpo.get("remoteip")).toBe("1.2.3.4");
  });

  it("token recusado ou repetido recusa", async () => {
    expect(await verifyTurnstile("tok", { secret: "s", fetchFn: resposta({ success: false, "error-codes": ["timeout-or-duplicate"] }) }))
      .toEqual({ ok: false, reason: "timeout-or-duplicate" });
  });

  it("chave secreta errada é erro nosso: passa e regista", async () => {
    const log = vi.fn();
    expect(await verifyTurnstile("tok", { secret: "s", log, fetchFn: resposta({ success: false, "error-codes": ["invalid-input-secret"] }) }))
      .toEqual({ ok: true, degraded: true });
    expect(log).toHaveBeenCalled();
  });

  it("Cloudflare em baixo: a loja continua a vender", async () => {
    const log = vi.fn();
    expect(await verifyTurnstile("tok", { secret: "s", log, fetchFn: resposta({}, 503) })).toEqual({ ok: true, degraded: true });
    expect(await verifyTurnstile("tok", { secret: "s", log, fetchFn: vi.fn(async () => { throw new Error("rede"); }) })).toEqual({ ok: true, degraded: true });
  });
});
