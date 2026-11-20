// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Vigilância das encomendas: que encomendas estão paradas tempo demais num passo, e o resumo
 * do dia para a equipa.
 *
 * Funções puras (sem base de dados), para serem testadas e usadas igual pelo agendador
 * (alertas e resumo diário) e pelo painel de acompanhamento.
 */

import { type OpsHours, DEFAULT_HOURS, deliveryDeadline, openMinutesBetween } from "./opsRouting.ts";
import { deliveryNeedsPayment, kz, outstanding, overpaid, refundDue } from "./payments.ts";

type Row = Record<string, any>;

export type AlertKind =
  | "payment_pending"
  | "payment_to_confirm"
  | "not_prepared"
  | "preparing_too_long"
  | "pickup_waiting"
  | "in_transit_too_long"
  | "out_for_delivery_too_long"
  | "customer_problem"
  | "new_unacknowledged"
  | "delivery_overdue"
  | "delivered_unpaid"
  | "refund_due"
  | "overpaid";

type StageAlertKind = Exclude<AlertKind,
  "customer_problem" | "new_unacknowledged" | "delivery_overdue" | "delivered_unpaid" | "refund_due" | "overpaid">;

export type OrderAlert = {
  order_id: string;
  order_number: string;
  customer_name: string;
  kind: AlertKind;
  label: string;
  /** Horas no passo actual. */
  hours: number;
  /** Limite que foi passado, em horas (0 para os que alertam logo). */
  limit: number;
  severity: "warning" | "critical";
  detail: string;
};

/** Limites por passo, em horas. Passar o dobro do limite torna o alerta crítico. */
export const WATCH_RULES: Record<StageAlertKind, { hours: number; label: string }> = {
  payment_pending: { hours: 48, label: "Pagamento por confirmar" },
  // O cliente diz que pagou: quem espera agora é a loja, por isso o prazo é mais curto.
  payment_to_confirm: { hours: 12, label: "Pagamento indicado por verificar" },
  // Paga, ou a pagar no fim (na entrega ou no balcão): em ambos os casos falta preparar.
  not_prepared: { hours: 24, label: "Ainda não preparada" },
  preparing_too_long: { hours: 48, label: "Em preparação há demasiado tempo" },
  pickup_waiting: { hours: 7 * 24, label: "Pronta para levantamento e ainda não levantada" },
  in_transit_too_long: { hours: 72, label: "Expedida/em trânsito há demasiado tempo" },
  out_for_delivery_too_long: { hours: 24, label: "Saiu para entrega e não foi entregue" },
};

const HOUR = 3600_000;

const OTHER_LABELS: Record<Exclude<AlertKind, StageAlertKind>, string> = {
  customer_problem: "Cliente reportou um problema",
  new_unacknowledged: "Encomenda nova por assumir",
  delivery_overdue: "Entrega fora do prazo prometido",
  delivered_unpaid: "Entregue sem pagamento registado",
  refund_due: "Paga e cancelada: falta reembolsar",
  overpaid: "Pago a mais: falta devolver a diferença",
};
export const alertLabel = (kind: AlertKind) =>
  (kind in WATCH_RULES ? WATCH_RULES[kind as StageAlertKind].label : OTHER_LABELS[kind as Exclude<AlertKind, StageAlertKind>]);

export type WatchOptions = {
  /** Minutos de horário para alguém assumir uma encomenda nova (sem isto, a regra não corre). */
  ackMinutes?: (o: Row) => number;
  hours?: OpsHours;
  /**
   * Encomenda paga no fim — na entrega ou no balcão (métodos `offline`, ou seja, sem
   * `isPaidUpfront`): o pagamento não é o passo que falta, falta prepará-la. A mesma divisão
   * que o cancelamento automático por falta de pagamento já usa (`unpaidOrdersToCancel`).
   */
  payLater?: (o: Row) => boolean;
};

const time = (v: unknown) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
};

const isPickup = (o: Row) => String(o.shipping_method || "") === "pickup";
/** Só edições digitais (migração edicoes_digitais): nada a preparar nem a entregar. */
const isDigital = (o: Row) => String(o.shipping_method || "") === "digital";
const isCancelled = (o: Row) => o.status === "cancelled" || o.delivery_status === "cancelled";

/**
 * Passo actual da encomenda, do ponto de vista da operação.
 *
 * `payLater`: a encomenda paga-se no fim (na entrega ou no balcão). Sem pagamento ainda, o
 * passo é o mesmo de uma paga — falta prepará-la. Antes ficava em "por pagar" e, ao fim de
 * 48 h, a equipa recebia "Pagamento por confirmar" para uma encomenda que só se paga no
 * levantamento, em vez de "ainda não preparada".
 */
export function orderStage(o: Row, payLater = false): string {
  if (isCancelled(o)) return "cancelled";
  const ds = String(o.delivery_status || "");
  if (ds === "delivered" || o.status === "delivered") return "delivered";
  if (["shipped", "in_transit", "out_for_delivery", "preparing"].includes(ds)) return ds;
  if (o.payment_status === "paid" || payLater) return "paid";
  return "awaiting_payment";
}

/** Desde quando a encomenda está no passo actual: último evento da linha do tempo com esse estado. */
export function stageSince(o: Row): number {
  const timeline = Array.isArray(o.delivery_timeline) ? o.delivery_timeline : [];
  const ds = String(o.delivery_status || "");
  for (let i = timeline.length - 1; i >= 0; i--) {
    const ev = timeline[i];
    if (ev && ev.status === ds && time(ev.at)) return time(ev.at);
  }
  // Pago mas sem passo de entrega: conta desde a última actualização (normalmente o pagamento).
  if (orderStage(o) === "paid") return time(o.updated) || time(o.created);
  return time(o.created);
}

function alert(o: Row, kind: AlertKind, hours: number, limit: number, detail = "", critical?: boolean): OrderAlert {
  return {
    order_id: String(o.id),
    order_number: String(o.order_number || o.id),
    customer_name: String(o.customer_name || ""),
    kind, label: alertLabel(kind), hours: Math.floor(hours), limit,
    severity: critical ?? (kind === "customer_problem" || (limit > 0 && hours >= limit * 2)) ? "critical" : "warning",
    detail,
  };
}

const dateAO = (ms: number) => {
  const d = new Date(ms + HOUR);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

/** Alertas de uma encomenda (pode ter mais de um, por exemplo parada e com problema). */
export function alertsForOrder(o: Row, now = Date.now(), opts: WatchOptions = {}): OrderAlert[] {
  const out: OrderAlert[] = [];
  const fb = o.customer_feedback;
  if (fb?.outcome === "problem" && !fb.resolved_at) {
    out.push(alert(o, "customer_problem", (now - time(fb.at)) / HOUR, 0, String(fb.message || "")));
  }
  const stage = orderStage(o, opts.payLater?.(o) ?? false);

  // Dinheiro (migração pagamentos_registados). Alertam logo, também nas encomendas entregues e
  // canceladas, que já não têm passos: é o caso da encomenda de 245 000 Kz entregue com o
  // pagamento pendente, que nada assinalava.
  if (stage === "delivered" && deliveryNeedsPayment(o)) {
    const h = (now - stageSince(o)) / HOUR;
    const who = o.payment_status === "awaiting_confirmation" ? "indicado por quem entregou, por confirmar na caixa" : "sem pagamento registado";
    out.push(alert(o, "delivered_unpaid", h, 0, `${who} · faltam ${kz(outstanding(o))}`, h >= 48));
  }
  if (stage === "cancelled" && refundDue(o) > 0) {
    const h = (now - (time(o.updated) || time(o.created))) / HOUR;
    out.push(alert(o, "refund_due", h, 0, `por devolver: ${kz(refundDue(o))}`, h >= 72));
  }
  if (stage !== "cancelled" && overpaid(o) > 0) {
    const h = (now - (time(o.updated) || time(o.created))) / HOUR;
    out.push(alert(o, "overpaid", h, 0, `a mais: ${kz(overpaid(o))}`, false));
  }
  if (stage === "cancelled" || stage === "delivered") return out;

  // Encomenda nova que ninguém assumiu, contada só em horário de funcionamento: é crítica
  // (sobe logo aos responsáveis e às urgências), porque ninguém está a tratar dela. A edição
  // digital não se assume: o que falta é confirmar o pagamento (os alertas do pagamento dizem-no).
  if (opts.ackMinutes && !o.acknowledged_at && !isDigital(o) && (stage === "awaiting_payment" || stage === "paid")) {
    const limit = opts.ackMinutes(o);
    const minutes = openMinutesBetween(time(o.created), now, opts.hours || DEFAULT_HOURS);
    if (minutes >= limit) {
      out.push(alert(o, "new_unacknowledged", minutes / 60, limit / 60, `há ${minutes} min em horário de funcionamento, sem ninguém a assumir`, true));
    }
  }

  // Prazo prometido ao cliente ultrapassado: aviso no dia; crítico 2 dias depois.
  const due = deliveryDeadline(o);
  if (due && now > due.deadline) {
    const late = (now - due.deadline) / HOUR;
    out.push(alert(o, "delivery_overdue", late, 0,
      `${due.basis === "estimated" ? "data prevista" : "prazo da política de envios"}: ${dateAO(due.deadline)}`, late >= 48));
  }

  const hours = (now - stageSince(o)) / HOUR;
  // Com um colportor, quem está a demorar é ele, não a preparação da loja.
  const withColporteur = o.delivery_route === "colportor" ? "com um colportor: ver Colportagem → Entregas" : "";
  const rule = (kind: StageAlertKind) => {
    if (hours >= WATCH_RULES[kind].hours) out.push(alert(o, kind, hours, WATCH_RULES[kind].hours, withColporteur));
  };
  switch (stage) {
    case "awaiting_payment": rule(o.payment_status === "awaiting_confirmation" ? "payment_to_confirm" : "payment_pending"); break;
    case "paid": if (!isDigital(o)) rule("not_prepared"); break;
    case "preparing": rule("preparing_too_long"); break;
    case "shipped":
    case "in_transit": rule(isPickup(o) ? "pickup_waiting" : "in_transit_too_long"); break;
    case "out_for_delivery": rule("out_for_delivery_too_long"); break;
  }
  return out;
}

/** Todos os alertas, os críticos primeiro e depois os mais antigos. */
export function orderAlerts(orders: Row[], now = Date.now(), opts: WatchOptions = {}): OrderAlert[] {
  return orders.flatMap((o) => alertsForOrder(o, now, opts))
    .sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical") || b.hours - a.hours);
}

export const STAGE_LABELS: Record<string, string> = {
  awaiting_payment: "Por pagar",
  paid: "Por preparar",
  preparing: "Em preparação",
  shipped: "Expedidas / prontas",
  in_transit: "Em trânsito",
  out_for_delivery: "Saíram para entrega",
  delivered: "Entregues",
  cancelled: "Canceladas",
};

/** Contagem por passo e números do dia, para o painel e o resumo diário. */
export function watchSummary(orders: Row[], now = Date.now(), opts: Pick<WatchOptions, "payLater"> = {}) {
  const stages: Record<string, number> = Object.fromEntries(Object.keys(STAGE_LABELS).map((k) => [k, 0]));
  const dayAgo = now - 24 * HOUR;
  let newToday = 0, revenueToday = 0, deliveredToday = 0, confirmedByCustomer = 0;
  for (const o of orders) {
    const st = orderStage(o, opts.payLater?.(o) ?? false);
    stages[st] = (stages[st] || 0) + 1;
    if (time(o.created) >= dayAgo && st !== "cancelled") {
      newToday++;
      revenueToday += Number(o.total) || 0;
    }
    if (st === "delivered" && stageSince(o) >= dayAgo) deliveredToday++;
    if (o.customer_feedback?.outcome === "ok" && time(o.customer_confirmed_at) >= dayAgo) confirmedByCustomer++;
  }
  return { stages, newToday, revenueToday, deliveredToday, confirmedByCustomer };
}
