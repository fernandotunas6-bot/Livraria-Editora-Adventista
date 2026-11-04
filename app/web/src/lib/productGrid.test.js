import { describe, expect, it } from 'vitest';
import { PRODUCT_GRID_CLASS, SHOP_DENSITY_OPTIONS, discountPercent, shopDensityClass } from './productGrid';

describe('grelha única', () => {
  it('duas colunas no telemóvel e cinco no desktop largo, com espaços compactos', () => {
    for (const c of ['product-grid', 'grid-cols-2', 'sm:grid-cols-3', 'lg:grid-cols-4', 'xl:grid-cols-5', 'gap-x-3'])
      expect(PRODUCT_GRID_CLASS.split(' ')).toContain(c);
  });

  it('a densidade da loja aplica-se à grelha (e o valor antigo 4 = cinco colunas)', () => {
    expect(shopDensityClass(2)).toBe('xl:[&_.product-grid]:grid-cols-3');
    expect(shopDensityClass(3)).toBe('xl:[&_.product-grid]:grid-cols-4');
    expect(shopDensityClass(4)).toBe('');
    expect(shopDensityClass('lixo')).toBe('');
    expect(SHOP_DENSITY_OPTIONS.map((o) => o.columns)).toEqual([3, 4, 5]);
  });
});

describe('discountPercent', () => {
  it('só com promoção real e menor do que o preço', () => {
    expect(discountPercent({ price_in_cents: 2000000, sale_price_in_cents: 1500000 })).toBe(25);
    expect(discountPercent({ price_in_cents: 2000000, sale_price_in_cents: null })).toBe(0);
    expect(discountPercent({ price_in_cents: 2000000, sale_price_in_cents: 2500000 })).toBe(0);
    expect(discountPercent({ price_in_cents: 0, sale_price_in_cents: 10 })).toBe(0);
    expect(discountPercent(undefined)).toBe(0);
  });
});
