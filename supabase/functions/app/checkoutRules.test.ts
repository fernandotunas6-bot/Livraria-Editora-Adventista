import { describe, expect, it } from "vitest";
import {
  cleanPaymentReference, isPaidUpfront, isPngSignature, paymentAllowedForShipping, saleChannelFrom, settingNumber,
  unpaidOrdersToCancel,
} from "./checkoutRules.ts";

describe("settingNumber", () => {
  it("aceita 0 (portes grátis) em vez de cair no valor por omissão", () => {
    expect(settingNumber(0, 1500)).toBe(0);
    expect(settingNumber("0", 1500)).toBe(0);
  });
  it("usa o valor por omissão quando vazio ou inválido", () => {
    expect(settingNumber(null, 1500)).toBe(1500);
    expect(settingNumber(undefined, 1500)).toBe(1500);
    expect(settingNumber("", 1500)).toBe(1500);
    expect(settingNumber("abc", 1500)).toBe(1500);
    expect(settingNumber(-10, 1500)).toBe(1500);
  });
  it("mantém valores configurados", () => {
    expect(settingNumber(2500, 1500)).toBe(2500);
    expect(settingNumber("30000", 20000)).toBe(30000);
  });
});

describe("saleChannelFrom", () => {
  it("só aceita os canais conhecidos", () => {
    expect(saleChannelFrom("whatsapp")).toBe("whatsapp");
    expect(saleChannelFrom("web_purchase")).toBe("web_purchase");
    expect(saleChannelFrom("loja_huambo")).toBe("web_purchase");
    expect(saleChannelFrom(undefined)).toBe("web_purchase");
  });
});

describe("paymentAllowedForShipping", () => {
  it("sem lista serve para todos os envios", () => {
    expect(paymentAllowedForShipping({ shipping_methods: null }, "delivery")).toBe(true);
    expect(paymentAllowedForShipping({}, "express")).toBe(true);
    expect(paymentAllowedForShipping({ shipping_methods: [] }, "pickup")).toBe(true);
    expect(paymentAllowedForShipping(null, "pickup")).toBe(true);
  });
  it("com lista, só os envios indicados", () => {
    const balcao = { shipping_methods: ["pickup"] };
    expect(paymentAllowedForShipping(balcao, "pickup")).toBe(true);
    expect(paymentAllowedForShipping(balcao, "delivery")).toBe(false);
    expect(paymentAllowedForShipping(balcao, "express")).toBe(false);
  });
});

describe("isPaidUpfront", () => {
  it("transferência e P2P são pagos antes do envio", () => {
    expect(isPaidUpfront("transfer")).toBe(true);
    expect(isPaidUpfront("p2p")).toBe(true);
    expect(isPaidUpfront("offline")).toBe(false);
    expect(isPaidUpfront(undefined)).toBe(false);
  });
});

describe("isPngSignature", () => {
  it("aceita PNG dentro do limite e recusa SVG, outros tipos e excessos", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(isPngSignature(png, 1000)).toBe(true);
    expect(isPngSignature("data:image/svg+xml;base64,PHN2Zz4=", 1000)).toBe(false);
    expect(isPngSignature("data:text/html,<script>", 1000)).toBe(false);
    expect(isPngSignature(png + "A".repeat(2000), 1000)).toBe(false);
    expect(isPngSignature(42, 1000)).toBe(false);
  });
});

describe("cleanPaymentReference", () => {
  it("fica numa linha, sem espaços a mais, até 120 caracteres", () => {
    expect(cleanPaymentReference("  REF  123\n456 ")).toBe("REF 123 456");
    expect(cleanPaymentReference("x".repeat(200))).toHaveLength(120);
    expect(cleanPaymentReference(null)).toBe("");
  });
});

describe("unpaidOrdersToCancel", () => {
  const agora = Date.parse("2026-11-10T12:00:00Z");
  const dia = 24 * 3600_000;
  const base = {
    status: "pending", delivery_status: "received", payment_status: "pending", payment_reference: "",
    payment_method_code: "transferencia", created: new Date(agora - 4 * dia).toISOString(),
  };
  const upfront = new Set(["transferencia", "multicaixa"]);

  it("com 0 dias não cancela nada", () => {
    expect(unpaidOrdersToCancel([{ ...base, id: "a" }], upfront, 0, agora)).toEqual([]);
  });
  it("cancela a transferência por pagar mais velha que o prazo", () => {
    expect(unpaidOrdersToCancel([{ ...base, id: "a" }], upfront, 3, agora).map((o) => o.id)).toEqual(["a"]);
  });
  it("não cancela dentro do prazo, com referência, já paga, a pagar na entrega, preparada ou cancelada", () => {
    const fora = [
      { ...base, id: "novo", created: new Date(agora - 1 * dia).toISOString() },
      { ...base, id: "com-ref", payment_reference: "REF123" },
      { ...base, id: "a-confirmar", payment_status: "awaiting_confirmation" },
      { ...base, id: "paga", payment_status: "paid" },
      { ...base, id: "na-entrega", payment_method_code: "entrega" },
      { ...base, id: "preparada", delivery_status: "preparing" },
      { ...base, id: "cancelada", status: "cancelled" },
      { ...base, id: "sem-data", created: "" },
    ];
    expect(unpaidOrdersToCancel(fora, upfront, 3, agora)).toEqual([]);
  });
});
