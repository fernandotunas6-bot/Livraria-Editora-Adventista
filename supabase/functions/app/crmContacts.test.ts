// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import { MAX_CONTACT_NOTES, appendContactNote, publicContactFields } from "./crmContacts.ts";

const now = new Date("2026-11-10T12:00:00Z");

describe("publicContactFields", () => {
  const existente = {
    name: "Maria dos Santos", phone: "+244 923 456 789",
    notes: "Cliente desde 2024. Prefere levantamento.", metadata: { origem: "feira" },
  };

  it("um visitante com o email de um cliente não lhe troca o nome nem o telefone", () => {
    const out = publicContactFields(existente, { name: "Outro Nome", phone: "+244 911 111 111", notes: "Olá" }, now);
    expect(out.name).toBeUndefined();
    expect(out.phone).toBeUndefined();
  });

  it("as notas da equipa ficam; a mensagem acrescenta-se com a data", () => {
    const out = publicContactFields(existente, { notes: "Quero saber do livro X" }, now);
    expect(out.notes).toBe("Cliente desde 2024. Prefere levantamento.\n\n2026-11-10 · Quero saber do livro X");
  });

  it("preenche nome e telefone que faltam (ou o nome provisório)", () => {
    const out = publicContactFields({ name: "Sem Nome", phone: "" }, { name: "Ana", phone: "+244 922 000 000" }, now);
    expect(out).toMatchObject({ name: "Ana", phone: "+244 922 000 000" });
  });

  it("os metadados juntam-se em vez de se substituírem", () => {
    const out = publicContactFields(existente, { metadata: { last_order_number: "LA-1" } }, now);
    expect(out.metadata).toEqual({ origem: "feira", last_order_number: "LA-1" });
  });
});

describe("appendContactNote", () => {
  it("o mesmo pedido repetido não duplica a nota", () => {
    const uma = appendContactNote("", "Encomenda LA-1", now);
    expect(appendContactNote(uma, "Encomenda LA-1", now)).toBe(uma);
  });

  it("nunca passa do máximo: saem as notas mais antigas", () => {
    const longa = "x".repeat(MAX_CONTACT_NOTES);
    const out = appendContactNote(longa, "nova", now);
    expect(out.length).toBe(MAX_CONTACT_NOTES);
    expect(out.endsWith("2026-11-10 · nova")).toBe(true);
  });
});
