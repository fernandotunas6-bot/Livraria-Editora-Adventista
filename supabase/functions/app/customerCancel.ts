// Quando o cliente pode cancelar uma encomenda sua (rota /order/cancel e o `can_cancel` do
// /track). A regra que decide é a de public.order_cancel_by_customer, na base de dados, com a
// linha bloqueada; esta cópia só serve para mostrar ou esconder o botão e responder sem ir à base.
// As mesmas regras estão em app/web/src/lib/customerOrders.js (teste customerCancel.test.ts):
// mudar um lado obriga a mudar os outros.

type OrderLike = {
  status?: string | null;
  delivery_status?: string | null;
  payment_status?: string | null;
  amount_paid?: number | string | null;
};

/** `null` se pode cancelar; senão, o motivo, para mostrar ao cliente. */
export function customerCancelBlock(order: OrderLike | null | undefined): string | null {
  if (!order) return "Encomenda não encontrada.";
  const status = String(order.status || "pending");
  const delivery = String(order.delivery_status || "received");
  const payment = String(order.payment_status || "pending");
  if (status === "cancelled" || delivery === "cancelled") return "Esta encomenda já está cancelada.";
  if (status === "delivered" || delivery === "delivered") return "Esta encomenda já foi entregue.";
  if ((Number(order.amount_paid) || 0) > 0 || ["paid", "partially_paid", "refunded"].includes(payment)) {
    return "Esta encomenda já tem pagamento registado: para a cancelar, fale connosco, para tratarmos do reembolso.";
  }
  if (payment === "awaiting_confirmation") {
    return "Indicou um pagamento nesta encomenda: para a cancelar, fale connosco, para confirmarmos o reembolso.";
  }
  if (!["pending", "confirmed"].includes(status) || !["received", "confirmed"].includes(delivery)) {
    return "A encomenda já está a ser preparada ou a caminho: para a cancelar, fale connosco.";
  }
  return null;
}

/** Motivo escrito pelo cliente: uma linha, sem espaços a mais, até 300 caracteres. */
export function cleanCancelReason(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
}
