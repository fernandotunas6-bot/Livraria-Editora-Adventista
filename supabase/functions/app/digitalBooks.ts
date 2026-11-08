/**
 * Livros digitais de uma encomenda (migração `livros_digitais`).
 *
 * Um material pago (`downloads`, acesso `paid`) pertence a um produto e, se quiser, a uma variante
 * — a "Edição digital". A encomenda dá-o quando tem esse produto (e essa variante). É a mesma
 * regra que `private.order_has_item` na base de dados: o email de pagamento confirmado diz que
 * livros já estão na biblioteca, e a base de dados abre exactamente esses.
 *
 * Sem nada de Deno nem de Supabase: testado no `npm test` (digitalBooks.test.ts).
 */

export type PaidMaterial = { id: string; title: string; book_id: string | null; variant: number | null };

type Item = { book_id?: unknown; variant?: unknown; digital?: unknown };

const sameVariant = (item: Item, variant: number | null) =>
  variant == null || (item.variant != null && item.variant !== "" && Number(item.variant) === Number(variant));

/**
 * `titles`: os livros digitais que a encomenda dá. `onlyDigital`: todos os artigos são edições
 * digitais (o `place_order` marca-os com `digital: true`, migração edicoes_digitais) — não há
 * nada para enviar nem levantar. Um PDF de oferta com um livro impresso não a torna digital.
 */
export function digitalBooksFor(items: unknown, materials: PaidMaterial[]) {
  const list = (Array.isArray(items) ? items : []).filter((i): i is Item => !!i && typeof i === "object");
  const valid = (Array.isArray(materials) ? materials : []).filter((m) => m && m.book_id);
  const unlocked = valid.filter((m) => list.some((it) => String(it.book_id) === m.book_id && sameVariant(it, m.variant)));
  const onlyDigital = list.length > 0 && list.every((it) => it.digital === true);
  return { titles: [...new Set(unlocked.map((m) => String(m.title || "").trim()).filter(Boolean))], onlyDigital };
}

// ---------------------------------------------------------------------------
// Edições digitais à venda (migração edicoes_digitais)
// ---------------------------------------------------------------------------
// Um produto digital não tem stock nem envio. Com variantes, decide cada uma ("digital": true em
// `versions`); sem variantes, o produto (`stock_books.digital`). É a mesma regra que
// `private.item_digital` na base de dados e `isDigitalEdition` no site (lib/digitalEditions.js).

type Row = Record<string, unknown>;

/** Uma variante (um elemento de `versions`) é a edição digital? */
export function versionIsDigital(version: unknown): boolean {
  if (!version || typeof version !== "object" || Array.isArray(version)) return false;
  return ["true", "t", "1", "yes", "sim"].includes(String((version as Row).digital ?? "").trim().toLowerCase());
}

/** Este produto, nesta variante, é digital? */
export function isDigitalEdition(book: Row | null | undefined, variant: number | null | undefined): boolean {
  if (!book) return false;
  const versions = Array.isArray(book.versions) ? book.versions : [];
  if (versions.length) {
    const i = variant == null ? NaN : Number(variant);
    return Number.isInteger(i) && i >= 0 && i < versions.length && versionIsDigital(versions[i]);
  }
  return variant == null && book.digital === true;
}

/**
 * O carrinho tem edições digitais? `all`: só digitais (o envio é 'digital': sem morada nem portes);
 * `any`: pelo menos uma (a compra precisa de conta, que é onde o livro fica).
 */
export function digitalCart(items: { book_id: string; variant?: number }[], books: Row[]) {
  const byId = new Map((Array.isArray(books) ? books : []).filter(Boolean).map((b) => [String(b.id), b]));
  const flags = (Array.isArray(items) ? items : []).map((it) => isDigitalEdition(byId.get(String(it.book_id)), it.variant ?? null));
  return { all: flags.length > 0 && flags.every(Boolean), any: flags.some(Boolean) };
}

/** "O Desejado", "O Desejado e Caminho a Cristo", "A, B e C". */
export function titleList(titles: string[]) {
  const t = titles.filter(Boolean);
  if (t.length <= 1) return t[0] || "";
  return `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}
