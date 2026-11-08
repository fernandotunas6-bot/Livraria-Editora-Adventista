import { describe, expect, it } from "vitest";
import {
  customerNoticeFor, deliveryNeedsPayment, isOpenUnpaid, isSettled, kz, outstanding, overpaid, parseAmount,
  refundDue, staffNoteFor, trackPaymentSummary, unpaidLimitReached,
} from "./payments.ts";

describe("valores", () => {
  it("em falta, pago a mais e por reembolsar", () => {
    expect(outstanding({ total: 11500, amount_paid: 6000 })).toBe(5500);
    expect(outstanding({ total: 11500, amount_paid: 12000 })).toBe(0);
    expect(overpaid({ total: 11500, amount_paid: 12000, amount_refunded: 0 })).toBe(500);
    expect(overpaid({ total: 11500, amount_paid: 12000, amount_refunded: 500 })).toBe(0);
    expect(refundDue({ status: "cancelled", amount_paid: 7000, amount_refunded: 2000 })).toBe(5000);
    expect(refundDue({ status: "pending", amount_paid: 7000, amount_refunded: 0 })).toBe(0);
  });

  it("sem erros de vírgula flutuante", () => {
    expect(outstanding({ total: 0.3, amount_paid: 0.1 + 0.2 })).toBe(0);
  });

  it("liquidado é pago ou reembolsado", () => {
    expect(isSettled("paid")).toBe(true);
    expect(isSettled("refunded")).toBe(true);
    for (const s of ["pending", "awaiting_confirmation", "partially_paid", "failed", "", undefined]) expect(isSettled(s)).toBe(false);
  });

  it("Kz com espaço nos milhares, como a base de dados", () => {
    expect(kz(1500)).toBe("1 500 Kz");
    expect(kz(245000)).toBe("245 000 Kz");
    expect(kz(999)).toBe("999 Kz");
  });
});

describe("parseAmount", () => {
  it("lê o que se escreve em Angola", () => {
    expect(parseAmount("1500")).toBe(1500);
    expect(parseAmount("1 500")).toBe(1500);
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("1.500,50")).toBe(1500.5);
    expect(parseAmount("1500,5")).toBe(1500.5);
    expect(parseAmount("Kz 2 000")).toBe(2000);
    expect(parseAmount(2500.255)).toBe(2500.26);
  });

  it("recusa o que não é um valor positivo", () => {
    for (const v of ["", "abc", "0", "-100", "1,2,3", "1.5.0", null, undefined, Number.NaN, -5, 0]) expect(parseAmount(v)).toBeNaN();
  });
});

describe("customerNoticeFor", () => {
  it("pago pela primeira vez → Pagamento confirmado", () => {
    expect(customerNoticeFor("confirm", { previous_status: "awaiting_confirmation", payment_status: "paid", amount_paid: 100, outstanding: 0 })).toBe("paid");
    expect(customerNoticeFor("record", { previous_status: "pending", payment_status: "paid", amount_paid: 100, outstanding: 0 })).toBe("paid");
    expect(customerNoticeFor("record", { previous_status: "paid", payment_status: "paid", amount_paid: 200, outstanding: 0 })).toBe(null);
  });

  it("ainda falta → recebido em parte", () => {
    expect(customerNoticeFor("confirm", { previous_status: "awaiting_confirmation", payment_status: "partially_paid", amount_paid: 60, outstanding: 40 })).toBe("payment_partial");
    // Pago em parte e outra referência ainda por verificar: o estado é "a aguardar", mas entrou dinheiro.
    expect(customerNoticeFor("confirm", { previous_status: "awaiting_confirmation", payment_status: "awaiting_confirmation", amount_paid: 60, outstanding: 40 })).toBe("payment_partial");
  });

  it("cancelada não recebe 'vamos preparar'", () => {
    expect(customerNoticeFor("record", { previous_status: "pending", payment_status: "paid", amount_paid: 100, outstanding: 0, cancelled: true })).toBe(null);
  });

  it("rejeitado só avisa quando não há outra referência por verificar", () => {
    expect(customerNoticeFor("reject", { payment_status: "failed" })).toBe("payment_rejected");
    expect(customerNoticeFor("reject", { payment_status: "awaiting_confirmation" })).toBe(null);
  });

  it("reembolso avisa; indicar e anular não", () => {
    expect(customerNoticeFor("refund", { payment_status: "refunded" })).toBe("refunded");
    expect(customerNoticeFor("refund", { payment_status: "paid" })).toBe("refunded");
    expect(customerNoticeFor("report", { payment_status: "awaiting_confirmation" })).toBe(null);
    expect(customerNoticeFor("void", { payment_status: "pending" })).toBe(null);
  });
});

describe("staffNoteFor", () => {
  it("diz o que falta fazer", () => {
    expect(staffNoteFor({ cancelled: true, amount_paid: 5000, amount_refunded: 0 })).toMatch(/falta reembolsar 5 000 Kz/);
    expect(staffNoteFor({ overpaid: 500 })).toMatch(/Pago a mais: 500 Kz/);
    expect(staffNoteFor({ duplicates: [{ order_id: "x", order_number: "ENC-1", status: "reported" }] })).toMatch(/ENC-1/);
    expect(staffNoteFor({ payment_status: "paid", amount_paid: 100 })).toBe("");
  });
});

describe("deliveryNeedsPayment", () => {
  it("entregar com dinheiro por receber pede o pagamento", () => {
    expect(deliveryNeedsPayment({ payment_status: "pending", total: 245000, amount_paid: 0 })).toBe(true);
    expect(deliveryNeedsPayment({ payment_status: "partially_paid", total: 100, amount_paid: 60 })).toBe(true);
    expect(deliveryNeedsPayment({ payment_status: "paid", total: 100, amount_paid: 100 })).toBe(false);
    expect(deliveryNeedsPayment({ payment_status: "pending", total: 100, amount_paid: 0, status: "cancelled" })).toBe(false);
  });
});

describe("limite de encomendas por pagar", () => {
  const agora = Date.parse("2026-11-07T12:00:00Z");
  const dia = 24 * 3600_000;
  const enc = (over: Record<string, unknown> = {}) => ({ created: new Date(agora - dia).toISOString(), payment_status: "pending", status: "pending", delivery_status: "received", ...over });

  it("conta só as por pagar e em curso dos últimos 30 dias", () => {
    expect(isOpenUnpaid(enc(), agora)).toBe(true);
    expect(isOpenUnpaid(enc({ payment_status: "paid" }), agora)).toBe(false);
    expect(isOpenUnpaid(enc({ status: "cancelled" }), agora)).toBe(false);
    expect(isOpenUnpaid(enc({ delivery_status: "delivered" }), agora)).toBe(false);
    expect(isOpenUnpaid(enc({ created: new Date(agora - 40 * dia).toISOString() }), agora)).toBe(false);
  });

  it("chega ao limite; 0 é sem limite", () => {
    const tres = [enc(), enc({ payment_status: "failed" }), enc({ payment_status: "awaiting_confirmation" })];
    expect(unpaidLimitReached(tres, 3, agora)).toBe(true);
    expect(unpaidLimitReached(tres.slice(0, 2), 3, agora)).toBe(false);
    expect(unpaidLimitReached(tres, 0, agora)).toBe(false);
  });
});

describe("trackPaymentSummary", () => {
  it("o cliente vê o que indicou e porque foi recusado", () => {
    const order = { total: 11500, amount_paid: 0, amount_refunded: 0, payment_status: "failed" };
    const pays = [
      { kind: "payment", status: "rejected", source: "customer", reference: "A1", decision_reason: "Substituída pelo cliente por outra referência.", decided_at: "2026-11-07T10:00:00Z" },
      { kind: "payment", status: "rejected", source: "customer", reference: "B2", decision_reason: "Não aparece no extracto", decided_at: "2026-11-07T11:00:00Z" },
    ];
    expect(trackPaymentSummary(order, pays)).toMatchObject({ outstanding: 11500, rejected_reference: "B2", rejected_reason: "Não aparece no extracto", reported_reference: "" });
  });

  it("a aguardar: mostra a referência indicada", () => {
    const order = { total: 100, amount_paid: 0, payment_status: "awaiting_confirmation" };
    const pays = [{ kind: "payment", status: "reported", source: "customer", reference: "TRF-9", created: "2026-11-07T11:00:00Z" }];
    expect(trackPaymentSummary(order, pays)).toMatchObject({ reported_reference: "TRF-9", rejected_reason: "" });
  });
});
