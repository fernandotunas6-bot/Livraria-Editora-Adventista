import { describe, expect, it } from 'vitest';
import { kwanza } from '@/lib/money';
import { formatCurrency } from '@/api/EcommerceApi';

describe('kwanza', () => {
  it('é o formato da loja (formatCurrency), a partir de kwanzas', () => {
    for (const v of [0, 1, 7500, 14500, 68900, 1234567.891, 0.005]) {
      expect(kwanza(v)).toBe(formatCurrency(Math.round(v * 100)));
    }
  });

  it('nunca mais de duas casas decimais (o "Ticket Médio" saía com três)', () => {
    expect(kwanza(14316.667)).toBe(formatCurrency(1431667));
    expect(kwanza(14316.667)).toMatch(/,67$/);
  });

  it('aceita texto da base de dados e valores vazios', () => {
    expect(kwanza('7500.00')).toBe(formatCurrency(750000));
    expect(kwanza(null)).toBe(formatCurrency(0));
    expect(kwanza('abc')).toBe(formatCurrency(0));
  });
});
