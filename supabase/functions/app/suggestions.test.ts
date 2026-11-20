// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import { rankSuggestions } from "./suggestions.ts";

const book = (id: string, genre: string, created: string, extra: Record<string, unknown> = {}) => ({ id, title: `Livro ${id}`, genre, created, ...extra });

const BOOKS = [
  book("a", "Saúde", "2026-10-01"),
  book("b", "Saúde", "2026-10-05"),
  book("c", "Família", "2026-10-03"),
  book("d", "Profecia", "2026-11-01"),
  book("e", "Profecia", "2026-10-20"),
  book("f", "Família", "2026-09-01"),
  book("g", "Saúde", "2026-08-01"),
];

describe("rankSuggestions", () => {
  it("sem histórico, mostra as novidades e não diz que é pessoal", () => {
    const r = rankSuggestions({ books: BOOKS, limit: 4 });
    expect(r.personal).toBe(false);
    expect(r.pick.map((b) => b.id)).toEqual(["d", "e", "b", "c"]);
  });

  it("põe primeiro os desejos e os vistos, e nunca o que já comprou", () => {
    const r = rankSuggestions({ books: BOOKS, owned: ["a"], wishlist: ["c"], viewed: ["e", "a"], limit: 4 });
    expect(r.personal).toBe(true);
    const ids = r.pick.map((b) => b.id);
    expect(ids).not.toContain("a");
    expect(ids.slice(0, 2).sort()).toEqual(["c", "e"]);
    expect(ids).toHaveLength(4);
  });

  it("completa com livros do mesmo género do que comprou", () => {
    const r = rankSuggestions({ books: BOOKS, owned: ["a"], limit: 4 });
    // Comprou um de Saúde: os outros de Saúde vêm antes das novidades de outros géneros.
    expect(r.pick.slice(0, 2).map((b) => b.id)).toEqual(["b", "g"]);
  });

  it("deixa de fora os excluídos e os que não estão no catálogo", () => {
    const r = rankSuggestions({ books: BOOKS, wishlist: ["zz", "d"], exclude: ["d"], limit: 3 });
    expect(r.pick.map((b) => b.id)).not.toContain("d");
    expect(r.pick.map((b) => b.id)).not.toContain("zz");
  });

  it("os vistos recentemente mantêm a ordem e não repetem compras", () => {
    const r = rankSuggestions({ books: BOOKS, owned: ["b"], viewed: ["e", "b", "c"] });
    expect(r.recent.map((b) => b.id)).toEqual(["e", "c"]);
  });

  it("a colecção pesa mais do que o autor, e o autor mais do que o género", () => {
    const livros = [
      book("lido", "Saúde", "2026-01-01", { collection_id: "serie", author: "Ellen" }),
      book("mesma-colecao", "Outro", "2026-01-02", { collection_id: "serie", author: "Outro" }),
      book("mesmo-autor", "Outro", "2026-01-03", { author: "Ellen" }),
      book("mesmo-genero", "Saúde", "2026-01-04", {}),
    ];
    const r = rankSuggestions({ books: livros, viewed: ["lido"], limit: 4 });
    expect(r.pick.map((b) => b.id)).toEqual(["lido", "mesma-colecao", "mesmo-autor", "mesmo-genero"]);
  });

  it("um livro da colecção que está a ler ganha a uma novidade de outro género", () => {
    const livros = [
      book("comprado", "Saúde", "2026-01-01", { collection_id: "serie" }),
      book("volume-2", "Saúde", "2026-02-01", { collection_id: "serie" }),
      book("novidade", "Profecia", "2026-11-01", {}),
    ];
    const r = rankSuggestions({ books: livros, owned: ["comprado"], limit: 2 });
    expect(r.pick[0].id).toBe("volume-2");
  });

  it("prefere livros com capa a sério e deixa os de capa vazia para o fim", () => {
    const books = [
      book("x", "Saúde", "2026-11-04", { cover: "x.jpg", cover_bytes: 3000 }),
      book("y", "Saúde", "2026-10-01", { cover: "y.jpg", cover_bytes: 40000 }),
      book("z", "Saúde", "2026-09-01", { cover: "z.jpg", cover_bytes: 50000 }),
    ];
    expect(rankSuggestions({ books, limit: 2 }).pick.map((b) => b.id)).toEqual(["y", "z"]);
    expect(rankSuggestions({ books, viewed: ["x"], limit: 3 }).pick.map((b) => b.id)).toEqual(["y", "z", "x"]);
  });
});
