// Webhook do gateway de pagamentos: assinatura e leitura do aviso. Testes em paymentWebhook.test.ts.
//
// Regra do dono (2026-11-07): um pagamento só fica confirmado pelo gateway, ou por um
// funcionário com "Confirmar pagamentos". O gateway avisa a loja em `POST /webhooks/pagamentos`
// com um JSON assinado; aqui verifica-se a assinatura e lê-se o aviso, sem tocar na base de dados
// (quem grava é public.order_payment_gateway, migração 20261107201500_gateway_de_pagamentos).
//
// Contrato (docs/PAGAMENTOS.md):
//   Cabeçalho `X-Signature: sha256=<hex>` — HMAC-SHA256 do corpo exacto, com o segredo
//   partilhado (PAYMENT_WEBHOOK_SECRET nos segredos da Edge Function). Aceita-se também o hex
//   sozinho e o mesmo valor em base64, que é como alguns gateways o mandam.
//   Corpo: { transaction_id, order_number, amount, status, paid_at?, reference? }
//   Um gateway com outro formato liga-se com um adaptador (ou um intermediário) que produza este.

type Row = Record<string, unknown>;

const enc = new TextEncoder();

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** Comparação em tempo constante (o tempo não diz quantos caracteres certos tem a assinatura). */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A assinatura do corpo, como o gateway a deve mandar (para os testes e para o painel). */
export async function signWebhookBody(raw: string, secret: string): Promise<string> {
  return `sha256=${toHex(await hmacSha256(secret, raw))}`;
}

/**
 * A assinatura confere com o corpo exacto? Sem segredo, ou sem assinatura, nunca confere.
 * Aceita `sha256=<hex>`, `<hex>` (maiúsculas ou minúsculas) e `<base64>`.
 */
export async function verifyWebhookSignature(raw: string, header: string | null | undefined, secret: string): Promise<boolean> {
  const given = String(header || "").trim();
  if (!secret || !given) return false;
  const mac = await hmacSha256(secret, String(raw ?? ""));
  const value = given.replace(/^sha256=/i, "").trim();
  const hex = toHex(mac);
  return sameText(value.toLowerCase(), hex) || sameText(value, toBase64(mac));
}

/** Valor do aviso: número, ou texto como "11500.00" / "11 500,00". NaN se não for positivo. */
function amountOf(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : NaN;
  let s = String(value ?? "").replace(/kz|aoa/gi, "").replace(/[\s  ]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const n = Number(s);
  return n > 0 ? Math.round(n * 100) / 100 : NaN;
}

export type GatewayEvent = {
  transactionId: string;
  orderRef: string;
  amount: number;
  status: string;
  paidAt: string | null;
  reference: string;
};

const pick = (body: Row, keys: string[]) => {
  for (const k of keys) {
    const v = body[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

/**
 * Lê o aviso do gateway no formato do contrato. Aceita os nomes mais comuns dos campos
 * (transaction_id / id, order_number / merchant_reference…), para um gateway que já os mande
 * assim não precisar de adaptador.
 */
export function parseGatewayEvent(body: Row | null | undefined): GatewayEvent | { error: string } {
  const b = body && typeof body === "object" ? body : {};
  const transactionId = pick(b, ["transaction_id", "transactionId", "payment_id", "id"]).slice(0, 120);
  const orderRef = pick(b, ["order_number", "orderNumber", "order_reference", "merchant_reference", "order_id", "orderId"]).slice(0, 80);
  const amount = amountOf(b.amount ?? b.value ?? b.total);
  const status = (pick(b, ["status", "state", "payment_status"]) || "paid").toLowerCase().slice(0, 40);
  const when = pick(b, ["paid_at", "paidAt", "datetime", "date", "created_at"]);
  const t = when ? Date.parse(when) : NaN;
  const reference = pick(b, ["reference", "payment_reference", "reference_id"]).slice(0, 120);
  if (!transactionId) return { error: "transaction_id em falta." };
  if (!orderRef) return { error: "order_number em falta." };
  if (!Number.isFinite(amount)) return { error: "amount inválido." };
  return { transactionId, orderRef, amount, status, paidAt: Number.isFinite(t) ? new Date(t).toISOString() : null, reference };
}

/** O fornecedor como fica gravado: letras, algarismos e _ (o mesmo que a base de dados aceita). */
export const providerCode = (value: unknown) => String(value || "generico").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30) || "generico";
