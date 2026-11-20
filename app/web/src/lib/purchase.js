// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Quando uma encomenda conta como compra feita: não cancelada, e já paga, entregue ou confirmada
// pelo cliente. É a regra da "compra verificada" nas avaliações; a base de dados aplica a mesma
// (public.book_reviews_before_save, migração 20261106160000). Mudar um lado obriga a mudar o outro.
const CANCELADA = new Set(['cancelled', 'canceled', 'cancelada']);

export function isCompletedPurchase(order) {
  if (!order) return false;
  if (CANCELADA.has(String(order.status || '')) || order.delivery_status === 'cancelled') return false;
  return order.payment_status === 'paid' || order.delivery_status === 'delivered' || !!order.customer_confirmed_at;
}

/** O cliente comprou este livro (numa encomenda que conta)? */
export function hasPurchasedBook(orders, bookId) {
  if (!bookId || !Array.isArray(orders)) return false;
  return orders.some((order) => isCompletedPurchase(order)
    && (order.items || []).some((item) => item.book_id === bookId || item.product_id === bookId));
}
