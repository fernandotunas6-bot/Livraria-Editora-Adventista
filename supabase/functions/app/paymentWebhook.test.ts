// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseGatewayEvent, providerCode, signWebhookBody, verifyWebhookSignature } from "./paymentWebhook.ts";

const SEGREDO = "segredo-de-teste";
const CORPO = JSON.stringify({ transaction_id: "TX-1", order_number: "ENC-ABC123", amount: 11500, status: "paid" });

describe("assinatura do webhook", () => {
  it("confere com o corpo exacto", async () => {
    const sig = await signWebhookBody(CORPO, SEGREDO);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(await verifyWebhookSignature(CORPO, sig, SEGREDO)).toBe(true);
    // Só o hex, em maiúsculas: alguns gateways mandam-no assim.
    expect(await verifyWebhookSignature(CORPO, sig.slice(7).toUpperCase(), SEGREDO)).toBe(true);
  });

  it("aceita o mesmo valor em base64", async () => {
    const hex = (await signWebhookBody(CORPO, SEGREDO)).slice(7);
    const b64 = btoa(String.fromCharCode(...hex.match(/../g)!.map((h) => parseInt(h, 16))));
    expect(await verifyWebhookSignature(CORPO, b64, SEGREDO)).toBe(true);
  });

  it("recusa corpo mexido, segredo errado, assinatura vazia ou sem segredo", async () => {
    const sig = await signWebhookBody(CORPO, SEGREDO);
    expect(await verifyWebhookSignature(CORPO.replace("11500", "1"), sig, SEGREDO)).toBe(false);
    expect(await verifyWebhookSignature(CORPO, sig, "outro")).toBe(false);
    expect(await verifyWebhookSignature(CORPO, "", SEGREDO)).toBe(false);
    expect(await verifyWebhookSignature(CORPO, sig, "")).toBe(false);
    expect(await verifyWebhookSignature(CORPO, "sha256=abc", SEGREDO)).toBe(false);
  });
});

describe("parseGatewayEvent", () => {
  it("lê o contrato", () => {
    expect(parseGatewayEvent({ transaction_id: "TX-1", order_number: "ENC-1", amount: "11 500,00", status: "PAID", paid_at: "2026-11-07T20:00:00Z", reference: "MCX 1" }))
      .toEqual({ transactionId: "TX-1", orderRef: "ENC-1", amount: 11500, status: "paid", paidAt: "2026-11-07T20:00:00.000Z", reference: "MCX 1" });
  });

  it("aceita os nomes comuns dos campos e o estado por omissão", () => {
    const e = parseGatewayEvent({ id: 77, merchant_reference: "ENC-2", amount: 3000 });
    expect(e).toMatchObject({ transactionId: "77", orderRef: "ENC-2", amount: 3000, status: "paid", paidAt: null });
  });

  it("diz o que falta", () => {
    expect(parseGatewayEvent({ order_number: "ENC-1", amount: 1 })).toEqual({ error: "transaction_id em falta." });
    expect(parseGatewayEvent({ transaction_id: "T", amount: 1 })).toEqual({ error: "order_number em falta." });
    expect(parseGatewayEvent({ transaction_id: "T", order_number: "E", amount: "abc" })).toEqual({ error: "amount inválido." });
    expect(parseGatewayEvent(null)).toEqual({ error: "transaction_id em falta." });
  });

  it("fornecedor só com letras, algarismos e _", () => {
    expect(providerCode("ProxyPay")).toBe("proxypay");
    expect(providerCode("emis-gpo")).toBe("emisgpo");
    expect(providerCode("")).toBe("generico");
  });
});
