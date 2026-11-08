import { describe, expect, it } from 'vitest';
import { buildReceiptHtml, receiptBrand, receiptFromOrder, receiptTitle } from './receipt';

describe('recibo ou nota de encomenda', () => {
  it('só se chama "Recibo" com o pagamento confirmado', () => {
    expect(receiptTitle({ paymentStatus: 'paid' })).toBe('Recibo');
    for (const s of ['pending', 'awaiting_confirmation', 'partially_paid', 'failed', 'refunded', '', undefined]) {
      expect(receiptTitle({ paymentStatus: s })).toBe('Nota de encomenda');
    }
  });

  it('por pagar: diz o que está pago e o que falta, e que não é recibo', () => {
    const order = receiptFromOrder({ id: 'x', order_number: 'ENC-1', items: [{ title: 'Livro', quantity: 1, price: 11500 }], total: 11500, payment_status: 'partially_paid', amount_paid: 6000 });
    const html = buildReceiptHtml(order, receiptBrand({ site_name: 'Livraria', company_nif: '5417000000', company_legal_name: 'Livraria e Editora Adventista' }));
    expect(html).toContain('<title>Nota de encomenda ENC-1</title>');
    expect(html).toContain('Em falta');
    expect(html).toContain('não é recibo nem factura');
    expect(html).toContain('NIF 5417000000');
    expect(html).toContain('Livraria e Editora Adventista');
  });

  it('pago: recibo', () => {
    const order = receiptFromOrder({ id: 'x', order_number: 'ENC-2', items: [], total: 100, payment_status: 'paid', amount_paid: 100 });
    expect(buildReceiptHtml(order)).toContain('<title>Recibo ENC-2</title>');
  });
});
