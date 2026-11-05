export const ORDER_STATUS = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-700' },
  confirmed: { label: 'Confirmada', color: 'bg-blue-500/10 text-blue-700' },
  shipped: { label: 'Enviada', color: 'bg-[#0ea5c9]/10 text-[#0ea5c9]' },
  cancelled: { label: 'Cancelada', color: 'bg-destructive/10 text-destructive' },
};

export const PAYMENT_METHODS = {
  entrega: 'Pagamento na entrega',
  transferencia: 'Transferência bancária',
};

export const PAYMENT_STATUS = {
  pending: { label: 'Pendente', color: 'bg-amber-500/10 text-amber-700' },
  awaiting_confirmation: { label: 'Aguarda confirmação', color: 'bg-orange-500/10 text-orange-700' },
  paid: { label: 'Pago', color: 'bg-green-500/10 text-green-700' },
  failed: { label: 'Falhou', color: 'bg-destructive/10 text-destructive' },
  refunded: { label: 'Reembolsado', color: 'bg-violet-500/10 text-violet-700' },
};

export const DELIVERY_STATUS = {
  received: { label: 'Recebida', color: 'bg-slate-500/10 text-slate-700' },
  confirmed: { label: 'Confirmada', color: 'bg-blue-500/10 text-blue-700' },
  preparing: { label: 'A preparar', color: 'bg-indigo-500/10 text-indigo-700' },
  shipped: { label: 'Enviada', color: 'bg-[#0ea5c9]/10 text-[#0ea5c9]' },
  in_transit: { label: 'Em trânsito', color: 'bg-[#0ea5c9]/10 text-[#0ea5c9]' },
  out_for_delivery: { label: 'Saiu para entrega', color: 'bg-amber-500/10 text-amber-700' },
  delivered: { label: 'Entregue', color: 'bg-green-500/10 text-green-700' },
  cancelled: { label: 'Cancelada', color: 'bg-destructive/10 text-destructive' },
};

export function getPaymentStatusLabel(status) {
  return PAYMENT_STATUS[status]?.label || status || '—';
}

export function getPaymentStatusColor(status) {
  return PAYMENT_STATUS[status]?.color || 'bg-muted text-muted-foreground';
}

// --- Campos repetidos das encomendas ----------------------------------------------------
// Por razões históricas, as encomendas guardam o mesmo facto em mais do que uma coluna:
//  - método de pagamento: `payment_method_code` + `payment_method_name` (os actuais) e
//    `payment_method` (herdado: nas encomendas antigas é o código, nas novas fica vazio);
//  - morada: `delivery_address_full` e os `delivery_*` (entrega), `pickup_store`
//    (levantamento), e `address`/`city` (herdados, cópias destes).
// Cada ecrã lia-os por uma ordem diferente — o recibo mostrava o nome do método e a
// exportação o código; o painel repetia a loja dos levantamentos. Ler só por estas funções,
// que dão os campos actuais primeiro e os herdados às encomendas antigas.
// A Edge Function segue a mesma regra (supabase/functions/app/orderFields.ts), e o
// orderFields.test.js confirma que as duas dizem o mesmo.

/** Código do método de pagamento ('entrega', 'transferencia', 'balcao'…). */
export function orderPaymentCode(order) {
  return String(order?.payment_method_code || order?.payment_method || '');
}

/** Nome do método de pagamento, como o cliente o viu no checkout. */
export function orderPaymentLabel(order) {
  const code = orderPaymentCode(order);
  return String(order?.payment_method_name || PAYMENT_METHODS[code] || code);
}

export const isPickupOrder = (order) => String(order?.shipping_method || '') === 'pickup';

/** Loja do levantamento. As encomendas antigas só a tinham em `address` ("Levantamento: …"). */
export function orderPickupStore(order) {
  if (!isPickupOrder(order)) return '';
  return String(order?.pickup_store || String(order?.address || '').replace(/^Levantamento:\s*/i, '') || '');
}

/** Morada de entrega numa linha; vazia nos levantamentos. */
export function orderDeliveryAddress(order) {
  if (!order || isPickupOrder(order)) return '';
  if (order.delivery_address_full) return String(order.delivery_address_full);
  return [order.address, order.city].filter(Boolean).join(', ');
}

/** Bairro, município e província escolhidos no checkout. */
export function orderLocality(order, separator = ' · ') {
  return [order?.delivery_locality, order?.delivery_municipality, order?.delivery_province].filter(Boolean).join(separator);
}

export function getPaymentMethodLabel(code, methodsMap = PAYMENT_METHODS) {
  return methodsMap[code] || code || '—';
}

export function getOrderStatusLabel(status) {
  return ORDER_STATUS[status]?.label || status;
}

export function getOrderStatusColor(status) {
  return ORDER_STATUS[status]?.color || 'bg-muted text-muted-foreground';
}

export function getDeliveryStatusLabel(status) {
  return DELIVERY_STATUS[status]?.label || status || '—';
}

export function getDeliveryStatusColor(status) {
  return DELIVERY_STATUS[status]?.color || 'bg-muted text-muted-foreground';
}

export function formatOrderNumber(order) {
  return order?.order_number || `#${order?.id?.slice(0, 8).toUpperCase()}`;
}
