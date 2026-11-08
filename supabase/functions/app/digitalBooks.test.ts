import { describe, expect, it } from "vitest";
import { digitalBooksFor, titleList } from "./digitalBooks.ts";

const MATERIALS = [
  { id: "m1", title: "O Desejado (PDF)", book_id: "livro", variant: 1 },
  { id: "m2", title: "Revista (PDF)", book_id: "revista", variant: null },
];

describe("digitalBooksFor", () => {
  it("a edição digital dá o PDF ligado a essa variante", () => {
    expect(digitalBooksFor([{ book_id: "livro", variant: 1, quantity: 1 }], MATERIALS)).toEqual({ titles: ["O Desejado (PDF)"], onlyDigital: true });
  });

  it("a edição impressa não dá o PDF da digital", () => {
    expect(digitalBooksFor([{ book_id: "livro", variant: 0 }], MATERIALS)).toEqual({ titles: [], onlyDigital: false });
    expect(digitalBooksFor([{ book_id: "livro" }], MATERIALS).titles).toEqual([]);
  });

  it("um PDF ligado ao produto (sem variante) vem com qualquer compra do produto, mas não a torna digital", () => {
    expect(digitalBooksFor([{ book_id: "revista", quantity: 2 }], MATERIALS)).toEqual({ titles: ["Revista (PDF)"], onlyDigital: false });
  });

  it("encomenda mista: os dois PDFs, e há artigos para enviar", () => {
    const r = digitalBooksFor([{ book_id: "livro", variant: 1 }, { book_id: "revista" }, { book_id: "outro" }], MATERIALS);
    expect(r.titles).toEqual(["O Desejado (PDF)", "Revista (PDF)"]);
    expect(r.onlyDigital).toBe(false);
  });

  it("variante em texto (\"1\") conta como a mesma; artigos ou materiais estranhos não rebentam", () => {
    expect(digitalBooksFor([{ book_id: "livro", variant: "1" }], MATERIALS).titles).toEqual(["O Desejado (PDF)"]);
    expect(digitalBooksFor(null, MATERIALS)).toEqual({ titles: [], onlyDigital: false });
    expect(digitalBooksFor([null, 3, { book_id: "livro", variant: 1 }], [null as never, ...MATERIALS]).titles).toEqual(["O Desejado (PDF)"]);
  });

  it("titleList junta os títulos em português", () => {
    expect(titleList([])).toBe("");
    expect(titleList(["A"])).toBe("A");
    expect(titleList(["A", "B"])).toBe("A e B");
    expect(titleList(["A", "B", "C"])).toBe("A, B e C");
  });
});
