// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import { compararVersoes, estadoDoPosto, estadoDosEmails, pior, redact } from "./saude.ts";

describe("a saúde do ecossistema (KANGEST ONE, E)", () => {
  it("o pior estado", () => {
    expect(pior()).toBe("ok");
    expect(pior("ok", "aviso", "ok")).toBe("aviso");
    expect(pior("aviso", "grave")).toBe("grave");
  });

  it("redact tira os segredos e os dados pessoais", () => {
    const t = redact("falhou com Bearer abc.def para ana@exemplo.ao (923 456 789) eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl sb_secret_XYZ123 e service_role_key");
    expect(t).not.toMatch(/ana@|923 456|eyJ|XYZ123|service_role/);
    expect(t).toContain("[email]");
    expect(t).toContain("Bearer [token]");
    expect(t).toContain("[chave]");
    expect(redact("Encomenda ENC-12 paga")).toBe("Encomenda ENC-12 paga");
  });

  it("o estado de um posto pelo último contacto e pelo que tem por enviar", () => {
    const agora = Date.parse("2026-11-26T12:00:00Z");
    expect(estadoDoPosto({ ultima_sinc: null }, agora).estado).toBe("aviso");
    expect(estadoDoPosto({ ultima_sinc: "2026-11-26T11:55:00Z" }, agora)).toEqual({ estado: "ok", motivo: "" });
    expect(estadoDoPosto({ ultima_sinc: "2026-11-26T11:00:00Z" }, agora).estado).toBe("aviso");
    expect(estadoDoPosto({ ultima_sinc: "2026-11-24T11:00:00Z" }, agora).estado).toBe("grave");
    expect(estadoDoPosto({ ultima_sinc: "2026-11-26T11:59:00Z", estado_computador: { por_enviar: 40 } }, agora).motivo).toBe("40 documentos por enviar");
  });

  it("a fila de emails", () => {
    expect(estadoDosEmails(0, 0, true).estado).toBe("ok");
    expect(estadoDosEmails(3, 0, false).estado).toBe("aviso");
    expect(estadoDosEmails(0, 2, null).motivo).toBe("2 email(s) falhado(s)");
    expect(estadoDosEmails(500, 0, true).estado).toBe("grave");
  });

  it("comparar versões do KanGest", () => {
    expect(compararVersoes("1.4.8 Livraria", "1.4.9")).toBeLessThan(0);
    expect(compararVersoes("1.5.0", "1.4.9")).toBeGreaterThan(0);
    expect(compararVersoes("1.4", "1.4.0")).toBe(0);
  });
});
