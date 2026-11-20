// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { attentionItems } from '@/lib/adminAttention';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const all = { orders: true, catalog: true };
const ids = (items) => items.map((i) => i.id);

const book = (extra = {}) => ({ id: 'b', title: 'Livro', price: 5000, stock: 5, active: true, cover: 'capa.jpg', description: 'Uma descrição com texto suficiente para contar como descrição a sério do livro.', ...extra });

describe('attentionItems', () => {
  it('tudo em dia: nada a mostrar', () => {
    const orders = [{ id: '1', status: 'pending', created: hoursAgo(2) }];
    expect(attentionItems({ orders, books: [book()], perms: all, now: NOW })).toEqual([]);
  });

  it('encomendas por confirmar há mais de 24 h; ao fim de 48 h passa a urgente, com a mais antiga', () => {
    const orders = [
      { id: '1', order_number: 'LA-1', status: 'pending', created: hoursAgo(30) },
      { id: '2', order_number: 'LA-2', status: 'pending', created: hoursAgo(5) },
    ];
    let [item] = attentionItems({ orders, perms: all, now: NOW });
    expect(item.id).toBe('pendentes-antigas');
    expect(item.severity).toBe('warning');
    expect(item.title).toBe('1 encomenda por confirmar há mais de 24 h');
    expect(item.detail).toContain('LA-1');
    expect(item.action).toEqual({ section: 'orders', status: 'pending' });

    orders.push({ id: '3', order_number: 'LA-3', status: 'pending', created: hoursAgo(80) });
    [item] = attentionItems({ orders, perms: all, now: NOW });
    expect(item.severity).toBe('critical');
    expect(item.title).toBe('2 encomendas por confirmar há mais de 24 h');
    expect(item.detail).toBe('A mais antiga: LA-3, há 3 dias.');
  });

  it('as canceladas não contam', () => {
    const orders = [{ id: '1', status: 'cancelled', payment_status: 'awaiting_confirmation', created: hoursAgo(100) }];
    expect(attentionItems({ orders, perms: all, now: NOW })).toEqual([]);
  });

  it('pagamentos indicados pelo cliente e não verificados há mais de 48 h', () => {
    const orders = [{ id: '1', order_number: 'LA-9', status: 'confirmed', payment_status: 'awaiting_confirmation', created: hoursAgo(90), updated: hoursAgo(60), shipping_method: 'pickup' }];
    const items = attentionItems({ orders, perms: all, now: NOW });
    expect(ids(items)).toEqual(['pagamentos-por-verificar']);
    expect(items[0].action).toEqual({ section: 'orders', payment: 'awaiting_confirmation' });
  });

  it('confirmadas por enviar há mais de 3 dias (não as de levantamento nem as já enviadas)', () => {
    const orders = [
      { id: '1', order_number: 'LA-5', status: 'confirmed', created: hoursAgo(100), shipping_method: 'delivery' },
      { id: '2', status: 'confirmed', created: hoursAgo(100), shipping_method: 'pickup' },
      { id: '3', status: 'confirmed', created: hoursAgo(100), delivery_status: 'in_transit' },
      { id: '4', status: 'confirmed', created: hoursAgo(10) },
    ];
    const items = attentionItems({ orders, perms: all, now: NOW });
    expect(ids(items)).toEqual(['por-enviar-atrasadas']);
    expect(items[0].title).toBe('1 encomenda confirmada ainda por enviar');
  });

  it('catálogo: destaques esgotados, promoções a acabar, sem capa e sem descrição', () => {
    const books = [
      book({ id: '1', title: 'Esgotado', featured: true, stock: 0 }),
      book({ id: '2', title: 'Promo', sale_price: 4000, sale_ends_at: hoursAgo(-10) }),
      book({ id: '3', title: 'Sem capa', cover: '', cover_image: '' }),
      book({ id: '4', title: 'Sem texto', description: '' }),
      book({ id: '5', title: 'Oculto', featured: true, stock: 0, active: false }),
    ];
    const items = attentionItems({ books, perms: all, now: NOW });
    expect(ids(items)).toEqual(['destaques-esgotados', 'promocoes-a-acabar', 'sem-capa', 'sem-descricao']);
    expect(items[0].detail).toContain('Esgotado');
    expect(items[0].detail).not.toContain('Oculto');
  });

  it('só o que a pessoa pode tratar; urgente primeiro', () => {
    const orders = [{ id: '1', status: 'pending', created: hoursAgo(100) }];
    const books = [book({ featured: true, stock: 0 })];
    expect(ids(attentionItems({ orders, books, perms: { catalog: true }, now: NOW }))).toEqual(['destaques-esgotados']);
    expect(ids(attentionItems({ orders, books, perms: { orders: true }, now: NOW }))).toEqual(['pendentes-antigas']);
    expect(attentionItems({ orders, books, perms: all, now: NOW })[0].severity).toBe('critical');
  });
});
