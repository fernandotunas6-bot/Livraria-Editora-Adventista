// Pagamentos registados, no site: o que se lê do pagamento de uma encomenda (liquidado, em
// falta, por reembolsar, pago a mais) e a receita dos painéis e relatórios.
//
// O estado do pagamento é calculado pela base de dados a partir de `order_payments`
// (migração 20261107200000_pagamentos_registados): o site só o lê. A Edge Function tem a mesma
// leitura em supabase/functions/app/payments.ts; o payments.test.js importa as duas e confirma
// que dizem o mesmo. Mudar um lado obriga a mudar o outro.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cents = (v) => Math.round(num(v) * 100);

/** O dinheiro está todo: pago (um reembolso parcial deixa-o pago) ou devolvido por inteiro. */
export const isSettled = (status) => status === 'paid' || status === 'refunded';

export const isCancelledOrder = (o) => o?.status === 'cancelled' || o?.delivery_status === 'cancelled';

/** Quanto falta pagar. Nunca negativo. */
export function outstanding(order) {
  return Math.max(cents(order?.total) - cents(order?.amount_paid), 0) / 100;
}

/** O que ficou pago (menos os reembolsos) acima do total. */
export function overpaid(order) {
  return Math.max(cents(order?.amount_paid) - cents(order?.amount_refunded) - cents(order?.total), 0) / 100;
}

/** Paga (no todo ou em parte) e cancelada: o que falta devolver. */
export function refundDue(order) {
  if (!isCancelledOrder(order)) return 0;
  return Math.max(cents(order?.amount_paid) - cents(order?.amount_refunded), 0) / 100;
}

/** O que entrou de facto: pago menos reembolsado. */
export const netReceived = (order) => (cents(order?.amount_paid) - cents(order?.amount_refunded)) / 100;

/** Marcar "Entregue" com dinheiro por receber pede o pagamento recebido (ou o motivo). */
export function deliveryNeedsPayment(order) {
  if (!order || isCancelledOrder(order)) return false;
  return !isSettled(order.payment_status) && outstanding(order) > 0;
}

/**
 * Totais de dinheiro de uma lista de encomendas, com uma só definição em todo o painel:
 *
 * - **Recebido** (a receita): o que entrou, menos os reembolsos, de todas as encomendas — uma
 *   cancelada que foi paga e ainda não reembolsada continua a ter o dinheiro na conta.
 * - **Por receber**: o que falta pagar das encomendas activas.
 * - **Vendido**: o total das encomendas activas. Não é receita: inclui o que ainda não entrou.
 */
export function moneySummary(orders) {
  let received = 0;
  let receivable = 0;
  let sold = 0;
  let refundDueTotal = 0;
  for (const o of orders || []) {
    received += cents(o.amount_paid) - cents(o.amount_refunded);
    if (isCancelledOrder(o)) {
      refundDueTotal += Math.max(cents(o.amount_paid) - cents(o.amount_refunded), 0);
      continue;
    }
    sold += cents(o.total);
    receivable += Math.max(cents(o.total) - cents(o.amount_paid), 0);
  }
  return { received: received / 100, receivable: receivable / 100, sold: sold / 100, refundDue: refundDueTotal / 100 };
}

/** Dia (em Luanda, UTC+1) em que a encomenda ficou paga, ou null. */
export function paidDay(order) {
  if (!order?.paid_at) return null;
  const t = Date.parse(order.paid_at);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 3600 * 1000).toISOString().slice(0, 10);
}

/** Estados de um pagamento registado (linha de order_payments), para o painel. */
export const PAYMENT_ENTRY_STATUS = {
  reported: { label: 'Por verificar', color: 'bg-orange-500/10 text-orange-700' },
  confirmed: { label: 'Confirmado', color: 'bg-green-500/10 text-green-700' },
  rejected: { label: 'Rejeitado', color: 'bg-destructive/10 text-destructive' },
  voided: { label: 'Anulado', color: 'bg-muted text-muted-foreground line-through' },
};

/** Canal da venda nos relatórios (o mesmo que private.order_channel na base de dados). */
export const CHANNEL_LABELS = { site: 'Site', whatsapp: 'WhatsApp', colportor: 'Colportor' };
