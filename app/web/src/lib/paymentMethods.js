// Métodos de pagamento no checkout. As regras são as do servidor
// (supabase/functions/app/checkoutRules.ts): mudar um lado obriga a mudar o outro.

/** Pago antes do envio (transferência, Multicaixa Express): paga-se depois de encomendar. */
export const isPaidUpfront = (type) => type === 'p2p' || type === 'transfer';

/**
 * O método serve para este envio? Com lista ("Disponível para"), só os indicados ("Pagar no Balcão"
 * só no levantamento). Sem lista, as entregas e o levantamento; a edição digital (sem envio) só
 * com o que se paga antes ou pelo gateway — "pagar na entrega" não tem entrega.
 */
export function paymentAllowedForShipping(method, shippingMethod) {
  const list = Array.isArray(method?.shipping_methods) ? method.shipping_methods : [];
  if (list.length) return list.includes(shippingMethod);
  if (shippingMethod === 'digital') return isPaidUpfront(method?.type) || !!String(method?.gateway_provider ?? '').trim() || !!method?.automatic;
  return true;
}

/** Métodos que o cliente pode escolher para o envio escolhido. */
export const paymentMethodsFor = (methods, shippingMethod) =>
  (methods || []).filter((m) => paymentAllowedForShipping(m, shippingMethod));

/** Quando o pagamento se faz, dito ao cliente (e não "p2p"/"offline"). */
export function paymentMoment(method, shippingMethod) {
  if (isPaidUpfront(method?.type) || (shippingMethod === 'digital' && method?.automatic)) return 'paga depois de encomendar';
  if (shippingMethod === 'digital') return 'paga na loja';
  return shippingMethod === 'pickup' ? 'paga no levantamento' : 'paga na entrega';
}
