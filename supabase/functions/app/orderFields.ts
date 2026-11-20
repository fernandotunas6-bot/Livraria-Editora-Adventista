// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Leitura única dos campos repetidos das encomendas — a mesma regra que o site usa em
// app/web/src/lib/orderUtils.js (o orderFields.test.js confirma que as duas dizem o mesmo).
//
//  - Método de pagamento: `payment_method_code` + `payment_method_name` são os actuais;
//    `payment_method` é herdado (nas encomendas antigas é o código, nas novas fica vazio).
//  - Morada: `delivery_address_full` e os `delivery_*` (entrega), `pickup_store`
//    (levantamento); `address`/`city` são herdados e eram cópias destes.
// Os campos actuais vêm primeiro; os herdados só servem às encomendas antigas.

type Row = Record<string, any>;

/** Nomes dos dois métodos que existiam antes de `payment_method_name`. */
export const LEGACY_PAYMENT_LABELS: Record<string, string> = {
  entrega: "Pagamento na entrega",
  transferencia: "Transferência bancária",
};

export const paymentCode = (order: Row | null | undefined) =>
  String(order?.payment_method_code || order?.payment_method || "");

export function paymentLabel(order: Row | null | undefined): string {
  const code = paymentCode(order);
  return String(order?.payment_method_name || LEGACY_PAYMENT_LABELS[code] || code);
}

export const isPickupOrder = (order: Row | null | undefined) => String(order?.shipping_method || "") === "pickup";

/** Loja do levantamento; as encomendas antigas só a tinham em `address` ("Levantamento: …"). */
export function pickupStoreName(order: Row | null | undefined): string {
  if (!isPickupOrder(order)) return "";
  return String(order?.pickup_store || String(order?.address || "").replace(/^Levantamento:\s*/i, "") || "");
}

/** Morada de entrega numa linha; vazia nos levantamentos. */
export function deliveryAddressLine(order: Row | null | undefined): string {
  if (!order || isPickupOrder(order)) return "";
  if (order.delivery_address_full) return String(order.delivery_address_full);
  return [order.address, order.city].filter(Boolean).join(", ");
}
