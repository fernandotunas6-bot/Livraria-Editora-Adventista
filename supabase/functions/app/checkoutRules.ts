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

type OrderLike = {
  id?: string; status?: string; delivery_status?: string; payment_status?: string;
  payment_reference?: string; payment_method_code?: string; created?: string;
};

/**
 * Encomendas a cancelar por falta de pagamento: pagas antes do envio (o método está em
 * `upfrontCodes`), ainda pendentes e sem referência indicada, ainda não preparadas, e criadas há
 * mais de `days` dias. `days` 0 (o valor por omissão) desliga a regra: nada é cancelado.
 * Quem já indicou a referência fica de fora: espera pela equipa, não pelo relógio.
 */
export function unpaidOrdersToCancel<T extends OrderLike>(orders: T[], upfrontCodes: Set<string>, days: number, now = Date.now()): T[] {
  if (!(days > 0)) return [];
  const limit = now - days * 24 * 3600_000;
  return orders.filter((o) => {
    const created = new Date(String(o.created || "")).getTime();
    return o.status !== "cancelled"
      && ["received", "confirmed"].includes(o.delivery_status || "received")
      && (o.payment_status || "pending") === "pending"
      && !String(o.payment_reference || "").trim()
      && upfrontCodes.has(String(o.payment_method_code || ""))
      && Number.isFinite(created) && created < limit;
  });
}
