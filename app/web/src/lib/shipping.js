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

export function calcShippingCents(method, subtotalCents, settings = {}) {
  const freeThreshold = (Number(settings.shipping_free_threshold) || 20000) * 100;
  const standardCost = (Number(settings.shipping_cost) || 1500) * 100;
  // O painel guarda kwanzas; aqui tudo é em cêntimos. Sem o ×100, 3000 Kz apareciam no
  // carrinho como 30 Kz, e o servidor (place_order) cobrava 3000. Sem valor, o dobro da normal,
  // a mesma regra do place_order.
  const expressCost = (Number(settings.shipping_express_cost) > 0
    ? Number(settings.shipping_express_cost) * 100
    : standardCost * 2);

  if (method === 'pickup') return 0;
  if (method === 'express') return expressCost;
  if (subtotalCents >= freeThreshold) return 0;
  return standardCost;
}

export function getShippingLabel(method) {
  return SHIPPING_METHODS[method]?.label || 'Entrega';
}
