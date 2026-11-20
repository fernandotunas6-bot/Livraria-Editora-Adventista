// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import {
  RELEASE_PUSH_BATCH, mapLimit, nextReleaseBatch, pushFailure, releasePushAlive, releasePushPayload,
} from "./releasePush.ts";

describe("releasePushPayload", () => {
  it("o título da novidade no aviso, que abre /novidades", () => {
    expect(releasePushPayload({ id: "r1", title: "  Entrar mais   rápido " })).toEqual({
      title: "Nova versão da app",
      body: "Entrar mais rápido",
      url: "/novidades",
      tag: "livraria:novidades",
    });
  });

  it("sem título, um texto que serve", () => {
    expect(releasePushPayload({ id: "r1", title: "" }).body).toBe("Veja o que mudou.");
  });
});

describe("nextReleaseBatch", () => {
  it("o cursor passa para o último aparelho do lote", () => {
    const ids = Array.from({ length: RELEASE_PUSH_BATCH }, (_, i) => `id${String(i).padStart(4, "0")}`);
    expect(nextReleaseBatch(ids, null)).toEqual({ cursor: "id0149", done: false });
  });

  it("um lote incompleto é o último", () => {
    expect(nextReleaseBatch(["a", "b"], "0", 150)).toEqual({ cursor: "b", done: true });
  });

  it("sem aparelhos, acaba e o cursor fica onde estava", () => {
    expect(nextReleaseBatch([], "x", 150)).toEqual({ cursor: "x", done: true });
    expect(nextReleaseBatch([], null, 150)).toEqual({ cursor: null, done: true });
  });
});

describe("releasePushAlive", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  it("retoma até 2 dias depois do pedido", () => {
    expect(releasePushAlive("2026-11-07T12:00:00Z", now)).toBe(true);
    expect(releasePushAlive("2026-11-05T12:00:00Z", now)).toBe(false);
    expect(releasePushAlive(null, now)).toBe(false);
  });
});

describe("pushFailure", () => {
  it("404 e 410 são aparelhos que já não existem; o resto só conta como falha", () => {
    expect(pushFailure({ statusCode: 410 })).toBe("gone");
    expect(pushFailure({ statusCode: 404 })).toBe("gone");
    expect(pushFailure({ statusCode: 429 })).toBe("failed");
    expect(pushFailure(new Error("rede"))).toBe("failed");
  });
});

describe("mapLimit", () => {
  it("nunca passa do limite em paralelo e devolve pela ordem", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
    expect(peak).toBe(3);
  });

  it("lista vazia não chama nada", async () => {
    expect(await mapLimit([], 10, async () => 1)).toEqual([]);
  });
});
