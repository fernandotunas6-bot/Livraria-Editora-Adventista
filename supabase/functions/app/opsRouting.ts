// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Operação da loja: horário de funcionamento, prazos de entrega prometidos, que função da equipa
// trata cada alerta e por que canais sai cada aviso. Funções puras, testadas em
// opsRouting.test.ts; a base de dados decide QUEM recebe (public.ops_recipients).

type Row = Record<string, any>;

export type Duty = "new_order" | "payment" | "preparation" | "pickup" | "delivery" | "support" | "urgent";
export type Channel = "email" | "whatsapp" | "push";
export type Severity = "normal" | "high" | "critical";

/** Horário em hora de Luanda (UTC+1, sem hora de Verão). Dias ISO: 1 = segunda … 7 = domingo. */
export type OpsHours = { openHour: number; closeHour: number; openDays: number[] };
export const DEFAULT_HOURS: OpsHours = { openHour: 8, closeHour: 18, openDays: [1, 2, 3, 4, 5, 6] };

const LUANDA_OFFSET = 3600_000;
const DAY = 24 * 3600_000;
const HOUR = 3600_000;

export function hoursFromRow(row: Row | null | undefined): OpsHours {
  const open = Number(row?.open_hour);
  const close = Number(row?.close_hour);
  const days = Array.isArray(row?.open_days) ? row!.open_days.map(Number).filter((d: number) => d >= 1 && d <= 7) : [];
  if (!Number.isInteger(open) || !Number.isInteger(close) || open < 0 || close > 24 || open >= close || !days.length) {
    return DEFAULT_HOURS;
  }
  return { openHour: open, closeHour: close, openDays: days };
}

/** Dia ISO e hora em Luanda. */
export function luanda(ms: number) {
  const d = new Date(ms + LUANDA_OFFSET);
  const dow = d.getUTCDay() || 7;
  return { day: dow, hour: d.getUTCHours(), minute: d.getUTCMinutes(), midnightUtc: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - LUANDA_OFFSET };
}

export function isOpenAt(ms: number, hours: OpsHours = DEFAULT_HOURS): boolean {
  const l = luanda(ms);
  return hours.openDays.includes(l.day) && l.hour >= hours.openHour && l.hour < hours.closeHour;
}

/** Minutos de horário de funcionamento entre dois instantes (até 60 dias). */
export function openMinutesBetween(fromMs: number, toMs: number, hours: OpsHours = DEFAULT_HOURS): number {
  if (!(toMs > fromMs)) return 0;
  let total = 0;
  let dayStart = luanda(fromMs).midnightUtc;
  for (let i = 0; i < 60 && dayStart < toMs; i++, dayStart += DAY) {
    if (!hours.openDays.includes(luanda(dayStart + HOUR).day)) continue;
    const open = dayStart + hours.openHour * HOUR;
    const close = dayStart + hours.closeHour * HOUR;
    const a = Math.max(open, fromMs);
    const b = Math.min(close, toMs);
    if (b > a) total += b - a;
  }
  return Math.floor(total / 60_000);
}

/** Fim do n-ésimo dia útil (segunda a sexta) depois de `ms`, em Luanda. */
export function addBusinessDays(ms: number, days: number): number {
  let day = luanda(ms).midnightUtc;
  let left = days;
  while (left > 0) {
    day += DAY;
    const dow = luanda(day + HOUR).day;
    if (dow <= 5) left--;
  }
  return day + DAY - 1;
}

const time = (v: unknown) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
};

// O prazo conta a partir da confirmação (Envios e Devoluções): o primeiro sinal de que a
// encomenda foi aceite — pagamento confirmado ou um passo de preparação/entrega.
const STARTED = new Set(["paid", "payment_confirmed", "confirmed", "preparing", "processing", "shipped", "in_transit", "out_for_delivery"]);

export function deliveryStart(o: Row): number {
  const timeline = Array.isArray(o?.delivery_timeline) ? o.delivery_timeline : [];
  const times = timeline.filter((e: Row) => e && STARTED.has(String(e.status))).map((e: Row) => time(e.at)).filter(Boolean);
  if (times.length) return Math.min(...times);
  return 0;
}

const isLuanda = (o: Row) => /\bluanda\b/i.test(`${o?.delivery_province || ""} ${o?.city || ""}`);

/**
 * Prazo de entrega prometido ao cliente: a data indicada pela equipa (`estimated_delivery`),
 * senão a política da loja — Luanda 7 dias úteis, outras províncias 14, expressa 48 horas.
 * Levantamentos não têm prazo de entrega (têm o alerta de "pronta e não levantada").
 */
export function deliveryDeadline(o: Row): { deadline: number; basis: "estimated" | "policy" } | null {
  // A edição digital também não: não há entrega (conclui-se ao pagar).
  if (!o || o.shipping_method === "pickup" || o.shipping_method === "digital") return null;
  const estimated = time(o.estimated_delivery);
  if (estimated) return { deadline: estimated, basis: "estimated" };
  const start = deliveryStart(o);
  if (!start) return null;
  if (o.shipping_method === "express") return { deadline: start + 48 * HOUR, basis: "policy" };
  return { deadline: addBusinessDays(start, isLuanda(o) ? 7 : 14), basis: "policy" };
}

/** Função da equipa que trata cada alerta da vigilância. */
export const DUTY_OF_ALERT: Record<string, Duty> = {
  new_unacknowledged: "new_order",
  payment_pending: "payment",
  payment_to_confirm: "payment",
  delivered_unpaid: "payment",
  refund_due: "payment",
  overpaid: "payment",
  not_prepared: "preparation",
  preparing_too_long: "preparation",
  pickup_waiting: "pickup",
  in_transit_too_long: "delivery",
  out_for_delivery_too_long: "delivery",
  delivery_overdue: "delivery",
  customer_problem: "support",
};

/**
 * Canais por tipo e gravidade. O painel recebe sempre; os outros canais só quando vale a pena
 * interromper alguém: uma mensagem normal de cliente não manda emails à equipa inteira.
 */
export function channelsFor(kind: string, severity: Severity): Channel[] {
  if (severity === "critical" || kind === "ops_test" || kind === "escalation") return ["email", "whatsapp", "push"];
  if (kind === "new_order") return ["push", "whatsapp", "email"];
  if (severity === "high") return ["push", "email"];
  if (kind === "support") return ["push"];
  // Cancelada pelo cliente: um push basta para não a prepararem (não é urgente, nada se perde).
  if (kind === "order_cancelled") return ["push"];
  return [];
}

export type StaffPrefs = { email: boolean; whatsapp: boolean; push: boolean };

/** Preferências de uma pessoa: a união das equipas a que pertence; fora de equipas, email e push. */
export function staffPrefs(teams: { notify_email?: boolean; notify_whatsapp?: boolean; notify_push?: boolean; active?: boolean }[]): StaffPrefs {
  const active = teams.filter((t) => t && t.active !== false);
  if (!active.length) return { email: true, whatsapp: false, push: true };
  return {
    email: active.some((t) => t.notify_email !== false),
    whatsapp: active.some((t) => t.notify_whatsapp === true),
    push: active.some((t) => t.notify_push !== false),
  };
}

/** O que sai agora para uma pessoa (fora de horas, só o crítico; o resto espera pela abertura). */
export function dispatchPlan(n: { kind: string; severity: Severity }, prefs: StaffPrefs, open: boolean) {
  const wanted = channelsFor(n.kind, n.severity).filter((c) => prefs[c]);
  if (!wanted.length) return { channels: [] as Channel[], defer: false };
  if (!open && n.severity !== "critical") return { channels: [] as Channel[], defer: true };
  return { channels: wanted, defer: false };
}

/** Prazos de um pedido de ajuda: o que já passou e ainda não foi avisado. */
export function ticketSlaBreach(t: Row, now = Date.now()): 0 | 1 | 2 {
  if (!t?.ticket_number || !["open", "pending"].includes(String(t.status))) return 0;
  const level = Number(t.sla_alert_level) || 0;
  const resolution = time(t.resolution_due_at);
  // O relógio da resolução pára enquanto o pedido espera pelo CLIENTE ('pending'), como nos
  // SLA do Zendesk: um cliente que não responde não é atraso da equipa (e há o fecho automático).
  if (level < 2 && t.status === "open" && resolution && now > resolution) return 2;
  const first = time(t.first_response_due_at);
  if (level < 1 && !t.first_response_at && first && now > first) return 1;
  return 0;
}
