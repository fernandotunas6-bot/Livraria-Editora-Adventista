import { describe, expect, it } from 'vitest';
import { mergeOrders, newestUpdated } from '@/lib/ordersSync';

describe('encomendas que mudaram', () => {
  const lista = [
    { id: 'b', created: '2026-11-08T10:00:00Z', updated: '2026-11-08T10:00:00Z', status: 'pending' },
    { id: 'a', created: '2026-11-07T10:00:00Z', updated: '2026-11-07T10:00:00Z', status: 'pending' },
  ];

  it('junta as novas e substitui as mudadas, mais recentes primeiro', () => {
    const out = mergeOrders(lista, [
      { id: 'a', status: 'confirmed', updated: '2026-11-08T11:00:00Z' },
      { id: 'c', created: '2026-11-08T12:00:00Z', updated: '2026-11-08T12:00:00Z', status: 'pending' },
    ]);
    expect(out.map((o) => o.id)).toEqual(['c', 'b', 'a']);
    expect(out.find((o) => o.id === 'a')).toMatchObject({ status: 'confirmed', created: '2026-11-07T10:00:00Z' });
  });

  it('sem mudanças devolve a mesma lista', () => {
    expect(mergeOrders(lista, [])).toBe(lista);
  });

  it('o ponto de partida seguinte é a data mais recente do servidor', () => {
    expect(newestUpdated(lista)).toBe('2026-11-08T10:00:00Z');
    expect(newestUpdated([], '2026-11-01T00:00:00Z')).toBe('2026-11-01T00:00:00Z');
    expect(newestUpdated([{ updated: '2026-11-09T00:00:00Z' }], '2026-11-01T00:00:00Z')).toBe('2026-11-09T00:00:00Z');
  });
});
