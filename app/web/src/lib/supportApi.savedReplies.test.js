import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
const { fillSavedReply, slaState } = await import('./supportApi');

describe('respostas rápidas', () => {
  it('preenche o primeiro nome, o número do pedido e a encomenda', () => {
    const thread = { ticket_number: 1004, customer: { name: 'Maria João Silva' }, order: { order_number: 'ENC-K3J9XA4F2' } };
    expect(fillSavedReply('Olá {nome}, o pedido {pedido} sobre a encomenda {encomenda}.', thread))
      .toBe('Olá Maria, o pedido #1004 sobre a encomenda ENC-K3J9XA4F2.');
  });

  it('sem dados, usa termos neutros em vez de deixar marcadores', () => {
    expect(fillSavedReply('Olá {nome}, sobre {encomenda}.', {})).toBe('Olá cliente, sobre a sua encomenda.');
  });
});

describe('prazos dos pedidos', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  it('atrasado, quase a acabar ou em dia; só em pedidos abertos', () => {
    const t = { ticket_number: 1, status: 'open', first_response_due_at: '2026-11-09T11:00:00Z', resolution_due_at: '2026-11-09T13:00:00Z' };
    expect(slaState(t, now)).toEqual({ first: 'late', resolution: 'soon' });
    expect(slaState({ ...t, first_response_at: '2026-11-09T10:00:00Z', resolution_due_at: '2026-11-12T12:00:00Z' }, now)).toEqual({ first: '', resolution: 'ok' });
    expect(slaState({ ...t, status: 'closed' }, now)).toEqual({ first: '', resolution: '' });
  });
});
