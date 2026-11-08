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

/** Pago antes do envio (transferência, Multicaixa Express): a referência pode vir depois da encomenda. */
export const isPaidUpfront = (type: unknown) => type === "p2p" || type === "transfer";

/** Os envios que o checkout aceita; 'digital' é a encomenda só de edições digitais (sem envio). */
export const SHIPPING_METHODS: readonly string[] = ["delivery", "express", "pickup", "digital"];

/**
 * O método de pagamento serve para este envio?
 *
 * - Com lista ("Disponível para" em Pagamentos), só os envios indicados.
 * - Sem lista, serve para as entregas e o levantamento. Para a edição digital (sem envio), só os
 *   que se pagam antes — transferência, Multicaixa Express — ou pelo gateway: "pagar na entrega"
 *   não tem entrega, e o livro só abre com o pagamento confirmado. Pagar no balcão por um livro
 *   digital é possível, mas só com 'digital' marcado nesse método.
 */
export function paymentAllowedForShipping(
  method: { shipping_methods?: unknown; type?: unknown; gateway_provider?: unknown } | null | undefined,
  shipping: string,
): boolean {
  const list = Array.isArray(method?.shipping_methods)
    ? (method!.shipping_methods as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  if (list.length) return list.includes(shipping);
  if (shipping === "digital") return isPaidUpfront(method?.type) || !!String(method?.gateway_provider ?? "").trim();
  return true;
}

/** Como o cliente lê o envio, nas mensagens do checkout. */
export function shippingPhrase(shipping: string): string {
  if (shipping === "pickup") return "levantamento na loja";
  if (shipping === "digital") return "a edição digital";
  if (shipping === "express") return "entrega expressa";
  return "entrega ao domicílio";
}

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
  payment_reference?: string; payment_method_code?: string; created?: string; updated?: string;
  amount_paid?: number | string;
};

/**
 * Encomendas a cancelar por falta de pagamento: pagas antes do envio (o método está em
 * `upfrontCodes`), sem nada pago, ainda não preparadas, e paradas há mais de `days` dias. `days`
 * 0 (o valor por omissão) desliga a regra: nada é cancelado.
 *
 * - Pendente e sem referência: conta desde a encomenda.
 * - Pagamento rejeitado pela equipa (`failed`) e nenhum outro indicado: conta desde a rejeição
 *   (`updated`), para o cliente ter o mesmo prazo para indicar a referência certa.
 * - Quem tem uma referência por verificar, ou já pagou uma parte, fica de fora: espera pela
 *   equipa, não pelo relógio.
 */
export function unpaidOrdersToCancel<T extends OrderLike>(orders: T[], upfrontCodes: Set<string>, days: number, now = Date.now()): T[] {
  if (!(days > 0)) return [];
  const limit = now - days * 24 * 3600_000;
  return orders.filter((o) => {
    const status = o.payment_status || "pending";
    const since = new Date(String((status === "failed" ? o.updated || o.created : o.created) || "")).getTime();
    return o.status !== "cancelled"
      && ["received", "confirmed"].includes(o.delivery_status || "received")
      && (status === "pending" || status === "failed")
      && !(Number(o.amount_paid) > 0)
      && !String(o.payment_reference || "").trim()
      && upfrontCodes.has(String(o.payment_method_code || ""))
      && Number.isFinite(since) && since < limit;
  });
}

/**
 * Caminho para onde o site volta depois do checkout. Só o caminho, nunca outro domínio: o
 * valor vem do browser e volta no `url` da resposta.
 *
 * O `pathname` de um URL pode começar por `//` — `https://x.ao//evil.com` dá `//evil.com` —, e
 * um caminho assim é um URL relativo ao protocolo, que o browser abre noutro domínio. As barras
 * do início colapsam numa só, como o `safeInternalPath` faz no site (`lib/authSession.js`).
 */
export function successPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "/success";
  try {
    const u = new URL(value.trim(), "https://loja.invalid");
    const path = (u.pathname + u.search).replace(/^[/\\]+/, "/");
    return path.slice(0, 200) || "/success";
  } catch {
    return "/success";
  }
}
