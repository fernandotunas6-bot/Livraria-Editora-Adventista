import { describe, expect, it } from "vitest";
import { cleanCancelReason, customerCancelBlock } from "./customerCancel.ts";
import { customerCancelBlock as siteBlock } from "../../../app/web/src/lib/customerOrders.js";

const base = { status: "pending", delivery_status: "received", payment_status: "pending", amount_paid: 0 };

describe("customerCancelBlock", () => {
  it("encomenda nova por pagar: pode cancelar", () => {
    expect(customerCancelBlock(base)).toBeNull();
    expect(customerCancelBlock({ ...base, status: "confirmed", delivery_status: "confirmed" })).toBeNull();
    expect(customerCancelBlock({ ...base, payment_status: "failed" })).toBeNull();
    // Encomendas antigas sem estado de entrega gravado.
    expect(customerCancelBlock({ ...base, delivery_status: null, payment_status: null })).toBeNull();
  });

  it("recusa com o motivo certo", () => {
    expect(customerCancelBlock({ ...base, status: "cancelled" })).toMatch(/já está cancelada/);
    expect(customerCancelBlock({ ...base, delivery_status: "delivered" })).toMatch(/já foi entregue/);
    expect(customerCancelBlock({ ...base, amount_paid: "1000.00" })).toMatch(/pagamento registado/);
    expect(customerCancelBlock({ ...base, payment_status: "paid" })).toMatch(/pagamento registado/);
    expect(customerCancelBlock({ ...base, payment_status: "awaiting_confirmation" })).toMatch(/Indicou um pagamento/);
    for (const d of ["preparing", "processing", "shipped", "in_transit", "out_for_delivery"]) {
      expect(customerCancelBlock({ ...base, delivery_status: d })).toMatch(/a ser preparada ou a caminho/);
    }
    expect(customerCancelBlock({ ...base, status: "shipped" })).toMatch(/a ser preparada ou a caminho/);
    expect(customerCancelBlock(null)).toMatch(/não encontrada/);
  });

  it("o site e a função dizem o mesmo em todas as combinações", () => {
    const statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled", ""];
    const deliveries = ["received", "confirmed", "preparing", "shipped", "in_transit", "out_for_delivery", "delivered", "cancelled", ""];
    const payments = ["pending", "awaiting_confirmation", "partially_paid", "paid", "failed", "refunded", ""];
    for (const status of statuses) for (const delivery_status of deliveries) for (const payment_status of payments) {
      for (const amount_paid of [0, 500]) {
        const order = { status, delivery_status, payment_status, amount_paid };
        expect(siteBlock(order), JSON.stringify(order)).toBe(customerCancelBlock(order));
      }
    }
  });
});

describe("cleanCancelReason", () => {
  it("uma linha, sem espaços a mais, até 300 caracteres", () => {
    expect(cleanCancelReason("  Enganei-me\n\nna   morada ")).toBe("Enganei-me na morada");
    expect(cleanCancelReason(undefined)).toBe("");
    expect(cleanCancelReason("x".repeat(400))).toHaveLength(300);
  });
});
