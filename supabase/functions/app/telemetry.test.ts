// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import { MAX_EVENTS, cleanPage, cleanTelemetry, withoutQueries } from "./telemetry.ts";

describe("cleanPage", () => {
  it("tira ids e parâmetros: agrupa por página e não diz quem visitou", () => {
    expect(cleanPage("/product/abc123?ref=CPT-1#topo")).toBe("/product/:id");
    expect(cleanPage("/comunidade/p/99")).toBe("/comunidade/:id/:id");
    expect(cleanPage("/shop")).toBe("/shop");
    expect(cleanPage("/")).toBe("/");
  });
  it("o que não é um caminho fica na página inicial", () => {
    expect(cleanPage("https://outro.site/x")).toBe("/");
    expect(cleanPage(undefined)).toBe("/");
    expect(cleanPage("/reset-password/token-secreto-123")).toBe("/reset-password/:id");
  });
});

describe("withoutQueries", () => {
  it("tira o pedido dos endereços, onde pode ir um token", () => {
    expect(withoutQueries("at https://loja.ao/assets/index.js?v=1#x:10:5")).toBe("at https://loja.ao/assets/index.js");
    expect(withoutQueries("falhou https://x.supabase.co/auth?token=abc e mais")).toBe("falhou https://x.supabase.co/auth e mais");
  });
});

describe("cleanTelemetry", () => {
  it("aceita as métricas conhecidas, com valores possíveis", () => {
    const out = cleanTelemetry({ events: [
      { kind: "vital", name: "lcp", value: 2512.3456, page: "/product/x", device: "mobile", connection: "4g", app_version: "2026.11.11-abc1234" },
      { kind: "vital", name: "CLS", value: 0.123456, page: "/", device: "desktop" },
    ] });
    expect(out).toEqual([
      { page: "/product/:id", device: "mobile", connection: "4g", app_version: "2026.11.11-abc1234", kind: "vital", name: "LCP", value: 2512.346, detail: {} },
      { page: "/", device: "desktop", connection: null, app_version: null, kind: "vital", name: "CLS", value: 0.123, detail: {} },
    ]);
  });

  it("deita fora métricas inventadas, valores impossíveis e tipos desconhecidos", () => {
    expect(cleanTelemetry({ events: [
      { kind: "vital", name: "XYZ", value: 1 },
      { kind: "vital", name: "LCP", value: -5 },
      { kind: "vital", name: "LCP", value: 1e9 },
      { kind: "vital", name: "INP", value: "abc" },
      { kind: "outro", name: "x" },
      null, "texto", [1, 2],
    ] })).toEqual([]);
    expect(cleanTelemetry({})).toEqual([]);
    expect(cleanTelemetry({ events: "x" })).toEqual([]);
  });

  it("os erros ficam cortados e sem tokens nos endereços", () => {
    const [e] = cleanTelemetry({ events: [{
      kind: "error", name: `TypeError: falhou em https://loja.ao/reset?token=segredo ${"x".repeat(400)}`, page: "/reset-password",
      detail: { source: "https://loja.ao/assets/index.js?v=2", line: 10, col: "5", stack: "at f (https://loja.ao/a.js?t=1:1:2)" },
    }] });
    expect(e.kind).toBe("error");
    expect(e.name.length).toBeLessThanOrEqual(300);
    expect(e.name).not.toContain("segredo");
    expect(e.detail).toEqual({ source: "https://loja.ao/assets/index.js", line: 10, col: 5, stack: "at f (https://loja.ao/a.js)" });
  });

  it(`no máximo ${MAX_EVENTS} por pedido`, () => {
    const events = Array.from({ length: 50 }, () => ({ kind: "vital", name: "FCP", value: 1000 }));
    expect(cleanTelemetry({ events })).toHaveLength(MAX_EVENTS);
  });
});
