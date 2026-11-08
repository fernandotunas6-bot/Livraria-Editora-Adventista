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

type Item = { book_id?: unknown; variant?: unknown };

const sameVariant = (item: Item, variant: number | null) =>
  variant == null || (item.variant != null && item.variant !== "" && Number(item.variant) === Number(variant));

/**
 * `titles`: os livros digitais que a encomenda dá. `onlyDigital`: todos os artigos são edições
 * digitais (um material ligado à variante do artigo) — não há nada para enviar nem levantar.
 */
export function digitalBooksFor(items: unknown, materials: PaidMaterial[]) {
  const list = (Array.isArray(items) ? items : []).filter((i): i is Item => !!i && typeof i === "object");
  const valid = (Array.isArray(materials) ? materials : []).filter((m) => m && m.book_id);
  const unlocked = valid.filter((m) => list.some((it) => String(it.book_id) === m.book_id && sameVariant(it, m.variant)));
  const onlyDigital = list.length > 0 && list.every((it) => valid.some((m) =>
    m.variant != null && String(it.book_id) === m.book_id && sameVariant(it, m.variant)));
  return { titles: [...new Set(unlocked.map((m) => String(m.title || "").trim()).filter(Boolean))], onlyDigital };
}

/** "O Desejado", "O Desejado e Caminho a Cristo", "A, B e C". */
export function titleList(titles: string[]) {
  const t = titles.filter(Boolean);
  if (t.length <= 1) return t[0] || "";
  return `${t.slice(0, -1).join(", ")} e ${t[t.length - 1]}`;
}
