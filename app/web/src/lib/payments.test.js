import { describe, expect, it } from 'vitest';
import * as site from './payments';
import * as servidor from '../../../../supabase/functions/app/payments.ts';

// A mesma leitura dos dois lados: o painel mostra o que a Edge Function decide.
const CASOS = [
  { total: 11500, amount_paid: 0, amount_refunded: 0, payment_status: 'pending' },
  { total: 11500, amount_paid: 6000, amount_refunded: 0, payment_status: 'partially_paid' },
  { total: 11500, amount_paid: 11500, amount_refunded: 0, payment_status: 'paid' },
  { total: 11500, amount_paid: 12000, amount_refunded: 0, payment_status: 'paid' },
  { total: 11500, amount_paid: 11500, amount_refunded: 11500, payment_status: 'refunded' },
  { total: 11500, amount_paid: 11500, amount_refunded: 2000, payment_status: 'paid', status: 'cancelled' },
  { total: 245000, amount_paid: 0, amount_refunded: 0, payment_status: 'awaiting_confirmation', delivery_status: 'delivered' },
  { total: 0.3, amount_paid: 0.1 + 0.2, amount_refunded: 0, payment_status: 'paid' },
  { total: 5000, amount_paid: 0, payment_status: 'failed', delivery_status: 'cancelled' },
  {},
];

describe('pagamentos: site e Edge Function dizem o mesmo', () => {
  for (const fn of ['outstanding', 'overpaid', 'refundDue', 'deliveryNeedsPayment']) {
    it(fn, () => {
      for (const o of CASOS) expect(site[fn](o), JSON.stringify(o)).toBe(servidor[fn](o));
    });
  }
  it('isSettled', () => {
    for (const s of ['pending', 'awaiting_confirmation', 'partially_paid', 'paid', 'refunded', 'failed', '', undefined]) {
      expect(site.isSettled(s)).toBe(servidor.isSettled(s));
    }
  });
});

describe('moneySummary', () => {
  it('recebido é o que entrou; vendido não é receita', () => {
    const r = site.moneySummary([
      { total: 10000, amount_paid: 10000, amount_refunded: 0, status: 'delivered', delivery_status: 'delivered' },
      { total: 245000, amount_paid: 0, amount_refunded: 0, status: 'delivered', delivery_status: 'delivered' },
      { total: 5000, amount_paid: 2000, amount_refunded: 0, status: 'pending' },
      { total: 3000, amount_paid: 3000, amount_refunded: 0, status: 'cancelled' },
      { total: 4000, amount_paid: 4000, amount_refunded: 4000, status: 'cancelled' },
    ]);
    expect(r.received).toBe(10000 + 2000 + 3000);
    expect(r.receivable).toBe(245000 + 3000);
    expect(r.sold).toBe(10000 + 245000 + 5000);
    expect(r.refundDue).toBe(3000);
  });
});

describe('paidDay', () => {
  it('conta o dia pela hora de Luanda', () => {
    expect(site.paidDay({ paid_at: '2026-11-07T23:30:00Z' })).toBe('2026-11-08');
    expect(site.paidDay({ paid_at: null })).toBe(null);
  });
});
