// Regras do checkout que não dependem da base de dados. Testes em checkoutRules.test.ts.

/**
 * Valor numérico das definições. Vazio ou inválido usa o valor por omissão; 0 é um valor válido.
 * Com `Number(x) || 1500`, pôr os portes a 0 (grátis) no painel cobrava 1500.
 */
export function settingNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Canais de venda que o site pode declarar. Outro valor conta como compra online. */
export const SALE_CHANNELS: readonly string[] = ["web_purchase", "whatsapp"];

export function saleChannelFrom(value: unknown): string {
  const channel = String(value ?? "").trim();
  return SALE_CHANNELS.includes(channel) ? channel : "web_purchase";
}

/** O método de pagamento serve para este envio? Sem lista (ou lista vazia) serve para todos. */
export function paymentAllowedForShipping(method: { shipping_methods?: unknown } | null | undefined, shipping: string): boolean {
  const list = Array.isArray(method?.shipping_methods)
    ? (method!.shipping_methods as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  return list.length === 0 || list.includes(shipping);
}

/** Pago antes do envio (transferência, Multicaixa Express): a referência pode vir depois da encomenda. */
export const isPaidUpfront = (type: unknown) => type === "p2p" || type === "transfer";

/** Assinatura desenhada no site: imagem PNG em data URL, até `maxLength` caracteres. */
export function isPngSignature(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.startsWith("data:image/png;base64,") && value.length <= maxLength;
}

/** Referência de pagamento escrita pelo cliente: uma linha, até 120 caracteres. */
export function cleanPaymentReference(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}
