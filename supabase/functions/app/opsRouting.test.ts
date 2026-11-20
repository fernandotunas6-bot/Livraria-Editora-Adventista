// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOURS, addBusinessDays, channelsFor, deliveryDeadline, dispatchPlan, hoursFromRow, isOpenAt,
  openMinutesBetween, staffPrefs, ticketSlaBreach,
} from "./opsRouting.ts";
import { alertsForOrder } from "./orderWatch.ts";

// 2026-11-09 é segunda-feira. 08:00 em Luanda = 07:00 UTC.
const at = (iso: string) => Date.parse(iso);

describe("horário de funcionamento (Luanda, UTC+1)", () => {
  it("aberto de segunda a sábado, 08h–18h", () => {
    expect(isOpenAt(at("2026-11-09T07:00:00Z"))).toBe(true); // seg 08:00
    expect(isOpenAt(at("2026-11-09T06:59:00Z"))).toBe(false); // seg 07:59
    expect(isOpenAt(at("2026-11-09T17:00:00Z"))).toBe(false); // seg 18:00
    expect(isOpenAt(at("2026-11-14T10:00:00Z"))).toBe(true); // sábado
    expect(isOpenAt(at("2026-11-15T10:00:00Z"))).toBe(false); // domingo
  });

  it("conta só os minutos dentro do horário", () => {
    // Sábado 17:30 → segunda 08:30: 30 min no sábado + 30 min na segunda (domingo fechado).
    expect(openMinutesBetween(at("2026-11-14T16:30:00Z"), at("2026-11-16T07:30:00Z"))).toBe(60);
    // Encomenda às 22h, vista às 08:20 do dia seguinte: 20 minutos.
    expect(openMinutesBetween(at("2026-11-09T21:00:00Z"), at("2026-11-10T07:20:00Z"))).toBe(20);
    expect(openMinutesBetween(at("2026-11-10T07:20:00Z"), at("2026-11-09T21:00:00Z"))).toBe(0);
  });

  it("horário inválido nas definições volta ao de omissão", () => {
    expect(hoursFromRow({ open_hour: 9, close_hour: 17, open_days: [1, 2, 3, 4, 5] })).toEqual({ openHour: 9, closeHour: 17, openDays: [1, 2, 3, 4, 5] });
    expect(hoursFromRow({ open_hour: 18, close_hour: 8, open_days: [1] })).toEqual(DEFAULT_HOURS);
    expect(hoursFromRow(null)).toEqual(DEFAULT_HOURS);
  });
});

describe("prazo de entrega prometido", () => {
  const paid = (iso: string, extra = {}) => ({
    shipping_method: "delivery", delivery_province: "Luanda",
    delivery_timeline: [{ status: "received", at: "2026-11-01T10:00:00Z" }, { status: "paid", at: iso }], ...extra,
  });

  it("conta dias úteis a partir da confirmação: Luanda 7, outras províncias 14, expressa 48 h", () => {
    // Confirmada na segunda 09/11: 7 dias úteis → quarta 18/11, fim do dia.
    expect(new Date(deliveryDeadline(paid("2026-11-09T10:00:00Z"))!.deadline).toISOString()).toBe("2026-11-18T22:59:59.999Z");
    expect(deliveryDeadline(paid("2026-11-09T10:00:00Z", { delivery_province: "Huambo" }))!.deadline)
      .toBe(addBusinessDays(at("2026-11-09T10:00:00Z"), 14));
    expect(deliveryDeadline(paid("2026-11-09T10:00:00Z", { shipping_method: "express" }))!.deadline).toBe(at("2026-11-11T10:00:00Z"));
  });

  it("a data prevista pela equipa manda; levantamentos e encomendas por confirmar não têm prazo", () => {
    expect(deliveryDeadline({ shipping_method: "delivery", estimated_delivery: "2026-11-12T12:00:00Z" })).toEqual({ deadline: at("2026-11-12T12:00:00Z"), basis: "estimated" });
    expect(deliveryDeadline({ shipping_method: "pickup", estimated_delivery: "2026-11-12T12:00:00Z" })).toBeNull();
    // A edição digital não tem entrega: conclui-se ao pagar.
    expect(deliveryDeadline({ ...paid("2026-11-09T10:00:00Z"), shipping_method: "digital" })).toBeNull();
    expect(deliveryDeadline({ shipping_method: "delivery", delivery_timeline: [{ status: "received", at: "2026-11-01T10:00:00Z" }] })).toBeNull();
  });

  it("a vigilância alerta a entrega atrasada; crítica 2 dias depois", () => {
    const o = { id: "x", order_number: "ENC-1", payment_status: "paid", delivery_status: "in_transit", ...paid("2026-11-09T10:00:00Z"),
      delivery_timeline: [{ status: "paid", at: "2026-11-09T10:00:00Z" }, { status: "in_transit", at: "2026-11-17T10:00:00Z" }] };
    const late = alertsForOrder(o, at("2026-11-19T12:00:00Z")).find((a) => a.kind === "delivery_overdue");
    expect(late).toMatchObject({ severity: "warning", label: "Entrega fora do prazo prometido" });
    expect(late!.detail).toContain("18/11/2026");
    expect(alertsForOrder(o, at("2026-11-21T12:00:00Z")).find((a) => a.kind === "delivery_overdue")!.severity).toBe("critical");
    expect(alertsForOrder({ ...o, delivery_status: "delivered" }, at("2026-11-30T12:00:00Z"))).toEqual([]);
  });
});

describe("encomenda nova por assumir", () => {
  const opts = { ackMinutes: () => 30, hours: DEFAULT_HOURS };
  const nova = { id: "n", order_number: "ENC-N", payment_status: "pending", created: "2026-11-09T07:00:00Z" };

  it("em horário: crítica depois do tempo da equipa", () => {
    expect(alertsForOrder(nova, at("2026-11-09T07:20:00Z"), opts)).toEqual([]);
    const a = alertsForOrder(nova, at("2026-11-09T07:31:00Z"), opts)[0];
    expect(a).toMatchObject({ kind: "new_unacknowledged", severity: "critical", label: "Encomenda nova por assumir" });
  });

  it("de noite não conta; assumida ou já em andamento não alerta; sem a opção a regra não corre", () => {
    const deNoite = { ...nova, created: "2026-11-09T21:00:00Z" };
    expect(alertsForOrder(deNoite, at("2026-11-10T07:20:00Z"), opts)).toEqual([]);
    expect(alertsForOrder(deNoite, at("2026-11-10T07:40:00Z"), opts)[0].kind).toBe("new_unacknowledged");
    expect(alertsForOrder({ ...nova, acknowledged_at: "2026-11-09T07:05:00Z" }, at("2026-11-09T09:00:00Z"), opts)).toEqual([]);
    expect(alertsForOrder({ ...nova, delivery_status: "preparing", payment_status: "paid" }, at("2026-11-09T09:00:00Z"), opts)
      .some((a) => a.kind === "new_unacknowledged")).toBe(false);
    expect(alertsForOrder(nova, at("2026-11-09T09:00:00Z"))).toEqual([]);
  });
});

describe("canais e horário dos avisos", () => {
  it("encomenda nova sai por push, WhatsApp e email; mensagem normal de cliente só por push; confirmações só no painel", () => {
    expect(channelsFor("new_order", "high")).toEqual(["push", "whatsapp", "email"]);
    expect(channelsFor("support", "normal")).toEqual(["push"]);
    expect(channelsFor("order_confirmed", "normal")).toEqual([]);
    expect(channelsFor("order_cancelled", "normal")).toEqual(["push"]);
    expect(channelsFor("order_stuck", "critical")).toEqual(["email", "whatsapp", "push"]);
  });

  it("preferências: a união das equipas; fora de equipas, email e push", () => {
    expect(staffPrefs([])).toEqual({ email: true, whatsapp: false, push: true });
    expect(staffPrefs([{ notify_email: false, notify_whatsapp: true, notify_push: false }, { notify_email: true, notify_push: false }]))
      .toEqual({ email: true, whatsapp: true, push: false });
    expect(staffPrefs([{ notify_whatsapp: true, active: false }])).toEqual({ email: true, whatsapp: false, push: true });
  });

  it("fora de horas só sai o crítico; o resto espera pela abertura", () => {
    const prefs = { email: true, whatsapp: true, push: true };
    expect(dispatchPlan({ kind: "new_order", severity: "high" }, prefs, false)).toEqual({ channels: [], defer: true });
    expect(dispatchPlan({ kind: "escalation", severity: "critical" }, prefs, false).channels).toEqual(["email", "whatsapp", "push"]);
    expect(dispatchPlan({ kind: "order_confirmed", severity: "normal" }, prefs, false)).toEqual({ channels: [], defer: false });
    expect(dispatchPlan({ kind: "new_order", severity: "high" }, { email: false, whatsapp: false, push: true }, true).channels).toEqual(["push"]);
  });
});

describe("prazos dos pedidos de ajuda", () => {
  const base = { ticket_number: 1001, status: "open", sla_alert_level: 0, first_response_due_at: "2026-11-09T08:00:00Z", resolution_due_at: "2026-11-11T08:00:00Z" };
  it("primeira resposta em atraso → nível 1; resolução em atraso → nível 2; cada um uma vez", () => {
    expect(ticketSlaBreach(base, at("2026-11-09T07:00:00Z"))).toBe(0);
    expect(ticketSlaBreach(base, at("2026-11-09T09:00:00Z"))).toBe(1);
    expect(ticketSlaBreach({ ...base, first_response_at: "2026-11-09T07:30:00Z" }, at("2026-11-09T09:00:00Z"))).toBe(0);
    expect(ticketSlaBreach({ ...base, sla_alert_level: 1 }, at("2026-11-09T09:00:00Z"))).toBe(0);
    expect(ticketSlaBreach({ ...base, sla_alert_level: 1 }, at("2026-11-12T09:00:00Z"))).toBe(2);
    expect(ticketSlaBreach({ ...base, status: "closed" }, at("2026-11-12T09:00:00Z"))).toBe(0);
    // À espera do cliente: o relógio da resolução pára (a equipa já respondeu).
    expect(ticketSlaBreach({ ...base, status: "pending", first_response_at: "2026-11-09T07:30:00Z", sla_alert_level: 1 }, at("2026-11-12T09:00:00Z"))).toBe(0);
    expect(ticketSlaBreach({ ...base, ticket_number: null }, at("2026-11-12T09:00:00Z"))).toBe(0);
  });
});
