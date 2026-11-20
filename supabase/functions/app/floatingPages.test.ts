// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import { FLOATING_PAGE_KEYS, floatingPagesFrom } from "./floatingPages.ts";
import { FLOATING_PAGE_KEYS as SITE_KEYS } from "../../../app/web/src/lib/floatingButtons.js";

describe("floatingPagesFrom", () => {
  it("só devolve chaves conhecidas", () => {
    expect(floatingPagesFrom(["produto", "xpto", "produto", "entrar"])).toEqual(["produto", "entrar"]);
    expect(floatingPagesFrom([])).toEqual([]);
  });
  it("sem lista gravada devolve null (o site usa as de omissão)", () => {
    expect(floatingPagesFrom(undefined)).toBeNull();
    expect(floatingPagesFrom("produto")).toBeNull();
  });
  it("as chaves são as mesmas do site", () => {
    expect([...FLOATING_PAGE_KEYS]).toEqual(SITE_KEYS);
  });
});
