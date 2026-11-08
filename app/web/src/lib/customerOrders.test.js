import { describe, expect, it } from 'vitest';
import {
  canCustomerCancel, customerOrderStage, isOrderFinished, orderUnits, reorderLines, stageSteps, unitsLabel,
} from '@/lib/customerOrders';

const order = (extra = {}) => ({
  status: 'pending', delivery_status: 'received', payment_status: 'pending', amount_paid: 0, shipping_method: 'delivery', ...extra,
});

describe('customerOrderStage', () => {
  it('nunca diz "Recebida" a quem ainda não recebeu nada', () => {
    const s = customerOrderStage(order());
    expect(s.label).toBe('Registada');
    expect(s.key).toBe('placed');
  });

  it('cancelada: diz que não há nada a pagar (e não "Pagamento pendente")', () => {
    const s = customerOrderStage(order({ status: 'cancelled' }), { upfront: true });
    expect(s.label).toBe('Cancelada');
    expect(s.hint).toBe('Não há nada a pagar.');
    expect(customerOrderStage(order({ status: 'cancelled', amount_paid: 5000 })).hint).toMatch(/reembolso/);
    expect(customerOrderStage(order({ status: 'cancelled', amount_paid: 5000, amount_refunded: 5000 })).hint).toBe('Não há nada a pagar.');
  });

  it('pago antes do envio: o que falta fazer vem primeiro', () => {
    expect(customerOrderStage(order(), { upfront: true }).key).toBe('to_pay');
    expect(customerOrderStage(order({ payment_status: 'partially_paid' }), { upfront: true }).label).toBe('Falta pagar o resto');
    expect(customerOrderStage(order({ payment_status: 'awaiting_confirmation' }), { upfront: true }).key).toBe('verifying');
    expect(customerOrderStage(order({ payment_status: 'failed' }), { upfront: true }).key).toBe('payment_failed');
    // Na entrega ou no balcão não há nada a pagar antes: fica "Registada".
    expect(customerOrderStage(order(), { upfront: false }).key).toBe('placed');
  });

  it('cada passo da entrega, em palavras simples', () => {
    expect(customerOrderStage(order({ status: 'confirmed', delivery_status: 'confirmed' })).label).toBe('Confirmada');
    expect(customerOrderStage(order({ delivery_status: 'preparing' })).label).toBe('A preparar');
    expect(customerOrderStage(order({ delivery_status: 'in_transit' })).label).toBe('A caminho');
    expect(customerOrderStage(order({ delivery_status: 'out_for_delivery' })).label).toBe('Saiu para entrega');
    expect(customerOrderStage(order({ status: 'delivered', delivery_status: 'delivered' })).label).toBe('Entregue');
  });

  it('levantamento: pronta para levantar e levantada, com a loja', () => {
    const pick = { shipping_method: 'pickup', pickup_store: 'Livraria Adventista — Huambo' };
    const ready = customerOrderStage(order({ ...pick, delivery_status: 'shipped' }));
    expect(ready.label).toBe('Pronta para levantar');
    expect(ready.hint).toBe('Na Livraria Adventista — Huambo.');
    expect(customerOrderStage(order({ ...pick, status: 'delivered', delivery_status: 'delivered' })).label).toBe('Levantada');
    expect(stageSteps(order(pick))[3]).toBe('Levantada');
  });

  it('os passos da barra avançam', () => {
    const steps = ['received', 'preparing', 'in_transit', 'delivered'].map((d) => customerOrderStage(order({ delivery_status: d })).step);
    expect(steps).toEqual([0, 1, 2, 3]);
  });
});

describe('outras ajudas', () => {
  it('em curso ou terminada', () => {
    expect(isOrderFinished(order())).toBe(false);
    expect(isOrderFinished(order({ status: 'cancelled' }))).toBe(true);
    expect(isOrderFinished(order({ delivery_status: 'delivered' }))).toBe(true);
  });

  it('conta unidades e escreve o plural certo', () => {
    const o = { items: [{ quantity: 2 }, { quantity: 1 }, {}] };
    expect(orderUnits(o)).toBe(4);
    expect(unitsLabel(1)).toBe('1 artigo');
    expect(unitsLabel(4)).toBe('4 artigos');
    expect(orderUnits({})).toBe(0);
  });

  it('pode cancelar', () => {
    expect(canCustomerCancel(order())).toBe(true);
    expect(canCustomerCancel(order({ delivery_status: 'preparing' }))).toBe(false);
  });

  it('comprar de novo: o id da variante que o carrinho usa', () => {
    const lines = reorderLines({
      items: [
        { book_id: 'abc', quantity: 2, title: 'Livro' },
        { book_id: 'tsh', quantity: 1, variant: 2, title: 'T-shirt' },
        { book_id: 'tsh', quantity: 1, variant: 0, title: 'T-shirt' },
        { title: 'Sem id' },
        { book_id: 'big', quantity: 500 },
      ],
    });
    expect(lines.map((l) => l.variantId)).toEqual(['abc-default', 'tsh-v2', 'tsh-v0', 'big-default']);
    expect(lines[0].quantity).toBe(2);
    expect(lines[3].quantity).toBe(99);
  });
});
