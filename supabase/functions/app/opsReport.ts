// Indicadores do atendimento e da operação num período (por omissão, os últimos 7 dias).
// Funções puras, testadas em opsReport.test.ts; usadas pelo painel e pelo relatório semanal.
//
// As medidas são as habituais nos sistemas de atendimento: tempo até à primeira resposta e até
// à resolução (medianas, para um caso extremo não esconder o normal), percentagem dentro do
// prazo (SLA), satisfação (CSAT: % de 4 e 5 estrelas) e, do lado das encomendas, o tempo até
// alguém assumir e as entregas fora do prazo.

type Row = Record<string, any>;

const t = (v: unknown) => {
  const n = Date.parse(String(v || ""));
  return Number.isFinite(n) ? n : 0;
};

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null);
const minutes = (ms: number | null) => (ms == null ? null : Math.round(ms / 60_000));

export type OpsReport = {
  from: string;
  to: string;
  tickets: {
    opened: number;
    closed: number;
    open_now: number;
    overdue_now: number;
    first_response_minutes: number | null;
    resolution_minutes: number | null;
    first_response_within_sla: number | null;
    resolution_within_sla: number | null;
    csat_responses: number;
    csat_average: number | null;
    csat_satisfied: number | null;
    from_assistant: number;
    by_category: Record<string, number>;
  };
  assistant: { conversations: number; handed_off: number; handoff_rate: number | null; helpful: number; not_helpful: number };
  orders: { created: number; acknowledged_minutes: number | null; escalated_unacknowledged: number; overdue_now: number };
};

export function buildOpsReport(input: {
  tickets: Row[];            // pedidos com escalated_at ou closed_at no período, e os abertos agora
  conversations: Row[];      // conversas do assistente criadas no período
  feedback: Row[];           // { feedback } das respostas do assistente no período
  orders: Row[];             // encomendas criadas no período
  alerts: Row[];             // order_alerts do período
  overdueOrders: number;     // alertas de entrega fora do prazo abertos agora
  now?: number;
  days?: number;
}): OpsReport {
  const now = input.now ?? Date.now();
  const days = input.days ?? 7;
  const since = now - days * 24 * 3600_000;
  const inPeriod = (v: unknown) => t(v) >= since && t(v) <= now;

  const opened = input.tickets.filter((x) => x.ticket_number && inPeriod(x.escalated_at));
  const closed = input.tickets.filter((x) => x.status === "closed" && inPeriod(x.closed_at));
  const openNow = input.tickets.filter((x) => x.ticket_number && ["open", "pending"].includes(String(x.status)));
  const overdueNow = openNow.filter((x) =>
    (!x.first_response_at && t(x.first_response_due_at) && t(x.first_response_due_at) < now)
    || (x.status === "open" && t(x.resolution_due_at) && t(x.resolution_due_at) < now));

  const responded = opened.filter((x) => x.first_response_at);
  const firstTimes = responded.map((x) => t(x.first_response_at) - t(x.escalated_at));
  const withFirstDue = responded.filter((x) => x.first_response_due_at);
  const resolvedTimes = closed.filter((x) => x.escalated_at).map((x) => t(x.closed_at) - t(x.escalated_at));
  const withResolutionDue = closed.filter((x) => x.resolution_due_at);

  const rated = input.tickets.filter((x) => x.csat_score && inPeriod(x.csat_at));
  const scores = rated.map((x) => Number(x.csat_score));
  const byCategory: Record<string, number> = {};
  for (const x of opened) byCategory[String(x.category || "other")] = (byCategory[String(x.category || "other")] || 0) + 1;

  const convs = input.conversations.filter((x) => inPeriod(x.created_at));
  const handedOff = convs.filter((x) => x.ticket_number).length;

  const orders = input.orders.filter((x) => inPeriod(x.created));
  const ackTimes = orders.filter((x) => x.acknowledged_at).map((x) => t(x.acknowledged_at) - t(x.created));
  const escalatedUnack = input.alerts.filter((a) => a.kind === "new_unacknowledged" && inPeriod(a.first_seen_at)).length;

  return {
    from: new Date(since).toISOString(),
    to: new Date(now).toISOString(),
    tickets: {
      opened: opened.length,
      closed: closed.length,
      open_now: openNow.length,
      overdue_now: overdueNow.length,
      first_response_minutes: minutes(median(firstTimes)),
      resolution_minutes: minutes(median(resolvedTimes)),
      first_response_within_sla: pct(withFirstDue.filter((x) => t(x.first_response_at) <= t(x.first_response_due_at)).length, withFirstDue.length),
      resolution_within_sla: pct(withResolutionDue.filter((x) => t(x.closed_at) <= t(x.resolution_due_at)).length, withResolutionDue.length),
      csat_responses: scores.length,
      csat_average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      csat_satisfied: pct(scores.filter((s) => s >= 4).length, scores.length),
      from_assistant: opened.filter((x) => x.channel === "assistant").length,
      by_category: byCategory,
    },
    assistant: {
      conversations: convs.length,
      handed_off: handedOff,
      handoff_rate: pct(handedOff, convs.length),
      helpful: input.feedback.filter((f) => Number(f.feedback) === 1).length,
      not_helpful: input.feedback.filter((f) => Number(f.feedback) === -1).length,
    },
    orders: {
      created: orders.length,
      acknowledged_minutes: minutes(median(ackTimes)),
      escalated_unacknowledged: escalatedUnack,
      overdue_now: input.overdueOrders,
    },
  };
}

/** Duração legível: "45 min", "3 h 20 min", "2 dias". */
export function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(min / (24 * 60))} dias`;
}
