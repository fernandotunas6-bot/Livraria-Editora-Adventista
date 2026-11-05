/**
 * Vigilância das encomendas: que encomendas estão paradas tempo demais num passo, e o resumo
 * do dia para a equipa.
 *
 * Funções puras (sem base de dados), para serem testadas e usadas igual pelo agendador
 * (alertas e resumo diário) e pelo painel de acompanhamento.
 */

type Row = Record<string, any>;

export type AlertKind =
  | "payment_pending"
  | "not_prepared"
  | "preparing_too_long"
  | "pickup_waiting"
  | "in_transit_too_long"
  | "out_for_delivery_too_long"
  | "customer_problem";

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
export const WATCH_RULES: Record<Exclude<AlertKind, "customer_problem">, { hours: number; label: string }> = {
  payment_pending: { hours: 48, label: "Pagamento por confirmar" },
  not_prepared: { hours: 24, label: "Paga e ainda não preparada" },
  preparing_too_long: { hours: 48, label: "Em preparação há demasiado tempo" },
  pickup_waiting: { hours: 7 * 24, label: "Pronta para levantamento e ainda não levantada" },
  in_transit_too_long: { hours: 72, label: "Expedida/em trânsito há demasiado tempo" },
  out_for_delivery_too_long: { hours: 24, label: "Saiu para entrega e não foi entregue" },
};

const HOUR = 3600_000;

const time = (v: unknown) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
};

const isPickup = (o: Row) => String(o.shipping_method || "") === "pickup";
const isCancelled = (o: Row) => o.status === "cancelled" || o.delivery_status === "cancelled";

/** Passo actual da encomenda, do ponto de vista da operação. */
export function orderStage(o: Row): string {
  if (isCancelled(o)) return "cancelled";
  const ds = String(o.delivery_status || "");
  if (ds === "delivered" || o.status === "delivered") return "delivered";
  if (["shipped", "in_transit", "out_for_delivery", "preparing"].includes(ds)) return ds;
  if (o.payment_status === "paid") return "paid";
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

function alert(o: Row, kind: AlertKind, hours: number, limit: number, detail = ""): OrderAlert {
  const label = kind === "customer_problem" ? "Cliente reportou um problema" : WATCH_RULES[kind].label;
  return {
    order_id: String(o.id),
    order_number: String(o.order_number || o.id),
    customer_name: String(o.customer_name || ""),
    kind, label, hours: Math.floor(hours), limit,
    severity: kind === "customer_problem" || (limit > 0 && hours >= limit * 2) ? "critical" : "warning",
    detail,
  };
}

/** Alertas de uma encomenda (pode ter mais de um, por exemplo parada e com problema). */
export function alertsForOrder(o: Row, now = Date.now()): OrderAlert[] {
  const out: OrderAlert[] = [];
  const fb = o.customer_feedback;
  if (fb?.outcome === "problem" && !fb.resolved_at) {
    out.push(alert(o, "customer_problem", (now - time(fb.at)) / HOUR, 0, String(fb.message || "")));
  }
  const stage = orderStage(o);
  if (stage === "cancelled" || stage === "delivered") return out;
  const hours = (now - stageSince(o)) / HOUR;
  const rule = (kind: Exclude<AlertKind, "customer_problem">) => {
    if (hours >= WATCH_RULES[kind].hours) out.push(alert(o, kind, hours, WATCH_RULES[kind].hours));
  };
  switch (stage) {
    case "awaiting_payment": rule("payment_pending"); break;
    case "paid": rule("not_prepared"); break;
    case "preparing": rule("preparing_too_long"); break;
    case "shipped":
    case "in_transit": rule(isPickup(o) ? "pickup_waiting" : "in_transit_too_long"); break;
    case "out_for_delivery": rule("out_for_delivery_too_long"); break;
  }
  return out;
}

/** Todos os alertas, os críticos primeiro e depois os mais antigos. */
export function orderAlerts(orders: Row[], now = Date.now()): OrderAlert[] {
  return orders.flatMap((o) => alertsForOrder(o, now))
    .sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical") || b.hours - a.hours);
}

export const STAGE_LABELS: Record<string, string> = {
  awaiting_payment: "Por pagar",
  paid: "Pagas, por preparar",
  preparing: "Em preparação",
  shipped: "Expedidas / prontas",
  in_transit: "Em trânsito",
  out_for_delivery: "Saíram para entrega",
  delivered: "Entregues",
  cancelled: "Canceladas",
};

/** Contagem por passo e números do dia, para o painel e o resumo diário. */
export function watchSummary(orders: Row[], now = Date.now()) {
  const stages: Record<string, number> = Object.fromEntries(Object.keys(STAGE_LABELS).map((k) => [k, 0]));
  const dayAgo = now - 24 * HOUR;
  let newToday = 0, revenueToday = 0, deliveredToday = 0, confirmedByCustomer = 0;
  for (const o of orders) {
    const st = orderStage(o);
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
