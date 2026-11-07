import { describe, expect, it } from "vitest";
import { buildOpsReport, fmtDuration, median } from "./opsReport.ts";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("relatório do atendimento", () => {
  it("medianas, prazos cumpridos, satisfação e passagem do assistente", () => {
    const tickets = [
      // respondido em 1 h (dentro do prazo de 24 h), resolvido em 10 h (dentro de 72 h), 5 estrelas
      { ticket_number: 1, status: "closed", channel: "assistant", category: "payment", escalated_at: ago(20), first_response_at: ago(19),
        first_response_due_at: ago(-4), closed_at: ago(10), resolution_due_at: ago(-52), csat_score: 5, csat_at: ago(9) },
      // respondido em 3 h mas o prazo era 1 h (urgente); à espera da equipa e com resolução atrasada
      { ticket_number: 2, status: "open", channel: "form", category: "order", escalated_at: ago(30), first_response_at: ago(27),
        first_response_due_at: ago(29), resolution_due_at: ago(22) },
      // sem resposta, ainda dentro do prazo
      { ticket_number: 3, status: "open", channel: "assistant", category: "payment", escalated_at: ago(2), first_response_due_at: ago(-22), resolution_due_at: ago(-70) },
      // à espera do cliente com o prazo de resolução passado: não conta como atraso da equipa
      { ticket_number: 5, status: "pending", channel: "form", category: "order", escalated_at: ago(500), first_response_at: ago(499), resolution_due_at: ago(100) },
      // fora do período
      { ticket_number: 4, status: "closed", escalated_at: ago(400), closed_at: ago(300), csat_score: 1, csat_at: ago(299) },
    ];
    const r = buildOpsReport({
      tickets,
      conversations: [{ created_at: ago(5), ticket_number: 1 }, { created_at: ago(6) }, { created_at: ago(7) }, { created_at: ago(8), ticket_number: 3 }],
      feedback: [{ feedback: 1 }, { feedback: 1 }, { feedback: -1 }],
      orders: [{ created: ago(10), acknowledged_at: ago(9.5) }, { created: ago(5), acknowledged_at: ago(4) }, { created: ago(1) }],
      alerts: [{ kind: "new_unacknowledged", first_seen_at: ago(3) }, { kind: "not_prepared", first_seen_at: ago(3) }],
      overdueOrders: 1,
      now: NOW,
    });
    expect(r.tickets).toMatchObject({
      opened: 3, closed: 1, open_now: 3, overdue_now: 1,
      first_response_minutes: 120, resolution_minutes: 600,
      first_response_within_sla: 50, resolution_within_sla: 100,
      csat_responses: 1, csat_average: 5, csat_satisfied: 100, from_assistant: 2,
      by_category: { payment: 2, order: 1 },
    });
    expect(r.assistant).toEqual({ conversations: 4, handed_off: 2, handoff_rate: 50, helpful: 2, not_helpful: 1 });
    expect(r.orders).toEqual({ created: 3, acknowledged_minutes: 45, escalated_unacknowledged: 1, overdue_now: 1 });
  });

  it("sem dados não inventa números", () => {
    const r = buildOpsReport({ tickets: [], conversations: [], feedback: [], orders: [], alerts: [], overdueOrders: 0, now: NOW });
    expect(r.tickets.first_response_minutes).toBeNull();
    expect(r.tickets.csat_average).toBeNull();
    expect(r.assistant.handoff_rate).toBeNull();
  });

  it("mediana e durações legíveis", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(fmtDuration(45)).toBe("45 min");
    expect(fmtDuration(200)).toBe("3 h 20 min");
    expect(fmtDuration(120)).toBe("2 h");
    expect(fmtDuration(3 * 24 * 60)).toBe("3 dias");
    expect(fmtDuration(null)).toBe("—");
  });
});
