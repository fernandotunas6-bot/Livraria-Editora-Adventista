import { describe, expect, it } from "vitest";
import { alertsForOrder, orderAlerts, orderStage, stageSince, watchSummary } from "./orderWatch.ts";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("orderWatch", () => {
  it("encomenda por pagar há mais de 48 h dá alerta; o dobro é crítico", () => {
    const o = { id: "a", order_number: "ENC-1", payment_status: "pending", created: hoursAgo(50) };
    expect(alertsForOrder(o, NOW)[0]).toMatchObject({ kind: "payment_pending", severity: "warning" });
    expect(alertsForOrder({ ...o, created: hoursAgo(100) }, NOW)[0].severity).toBe("critical");
    expect(alertsForOrder({ ...o, created: hoursAgo(10) }, NOW)).toEqual([]);
  });

  it("conta o tempo desde o último evento do passo actual", () => {
    const o = {
      id: "b", payment_status: "paid", delivery_status: "preparing", created: hoursAgo(200),
      delivery_timeline: [{ status: "confirmed", at: hoursAgo(100) }, { status: "preparing", at: hoursAgo(30) }],
    };
    expect(stageSince(o)).toBe(Date.parse(hoursAgo(30)));
    expect(alertsForOrder(o, NOW)).toEqual([]);
    expect(alertsForOrder({ ...o, delivery_timeline: [{ status: "preparing", at: hoursAgo(60) }] }, NOW)[0].kind).toBe("preparing_too_long");
  });

  it("levantamento na loja tem um limite próprio", () => {
    const o = { id: "c", payment_status: "paid", delivery_status: "shipped", shipping_method: "pickup",
      delivery_timeline: [{ status: "shipped", at: hoursAgo(80) }] };
    expect(alertsForOrder(o, NOW)).toEqual([]);
    expect(alertsForOrder({ ...o, shipping_method: "delivery" }, NOW)[0].kind).toBe("in_transit_too_long");
  });

  it("entregues e canceladas não alertam, excepto um problema do cliente por resolver", () => {
    const entregue = { id: "d", delivery_status: "delivered", created: hoursAgo(500) };
    expect(alertsForOrder(entregue, NOW)).toEqual([]);
    const comProblema = { ...entregue, customer_feedback: { outcome: "problem", message: "Faltou um livro", at: hoursAgo(2) } };
    expect(alertsForOrder(comProblema, NOW)[0]).toMatchObject({ kind: "customer_problem", severity: "critical", detail: "Faltou um livro" });
    expect(alertsForOrder({ ...comProblema, customer_feedback: { ...comProblema.customer_feedback, resolved_at: hoursAgo(1) } }, NOW)).toEqual([]);
    expect(alertsForOrder({ id: "e", status: "cancelled", created: hoursAgo(500) }, NOW)).toEqual([]);
  });

  it("ordena críticos primeiro e resume por passo", () => {
    const orders = [
      { id: "1", payment_status: "pending", created: hoursAgo(60) },
      { id: "2", payment_status: "pending", created: hoursAgo(200) },
      { id: "3", payment_status: "paid", delivery_status: "delivered", created: hoursAgo(5), total: 1000,
        delivery_timeline: [{ status: "delivered", at: hoursAgo(1) }] },
    ];
    expect(orderAlerts(orders, NOW).map((a) => a.order_id)).toEqual(["2", "1"]);
    const s = watchSummary(orders, NOW);
    expect(s.stages.awaiting_payment).toBe(2);
    expect(s.stages.delivered).toBe(1);
    expect(s.newToday).toBe(1);
    expect(s.deliveredToday).toBe(1);
    expect(orderStage({ status: "cancelled", delivery_status: "shipped" })).toBe("cancelled");
  });

  describe("encomendas pagas no fim (na entrega ou no balcão)", () => {
    const balcao = { id: "b", order_number: "ENC-B", payment_status: "pending", payment_method_code: "balcao", shipping_method: "pickup", created: hoursAgo(30) };
    const payLater = (o: Record<string, unknown>) => o.payment_method_code === "balcao";

    it("por preparar há mais de 24 h: falta prepará-la, não o pagamento", () => {
      const alerts = alertsForOrder(balcao, NOW, { payLater });
      expect(alerts.map((a) => a.kind)).toEqual(["not_prepared"]);
      expect(alerts[0].label).toBe("Ainda não preparada");
      expect(orderStage(balcao, true)).toBe("paid");
    });

    it("nem com 50 h aparece \"Pagamento por confirmar\"", () => {
      const kinds = alertsForOrder({ ...balcao, created: hoursAgo(50) }, NOW, { payLater }).map((a) => a.kind);
      expect(kinds).not.toContain("payment_pending");
      expect(kinds).toContain("not_prepared");
    });

    it("já em preparação ou pronta: segue o passo da entrega, como as outras", () => {
      const preparing = { ...balcao, delivery_status: "preparing", delivery_timeline: [{ status: "preparing", at: hoursAgo(10) }] };
      expect(orderStage(preparing, true)).toBe("preparing");
      expect(alertsForOrder(preparing, NOW, { payLater })).toEqual([]);
    });

    it("sem a regra (métodos pagos antes), continua a pedir o pagamento", () => {
      const transferencia = { ...balcao, payment_method_code: "transferencia", created: hoursAgo(50) };
      expect(alertsForOrder(transferencia, NOW, { payLater }).map((a) => a.kind)).toEqual(["payment_pending"]);
      expect(orderStage(transferencia)).toBe("awaiting_payment");
    });

    it("o resumo conta-as em \"Por preparar\", não em \"Por pagar\"", () => {
      const s = watchSummary([balcao, { ...balcao, id: "t", payment_method_code: "transferencia" }], NOW, { payLater });
      expect(s.stages.paid).toBe(1);
      expect(s.stages.awaiting_payment).toBe(1);
    });
  });
});

describe("alertas de dinheiro (pagamentos registados)", () => {
  const entregue = {
    id: "d", order_number: "ENC-245", payment_status: "pending", payment_method_code: "balcao", total: 245000, amount_paid: 0,
    amount_refunded: 0, status: "delivered", delivery_status: "delivered", created: hoursAgo(120),
    delivery_timeline: [{ status: "delivered", at: hoursAgo(3) }],
  };

  it("entregue sem pagamento alerta logo; 48 h depois é crítico", () => {
    const [a] = alertsForOrder(entregue, NOW);
    expect(a).toMatchObject({ kind: "delivered_unpaid", severity: "warning" });
    expect(a.detail).toMatch(/faltam 245 000 Kz/);
    const antigo = { ...entregue, delivery_timeline: [{ status: "delivered", at: hoursAgo(50) }] };
    expect(alertsForOrder(antigo, NOW)[0].severity).toBe("critical");
  });

  it("dinheiro indicado por quem entregou: diz que falta confirmar na caixa", () => {
    const [a] = alertsForOrder({ ...entregue, payment_status: "awaiting_confirmation" }, NOW);
    expect(a.detail).toMatch(/por confirmar na caixa/);
  });

  it("entregue e paga não alerta", () => {
    expect(alertsForOrder({ ...entregue, payment_status: "paid", amount_paid: 245000 }, NOW)).toEqual([]);
  });

  it("paga e cancelada: falta reembolsar", () => {
    const o = { ...entregue, status: "cancelled", delivery_status: "cancelled", payment_status: "paid", amount_paid: 5000, total: 5000, updated: hoursAgo(80) };
    expect(alertsForOrder(o, NOW)[0]).toMatchObject({ kind: "refund_due", severity: "critical" });
    expect(alertsForOrder({ ...o, amount_refunded: 5000, payment_status: "refunded" }, NOW)).toEqual([]);
  });

  it("pago a mais: falta devolver a diferença", () => {
    const o = { id: "e", payment_status: "paid", total: 1000, amount_paid: 1500, amount_refunded: 0, delivery_status: "received", created: hoursAgo(2) };
    expect(alertsForOrder(o, NOW).map((a) => a.kind)).toContain("overpaid");
  });

  it("referência indicada pelo cliente: prazo de 12 h para a loja verificar", () => {
    const o = { id: "f", payment_status: "awaiting_confirmation", delivery_status: "received", created: hoursAgo(14),
      delivery_timeline: [{ status: "received", at: hoursAgo(13) }] };
    expect(alertsForOrder(o, NOW)[0]).toMatchObject({ kind: "payment_to_confirm", severity: "warning" });
    expect(alertsForOrder({ ...o, payment_status: "pending" }, NOW)).toEqual([]);
  });
});
