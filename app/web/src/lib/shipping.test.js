import { describe, expect, it } from 'vitest';
import { calcShippingCents } from './shipping';

describe('calcShippingCents', () => {
  const settings = { shipping_free_threshold: 20000, shipping_cost: 1500, shipping_express_cost: 3000 };

  it('a expressa definida no painel (em Kz) sai em cêntimos, como as outras', () => {
    expect(calcShippingCents('express', 0, settings)).toBe(300000);
  });

  it('sem expressa definida, o dobro da normal (como o place_order)', () => {
    expect(calcShippingCents('express', 0, { shipping_cost: 1500 })).toBe(300000);
    expect(calcShippingCents('express', 0, { shipping_cost: 1500, shipping_express_cost: 0 })).toBe(300000);
  });

  it('normal, grátis acima do limite, e levantamento grátis', () => {
    expect(calcShippingCents('delivery', 1000000, settings)).toBe(150000);
    expect(calcShippingCents('delivery', 2000000, settings)).toBe(0);
    expect(calcShippingCents('pickup', 0, settings)).toBe(0);
  });
});
