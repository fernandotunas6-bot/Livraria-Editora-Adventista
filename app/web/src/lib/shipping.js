import { Truck, MapPin, Zap, Library } from 'lucide-react';

export const SHIPPING_METHODS = {
  delivery: {
    id: 'delivery',
    label: 'Entrega ao domicílio',
    description: 'Receba na sua morada',
    icon: Truck,
  },
  pickup: {
    id: 'pickup',
    label: 'Levantamento na loja',
    description: 'Grátis — recolha numa loja física',
    icon: MapPin,
  },
  express: {
    id: 'express',
    label: 'Entrega expressa',
    description: 'Prioridade — 24-48h em Luanda',
    icon: Zap,
  },
};

/**
 * Envio da encomenda só de edições digitais (migração edicoes_digitais). Não entra na lista de
 * escolha: o carrinho passa a ele sozinho quando só tem edições digitais.
 */
export const DIGITAL_SHIPPING = {
  id: 'digital',
  label: 'Edição digital (sem envio)',
  description: 'Fica na sua biblioteca quando o pagamento for confirmado',
  icon: Library,
};

/**
 * Valor numérico das definições: vazio ou inválido usa o valor por omissão; 0 é um valor válido.
 * Igual a `settingNumber` em supabase/functions/app/checkoutRules.ts. Com `Number(x) || 1500`,
 * pôr os portes a 0 no painel mostrava (e cobrava) 1500.
 */
export function settingNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Regras de portes em cêntimos, com as mesmas contas do `place_order`. */
export function shippingRules(settings = {}) {
  const freeThresholdCents = settingNumber(settings.shipping_free_threshold, 20000) * 100;
  const standardCents = settingNumber(settings.shipping_cost, 1500) * 100;
  // As definições guardam Kz, como os outros portes. O expresso por configurar (0) vale o dobro
  // da entrega normal, como no servidor. Antes o valor configurado entrava sem passar a cêntimos
  // e o carrinho mostrava 3000 Kz como 30 Kz.
  const expressKz = settingNumber(settings.shipping_express_cost, 0);
  const expressCents = expressKz > 0 ? expressKz * 100 : standardCents * 2;
  return { freeThresholdCents, standardCents, expressCents };
}

/**
 * Portes em cêntimos. `subtotalCents` é o do que se envia: as edições digitais não contam, nem
 * para os portes grátis (como o `place_order`).
 */
export function calcShippingCents(method, subtotalCents, settings = {}) {
  const { freeThresholdCents, standardCents, expressCents } = shippingRules(settings);
  if (method === 'pickup' || method === 'digital') return 0;
  if (method === 'express') return expressCents;
  if (subtotalCents >= freeThresholdCents) return 0;
  return standardCents;
}

export function getShippingLabel(method) {
  if (method === 'digital') return DIGITAL_SHIPPING.label;
  return SHIPPING_METHODS[method]?.label || 'Entrega';
}
