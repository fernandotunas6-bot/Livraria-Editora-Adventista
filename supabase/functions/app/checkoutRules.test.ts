import { describe, expect, it } from "vitest";
import {
  cleanPaymentReference, isPaidUpfront, isPngSignature, paymentAllowedForShipping, paymentStatusChange,
  saleChannelFrom, settingNumber, successPath, unpaidOrdersToCancel,
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

describe("successPath", () => {
  it("fica só com o caminho e a busca, nunca com o domínio", () => {
    expect(successPath("https://livrariaadventista.com/success")).toBe("/success");
    expect(successPath("https://evil.com/success?x=1")).toBe("/success?x=1");
    expect(successPath("/success?order=ENC-1")).toBe("/success?order=ENC-1");
  });

  // O caso que passava: um `pathname` com `//` no início é um URL relativo ao protocolo, que o
  // browser abre noutro domínio. É o mesmo que o `safeInternalPath` do site recusa.
  it("colapsa as barras do início, para não sair do site", () => {
    expect(successPath("https://x.ao//evil.com")).toBe("/evil.com");
    expect(successPath("https://x.ao///evil.com/a")).toBe("/evil.com/a");
    expect(successPath("//evil.com/x")).toBe("/x");
    expect(successPath("/\\evil.com")).toBe("/");
    for (const v of ["https://x.ao//evil.com", "//evil.com", "/\\evil.com", "https://a.b//c//d"]) {
      expect(successPath(v).startsWith("//")).toBe(false);
    }
  });

  it("vazio, inválido ou de outro tipo dá /success", () => {
    expect(successPath("")).toBe("/success");
    expect(successPath("   ")).toBe("/success");
    expect(successPath(42)).toBe("/success");
    expect(successPath({ href: "https://evil.com" })).toBe("/success");
  });

  it("corta caminhos compridos", () => {
    expect(successPath("/" + "a".repeat(500)).length).toBe(200);
  });
});

describe("paymentStatusChange", () => {
  const encomenda = (payment_status: string, status = "pending") => ({ payment_status, status });

  it("pago numa encomenda activa avisa o cliente", () => {
    expect(paymentStatusChange(encomenda("pending"), "paid")).toEqual({ notify: "paid", note: "" });
    expect(paymentStatusChange(encomenda("awaiting_confirmation"), "paid")).toEqual({ notify: "paid", note: "" });
  });

  // O email de reembolso diz "Devolvemos o valor da sua encomenda": a quem nunca pagou, era falso.
  it("reembolso só de uma encomenda paga", () => {
    expect(paymentStatusChange(encomenda("paid"), "refunded")).toEqual({ notify: "refunded", note: "" });
    for (const antes of ["pending", "awaiting_confirmation", "failed"]) {
      const r = paymentStatusChange(encomenda(antes), "refunded");
      expect("error" in r && r.error).toMatch(/Só se reembolsa uma encomenda paga/);
    }
    // Sem estado gravado conta como pendente.
    expect("error" in paymentStatusChange({}, "refunded")).toBe(true);
  });

  // O email de pago diz "Vamos preparar a sua encomenda", e uma cancelada não pode ser reaberta.
  it("pago numa encomenda cancelada grava sem avisar, e deixa nota à equipa", () => {
    const r = paymentStatusChange(encomenda("pending", "cancelled"), "paid");
    expect(r).toEqual({ notify: null, note: expect.stringMatching(/Falta reembolsá-lo/) });
  });

  it("o mesmo estado não faz nada", () => {
    expect(paymentStatusChange(encomenda("paid"), "paid")).toEqual({ notify: null, note: "" });
    expect(paymentStatusChange(encomenda("refunded"), "refunded")).toEqual({ notify: null, note: "" });
  });

  it("os estados internos não avisam ninguém", () => {
    expect(paymentStatusChange(encomenda("paid"), "pending")).toEqual({ notify: null, note: "" });
    expect(paymentStatusChange(encomenda("pending"), "failed")).toEqual({ notify: null, note: "" });
    // Desfazer um reembolso marcado por engano é permitido: o email e o WhatsApp de "pago" têm
    // deduplicação (`order:paid:<id>`), por isso o cliente não recebe a confirmação duas vezes.
    expect(paymentStatusChange(encomenda("refunded"), "paid")).toEqual({ notify: "paid", note: "" });
  });
});
