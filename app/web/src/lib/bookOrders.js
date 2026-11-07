/**
 * Quantas encomendas incluem um livro (aviso antes de o apagar no painel).
 *
 * `orders.items` é jsonb. O filtro `contains` do supabase-js trata um array como um array do
 * Postgres e escrevia `items=cs.{[object Object]}`: a API respondia 400 ("invalid input syntax
 * for type json", 3 vezes nos registos de 2026-11-06), a contagem vinha vazia e o aviso
 * "este livro aparece em N encomendas" nunca aparecia. Em JSON, o mesmo filtro passa a
 * `items @> '[{"book_id": …}]'`.
 */
export function ordersWithBookQuery(client, bookId) {
  return client
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .contains('items', JSON.stringify([{ book_id: String(bookId) }]));
}
