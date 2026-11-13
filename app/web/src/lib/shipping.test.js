import { describe, expect, it } from 'vitest';
import { calcShippingCents, settingNumber, shippingRules } from './shipping';
import { isPaidUpfront, paymentAllowedForShipping, paymentMethodsFor, paymentMoment } from './paymentMethods';

describe('shipping', () => {
  const base = { shipping_free_threshold: 20000, shipping_cost: 1500, shipping_express_cost: 0 };

  it('cobra a entrega normal abaixo do limiar e nada a partir dele', () => {
    expect(calcShippingCents('delivery', 1000000, base)).toBe(150000);
    expect(calcShippingCents('delivery', 2000000, base)).toBe(0);
    expect(calcShippingCents('pickup', 100, base)).toBe(0);
  });

  it('expresso por configurar vale o dobro da entrega normal, como no servidor', () => {
    expect(calcShippingCents('express', 100, base)).toBe(300000);
  });

  it('expresso configurado em Kz passa a cêntimos (3000 Kz não aparece como 30 Kz)', () => {
    expect(calcShippingCents('express', 100, { ...base, shipping_express_cost: 3000 })).toBe(300000);
    expect(calcShippingCents('express', 100, { ...base, shipping_express_cost: 4500 })).toBe(450000);
  });

  it('portes a 0 e limiar a 0 valem, em vez de cair nos valores por omissão', () => {
    expect(calcShippingCents('delivery', 100, { ...base, shipping_cost: 0 })).toBe(0);
    expect(calcShippingCents('delivery', 100, { ...base, shipping_free_threshold: 0 })).toBe(0);
    expect(shippingRules({ shipping_cost: 0 }).standardCents).toBe(0);
  });

  it('valores com cêntimos dão cêntimos inteiros (sem resto da vírgula flutuante)', () => {
    const regras = shippingRules({ shipping_free_threshold: 19999.99, shipping_cost: 2499.99, shipping_express_cost: 0.29 });
    expect(regras).toEqual({ freeThresholdCents: 1999999, standardCents: 249999, expressCents: 29 });
    // Um subtotal de exactamente 19 999,99 Kz já não paga portes.
    expect(calcShippingCents('delivery', 1999999, { shipping_free_threshold: 19999.99, shipping_cost: 1500 })).toBe(0);
  });

  it('definições vazias usam os valores por omissão', () => {
    expect(shippingRules({})).toEqual({ freeThresholdCents: 2000000, standardCents: 150000, expressCents: 300000 });
    expect(settingNumber('', 7)).toBe(7);
    expect(settingNumber('abc', 7)).toBe(7);
  });
});

describe('paymentMethods', () => {
  const metodos = [
    { code: 'entrega', type: 'offline' },
    { code: 'transferencia', type: 'transfer' },
    { code: 'balcao', type: 'offline', shipping_methods: ['pickup'] },
  ];

  it('"Pagar no Balcão" só aparece no levantamento', () => {
    expect(paymentMethodsFor(metodos, 'delivery').map((m) => m.code)).toEqual(['entrega', 'transferencia']);
    expect(paymentMethodsFor(metodos, 'pickup').map((m) => m.code)).toEqual(['entrega', 'transferencia', 'balcao']);
    expect(paymentAllowedForShipping({ shipping_methods: null }, 'express')).toBe(true);
  });

  it('diz ao cliente quando paga', () => {
    expect(isPaidUpfront('p2p')).toBe(true);
    expect(paymentMoment({ type: 'transfer' }, 'delivery')).toBe('paga depois de encomendar');
    expect(paymentMoment({ type: 'offline' }, 'delivery')).toBe('paga na entrega');
    expect(paymentMoment({ type: 'offline' }, 'pickup')).toBe('paga no levantamento');
  });
});
