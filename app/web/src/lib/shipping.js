import { Truck, MapPin, Zap } from 'lucide-react';

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

export function calcShippingCents(method, subtotalCents, settings = {}) {
  const { freeThresholdCents, standardCents, expressCents } = shippingRules(settings);
  if (method === 'pickup') return 0;
  if (method === 'express') return expressCents;
  if (subtotalCents >= freeThresholdCents) return 0;
  return standardCents;
}

export function getShippingLabel(method) {
  return SHIPPING_METHODS[method]?.label || 'Entrega';
}
