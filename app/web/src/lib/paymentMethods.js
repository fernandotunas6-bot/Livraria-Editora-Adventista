// Métodos de pagamento no checkout. As regras são as do servidor
// (supabase/functions/app/checkoutRules.ts): mudar um lado obriga a mudar o outro.

/** Pago antes do envio (transferência, Multicaixa Express): paga-se depois de encomendar. */
export const isPaidUpfront = (type) => type === 'p2p' || type === 'transfer';

/** O método serve para este envio? Sem lista serve para todos ("Pagar no Balcão" só no levantamento). */
export function paymentAllowedForShipping(method, shippingMethod) {
  const list = Array.isArray(method?.shipping_methods) ? method.shipping_methods : [];
  return list.length === 0 || list.includes(shippingMethod);
}

/** Métodos que o cliente pode escolher para o envio escolhido. */
export const paymentMethodsFor = (methods, shippingMethod) =>
  (methods || []).filter((m) => paymentAllowedForShipping(m, shippingMethod));

/** Quando o pagamento se faz, dito ao cliente (e não "p2p"/"offline"). */
export function paymentMoment(method, shippingMethod) {
  if (isPaidUpfront(method?.type)) return 'paga depois de encomendar';
  return shippingMethod === 'pickup' ? 'paga no levantamento' : 'paga na entrega';
}
