// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import {
  codigoDeEntrada, codigoValido, desafioPkce, desafioValido, destinoNoSite, enderecoDeAbertura, estadoValido, iguais,
  verificadorValido,
} from "./kangestEntrada.ts";

describe("a entrada nos dois sentidos entre o KanGest e o site", () => {
  it("só abre as páginas permitidas do próprio site", () => {
    expect(destinoNoSite("")).toBe("/admin");
    expect(destinoNoSite(undefined)).toBe("/admin");
    expect(destinoNoSite("/admin?tab=orders&encomenda=LA-2026-0012")).toBe("/admin?tab=orders&encomenda=LA-2026-0012");
    expect(destinoNoSite("/admin?tab=books&produto=O%20Grande%20Conflito")).toBe("/admin?tab=books&produto=O%20Grande%20Conflito");
    expect(destinoNoSite("/product/abc-123")).toBe("/product/abc-123");
    expect(destinoNoSite("/")).toBe("/");
    expect(destinoNoSite("/profile")).toBe("/profile");
    // nunca outro endereço
    for (const mau of [
      "https://mau.example/admin", "//mau.example", "/\\mau.example", "/admin@mau.example", "/admin/../x",
      "/admin?x=javascript:alert(1)", "javascript:alert(1)", "/admin#x", "/qualquer", "/admin?a=<b>", "/product/a/b",
      `/admin?${"a".repeat(600)}`,
    ]) {
      expect(destinoNoSite(mau), mau).toBeNull();
    }
  });

  it("o desafio do PKCE é o da norma (RFC 7636, apêndice B), o mesmo que o KanGest calcula", async () => {
    expect(await desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(desafioValido("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(verificadorValido("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(true);
    expect(verificadorValido("curto")).toBe(false);
    expect(desafioValido("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-c=")).toBe(false);
  });

  it("o código de uso único é novo de cada vez e tem a forma certa", () => {
    const a = codigoDeEntrada();
    expect(codigoValido(a)).toBe(true);
    expect(a).not.toBe(codigoDeEntrada());
    expect(codigoValido("a b")).toBe(false);
    expect(estadoValido("aBcDeFgHiJkLmNoPqRsTuVwX")).toBe(true);
    expect(estadoValido("curto")).toBe(false);
    expect(estadoValido("aaaaaaaaaaaaaaaaaaaaaaaa&x=1")).toBe(false);
  });

  it("compara sem atalhos", () => {
    expect(iguais("abc", "abc")).toBe(true);
    expect(iguais("abc", "abd")).toBe(false);
    expect(iguais("abc", "ab")).toBe(false);
  });

  it("o resumo do link vai no fragmento, que não chega a nenhum servidor", () => {
    const u = enderecoDeAbertura("https://livrariaadventista.ao/", "pkce_abc123", "/admin?tab=orders");
    expect(u).toBe("https://livrariaadventista.ao/kangest/abrir#t=pkce_abc123&d=%2Fadmin%3Ftab%3Dorders");
    expect(new URL(u).search).toBe("");
  });
});
