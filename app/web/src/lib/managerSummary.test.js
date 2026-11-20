// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { delta, monthSummary, topProducts } from '@/lib/managerSummary';

const now = new Date(2026, 10, 8, 12, 0); // 8 de Novembro de 2026, meio-dia
const at = (m, d) => new Date(2026, m, d, 10, 0).toISOString();
const order = (created, extra = {}) => ({ created, status: 'pending', total: 10000, amount_paid: 0, amount_refunded: 0, items: [], ...extra });

describe('monthSummary', () => {
  const orders = [
    order(at(10, 2), { total: 20000, amount_paid: 20000 }),
    order(at(10, 5), { total: 10000 }),
    order(at(10, 6), { status: 'cancelled', total: 5000 }),
    order(at(9, 3), { total: 10000, amount_paid: 10000 }),
    // Depois do dia 8 de Outubro: fica fora da comparação.
    order(at(9, 20), { total: 99999 }),
  ];
  const s = monthSummary(orders, now);

  it('o mês até hoje, sem as canceladas no valor', () => {
    expect(s.label).toBe('Novembro, até dia 8');
    expect(s.current.orders).toBe(2);
    expect(s.current.ordered).toBe(30000);
    expect(s.current.received).toBe(20000);
    expect(s.current.average).toBe(15000);
    expect(s.current.cancelled).toBe(1);
    expect(s.current.cancelledShare).toBeCloseTo(1 / 3);
  });

  it('compara com os mesmos dias do mês anterior, não com o mês inteiro', () => {
    expect(s.previous.orders).toBe(1);
    expect(s.previous.ordered).toBe(10000);
    expect(s.deltas.ordered).toBe(200);
    expect(s.deltas.orders).toBe(100);
  });

  it('reembolsos descontam no recebido', () => {
    const r = monthSummary([order(at(10, 1), { amount_paid: 10000, amount_refunded: 4000 })], now);
    expect(r.current.received).toBe(6000);
  });

  it('num mês mais curto, a comparação pára no fim dele', () => {
    const march31 = new Date(2026, 2, 31, 12, 0);
    const r = monthSummary([order(new Date(2026, 1, 28, 10).toISOString()), order(new Date(2026, 2, 1, 10).toISOString())], march31);
    expect(r.previous.orders).toBe(1);
  });
});

describe('delta', () => {
  it('sem base não inventa percentagens', () => {
    expect(delta(5, 0)).toBeNull();
    expect(delta(0, 0)).toBeNull();
    expect(delta(100, 100)).toBe(0);
    expect(delta(50, 100)).toBe(-50);
  });
});

describe('topProducts', () => {
  it('soma unidades por produto nos últimos 30 dias, sem canceladas', () => {
    const orders = [
      order(at(10, 1), { items: [{ book_id: 'a', title: 'A', quantity: 2, price: 1000 }, { book_id: 'b', title: 'B', quantity: 1, price: 5000 }] }),
      order(at(10, 3), { items: [{ book_id: 'b', title: 'B', quantity: 2, price: 5000 }] }),
      order(at(10, 4), { status: 'cancelled', items: [{ book_id: 'a', title: 'A', quantity: 9, price: 1000 }] }),
      order(at(7, 1), { items: [{ book_id: 'c', title: 'C', quantity: 50, price: 1000 }] }),
    ];
    const top = topProducts(orders, { now });
    expect(top.map((t) => [t.id, t.units])).toEqual([['b', 3], ['a', 2]]);
    expect(top[0].revenue).toBe(15000);
  });
});
