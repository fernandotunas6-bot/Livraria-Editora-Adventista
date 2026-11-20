// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { hasPurchasedBook, isCompletedPurchase } from './purchase';

describe('isCompletedPurchase', () => {
  it('conta só quando paga, entregue ou confirmada pelo cliente', () => {
    expect(isCompletedPurchase({ status: 'pending', payment_status: 'paid' })).toBe(true);
    expect(isCompletedPurchase({ status: 'pending', delivery_status: 'delivered' })).toBe(true);
    expect(isCompletedPurchase({ status: 'pending', customer_confirmed_at: '2026-11-06T10:00:00Z' })).toBe(true);
    expect(isCompletedPurchase({ status: 'pending', payment_status: 'pending', delivery_status: 'received' })).toBe(false);
  });
  it('uma encomenda cancelada nunca conta, mesmo paga', () => {
    expect(isCompletedPurchase({ status: 'cancelled', payment_status: 'paid' })).toBe(false);
    expect(isCompletedPurchase({ status: 'pending', delivery_status: 'cancelled', payment_status: 'paid' })).toBe(false);
    expect(isCompletedPurchase(null)).toBe(false);
  });
});

describe('hasPurchasedBook', () => {
  const paga = { status: 'pending', payment_status: 'paid', items: [{ book_id: 'livro-1' }] };
  const porPagar = { status: 'pending', payment_status: 'pending', items: [{ book_id: 'livro-2' }] };
  it('só com o livro numa encomenda que conta', () => {
    expect(hasPurchasedBook([paga, porPagar], 'livro-1')).toBe(true);
    expect(hasPurchasedBook([paga, porPagar], 'livro-2')).toBe(false);
    expect(hasPurchasedBook([paga], 'outro')).toBe(false);
    expect(hasPurchasedBook([], 'livro-1')).toBe(false);
    expect(hasPurchasedBook(undefined, 'livro-1')).toBe(false);
  });
});
