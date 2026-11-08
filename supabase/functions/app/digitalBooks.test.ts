import { describe, expect, it } from "vitest";
import { digitalBooksFor, digitalCart, isDigitalEdition, titleList, versionIsDigital } from "./digitalBooks.ts";

const MATERIALS = [
  { id: "m1", title: "O Desejado (PDF)", book_id: "livro", variant: 1 },
  { id: "m2", title: "Revista (PDF)", book_id: "revista", variant: null },
];

describe("digitalBooksFor", () => {
  it("a edição digital dá o PDF ligado a essa variante", () => {
    expect(digitalBooksFor([{ book_id: "livro", variant: 1, quantity: 1, digital: true }], MATERIALS)).toEqual({ titles: ["O Desejado (PDF)"], onlyDigital: true });
  });

  it("só é digital o que o place_order marcou: um PDF de oferta ligado a uma variante impressa não a torna digital", () => {
    expect(digitalBooksFor([{ book_id: "livro", variant: 1, quantity: 1 }], MATERIALS)).toEqual({ titles: ["O Desejado (PDF)"], onlyDigital: false });
  });

  it("a edição impressa não dá o PDF da digital", () => {
    expect(digitalBooksFor([{ book_id: "livro", variant: 0 }], MATERIALS)).toEqual({ titles: [], onlyDigital: false });
    expect(digitalBooksFor([{ book_id: "livro" }], MATERIALS).titles).toEqual([]);
  });

  it("um PDF ligado ao produto (sem variante) vem com qualquer compra do produto, mas não a torna digital", () => {
    expect(digitalBooksFor([{ book_id: "revista", quantity: 2 }], MATERIALS)).toEqual({ titles: ["Revista (PDF)"], onlyDigital: false });
  });

  it("encomenda mista: os dois PDFs, e há artigos para enviar", () => {
    const r = digitalBooksFor([{ book_id: "livro", variant: 1, digital: true }, { book_id: "revista", digital: true }, { book_id: "outro" }], MATERIALS);
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

describe("edições digitais à venda", () => {
  const LIVRO = { id: "livro", versions: [{ label: "Impresso" }, { label: "Edição digital", format: "PDF", digital: true }] };
  const REVISTA = { id: "revista", versions: [], digital: true };
  const BIBLIA = { id: "biblia", versions: null, digital: false };

  it("versionIsDigital aceita true e o texto que o painel ou uma importação gravem", () => {
    expect(versionIsDigital({ digital: true })).toBe(true);
    expect(versionIsDigital({ digital: "true" })).toBe(true);
    expect(versionIsDigital({ digital: "sim" })).toBe(true);
    expect(versionIsDigital({ digital: false })).toBe(false);
    expect(versionIsDigital({ label: "PDF" })).toBe(false);
    expect(versionIsDigital(null)).toBe(false);
    expect(versionIsDigital([true])).toBe(false);
  });

  it("isDigitalEdition: com variantes decide a variante; sem variantes, o produto", () => {
    expect(isDigitalEdition(LIVRO, 1)).toBe(true);
    expect(isDigitalEdition(LIVRO, 0)).toBe(false);
    expect(isDigitalEdition(LIVRO, null)).toBe(false);
    expect(isDigitalEdition(LIVRO, 5)).toBe(false);
    expect(isDigitalEdition(REVISTA, null)).toBe(true);
    expect(isDigitalEdition(REVISTA, 0)).toBe(false);
    expect(isDigitalEdition(BIBLIA, null)).toBe(false);
    expect(isDigitalEdition(null, null)).toBe(false);
  });

  it("digitalCart: só digitais, mistura ou nenhum", () => {
    const books = [LIVRO, REVISTA, BIBLIA];
    expect(digitalCart([{ book_id: "livro", variant: 1 }, { book_id: "revista" }], books)).toEqual({ all: true, any: true });
    expect(digitalCart([{ book_id: "livro", variant: 1 }, { book_id: "biblia" }], books)).toEqual({ all: false, any: true });
    expect(digitalCart([{ book_id: "biblia" }, { book_id: "livro", variant: 0 }], books)).toEqual({ all: false, any: false });
    // Sem a coluna (migração por aplicar) a leitura dos produtos falha: nada conta como digital.
    expect(digitalCart([{ book_id: "livro", variant: 1 }], [])).toEqual({ all: false, any: false });
    expect(digitalCart([], books)).toEqual({ all: false, any: false });
  });
});
