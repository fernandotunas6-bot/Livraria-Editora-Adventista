// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Regras dos pagamentos registados que não dependem da base de dados. Testes em payments.test.ts.
//
// O estado do pagamento é calculado pela base de dados a partir de `order_payments`
// (private.order_payment_status, migração 20261107200000_pagamentos_registados). Aqui fica o que
// a Edge Function decide à volta dele: que aviso o cliente recebe depois de cada acção, quando é
// preciso registar o dinheiro ao entregar, como ler um valor escrito no painel e quantas
// encomendas por pagar o mesmo contacto pode ter.
//
// "Liquidado" e "em falta" leem-se igual no site (app/web/src/lib/payments.js): o
// payments.test.js do site importa os dois e confirma que dizem o mesmo.

type Row = Record<string, any>;

export const PAYMENT_STATUSES = ["pending", "awaiting_confirmation", "partially_paid", "paid", "refunded", "failed"] as const;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cents = (v: unknown) => Math.round(num(v) * 100);

/** O dinheiro está todo: pago (um reembolso parcial deixa-o pago) ou devolvido por inteiro. */
export const isSettled = (status: unknown) => status === "paid" || status === "refunded";

const isCancelled = (o: Row | null | undefined) => o?.status === "cancelled" || o?.delivery_status === "cancelled";

/** Quanto falta pagar. Nunca negativo. */
export function outstanding(order: Row | null | undefined): number {
  return Math.max(cents(order?.total) - cents(order?.amount_paid), 0) / 100;
}

/** O que ficou pago (menos os reembolsos) acima do total. */
export function overpaid(order: Row | null | undefined): number {
  return Math.max(cents(order?.amount_paid) - cents(order?.amount_refunded) - cents(order?.total), 0) / 100;
}

/** Paga (no todo ou em parte) e cancelada: o que falta devolver. */
export function refundDue(order: Row | null | undefined): number {
  if (!isCancelled(order)) return 0;
  return Math.max(cents(order?.amount_paid) - cents(order?.amount_refunded), 0) / 100;
}

/**
 * Valor escrito no painel ou num formulário: 1500, "1500", "1 500", "1.500", "1.500,50",
 * "1500,5", "Kz 2 000". A vírgula é a casa decimal (como em Angola); um ponto seguido de grupos
 * de três algarismos é separador de milhares. Devolve NaN quando não é um valor positivo.
 */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : NaN;
  let s = String(value ?? "").replace(/kz/gi, "").replace(/[\s  ]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    // "1.500,50" → "1500.50"; "1500,5" → "1500.5"
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return n > 0 ? Math.round(n * 100) / 100 : NaN;
}

/** O que as funções `order_payment_*` devolvem (private.order_payment_result). */
export type PaymentResult = {
  payment_id?: string;
  order_id?: string;
  order_number?: string;
  previous_status?: string;
  payment_status?: string;
  total?: number;
  amount_paid?: number;
  amount_refunded?: number;
  outstanding?: number;
  overpaid?: number;
  cancelled?: boolean;
  note?: string;
  reason?: string;
  refund_amount?: number;
  duplicates?: { order_id: string; order_number: string; status: string }[];
};

export type PaymentAction = "report" | "record" | "confirm" | "reject" | "void" | "refund";
export type CustomerNotice = "paid" | "payment_partial" | "payment_rejected" | "refunded" | null;

/**
 * Que aviso o cliente recebe depois de uma acção da equipa.
 *
 * - Confirmado ou registado e ficou pago → "Pagamento confirmado" (só na primeira vez).
 * - Confirmado ou registado e ainda falta → "Recebemos X; faltam Y".
 * - Numa encomenda cancelada, nada: o email "Pagamento confirmado" diz "vamos preparar a sua
 *   encomenda", e uma cancelada não se reabre. A equipa recebe a nota de que falta reembolsar.
 * - Rejeitado e sem outra referência por verificar → "Não encontrámos o pagamento".
 * - Reembolso → "Reembolso efectuado".
 * - Indicar e anular não avisam o cliente: indicar foi ele; anular é um acerto interno.
 */
export function customerNoticeFor(action: PaymentAction, r: PaymentResult): CustomerNotice {
  if (action === "refund") return "refunded";
  if (action === "reject") return r.payment_status === "failed" ? "payment_rejected" : null;
  if (action !== "confirm" && action !== "record") return null;
  if (r.cancelled) return null;
  if (r.payment_status === "paid") return r.previous_status === "paid" ? null : "paid";
  if (num(r.amount_paid) > 0 && num(r.outstanding) > 0) return "payment_partial";
  return null;
}

/** Valor em Kz com espaço nos milhares, como a base de dados (private.kz): "1 500 Kz". */
export const kz = (v: unknown) => `${String(Math.round(num(v))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kz`;

/** O que a equipa tem de saber depois de uma acção (o painel mostra-o no aviso). */
export function staffNoteFor(r: PaymentResult): string {
  const notes: string[] = [];
  const due = r.cancelled ? Math.max(num(r.amount_paid) - num(r.amount_refunded), 0) : 0;
  if (due > 0) notes.push(`A encomenda está cancelada: falta reembolsar ${kz(due)}.`);
  if (num(r.overpaid) > 0) notes.push(`Pago a mais: ${kz(r.overpaid)}. Devolva a diferença ao cliente (Registar reembolso).`);
  if (r.note) notes.push(String(r.note));
  if (r.duplicates?.length) {
    notes.push(`A mesma referência aparece em ${r.duplicates.map((d) => d.order_number).join(", ")}: confirme no extracto que são pagamentos diferentes.`);
  }
  return notes.join(" ");
}

/**
 * Marcar "Entregue" com o dinheiro por receber: o painel tem de dizer quanto recebeu quem
 * entregou (pagamento na entrega, balcão) ou porque se entrega sem pagamento. É a regra que
 * faltou à encomenda de 245 000 Kz entregue com o pagamento pendente.
 */
export function deliveryNeedsPayment(order: Row | null | undefined): boolean {
  if (!order || isCancelled(order)) return false;
  return !isSettled(order.payment_status) && outstanding(order) > 0;
}

/** Encomenda por pagar e ainda em curso (conta para o limite por contacto). */
export function isOpenUnpaid(o: Row, now = Date.now(), days = 30): boolean {
  const created = Date.parse(String(o?.created || ""));
  if (!Number.isFinite(created) || created < now - days * 24 * 3600_000) return false;
  if (isCancelled(o) || o.delivery_status === "delivered") return false;
  return ["pending", "awaiting_confirmation", "partially_paid", "failed"].includes(String(o.payment_status || "pending"));
}

/**
 * Pode fazer mais uma encomenda? `limit` 0 = sem limite. As encomendas já vêm filtradas pelo
 * mesmo telefone ou email.
 */
export function unpaidLimitReached(orders: Row[], limit: number, now = Date.now()): boolean {
  if (!(limit > 0)) return false;
  return orders.filter((o) => isOpenUnpaid(o, now)).length >= limit;
}

/** O que o cliente vê do pagamento no rastreio: quanto, o que indicou e porque foi recusado. */
export function trackPaymentSummary(order: Row, payments: Row[]) {
  const rows = (Array.isArray(payments) ? payments : []).filter((p) => p?.kind === "payment");
  const byTime = (p: Row) => Date.parse(String(p.decided_at || p.created || "")) || 0;
  const reported = rows.filter((p) => p.status === "reported").sort((a, b) => byTime(b) - byTime(a))[0];
  const rejected = rows.filter((p) => p.status === "rejected" && p.source === "customer"
    && !/^Substituída pelo cliente/.test(String(p.decision_reason || "")))
    .sort((a, b) => byTime(b) - byTime(a))[0];
  return {
    amount_paid: num(order?.amount_paid),
    amount_refunded: num(order?.amount_refunded),
    outstanding: outstanding(order),
    reported_reference: reported && reported.source === "customer" ? String(reported.reference || "") : "",
    rejected_reference: order?.payment_status === "failed" && rejected ? String(rejected.reference || "") : "",
    rejected_reason: order?.payment_status === "failed" && rejected ? String(rejected.decision_reason || "") : "",
  };
}
