import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Painel → Catálogo → Materiais → Acessos e pagamentos.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let rows = [];
let missing = false;
const api = {
  loadDigitalAccess: vi.fn(async () => ({ rows, missing })),
  blockDigitalAccess: vi.fn(async () => {}),
  unblockDigitalAccess: vi.fn(async () => {}),
};
vi.mock('@/lib/digitalLibrary', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
let perms = { isAdmin: false, orders: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: perms.isAdmin, hasPermission: (k) => (k === 'manage_orders' ? perms.orders : false) }) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: DigitalAccessPanel } = await import('./DigitalAccessPanel');

let root;
let host;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><DigitalAccessPanel /></MemoryRouter>));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const row = (state) => host.querySelector(`[data-acesso="${state}"]`);
const button = (scope, text) => [...scope.querySelectorAll('button, a')].find((b) => b.textContent.includes(text));
const click = (el) => act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });

const BASE = { download_id: 'd1', title: 'O Desejado (PDF)', customer_id: 'u1', customer_name: 'Maria Lopes', customer_email: 'maria@exemplo.ao', customer_code: 'CLI-0007', ordered_at: '2026-11-08T10:00:00Z', total: 3000, amount_paid: 0, downloads: 0 };

beforeEach(() => {
  rows = [];
  missing = false;
  perms = { isAdmin: false, orders: true };
  Object.values(api).forEach((f) => f.mockClear());
  toast.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('DigitalAccessPanel', () => {
  it('explica que o livro abre com o pagamento confirmado', async () => {
    await mount();
    expect(host.textContent).toContain('abre sozinho quando o pagamento da encomenda é confirmado');
    expect(host.textContent).toContain('Ainda ninguém comprou livros digitais');
  });

  it('mostra o comprador, o pagamento e o estado; o pagamento por confirmar leva à encomenda', async () => {
    rows = [
      { ...BASE, order_id: 'o1', order_number: 'ENC-1', payment_status: 'awaiting_confirmation', state: 'payment_review' },
      { ...BASE, order_id: 'o2', order_number: 'ENC-2', payment_status: 'paid', amount_paid: 3000, state: 'open', downloads: 2 },
      { ...BASE, order_id: 'o3', order_number: 'ENC-3', payment_status: 'pending', state: 'awaiting_payment' },
    ];
    await mount();
    expect(host.textContent).toContain('Maria Lopes');
    expect(host.textContent).toContain('CLI-0007');
    const review = row('payment_review');
    expect(review.textContent).toContain('Cliente indicou o pagamento');
    expect(button(review, 'Confirmar o pagamento').getAttribute('href')).toBe('/admin?tab=orders&encomenda=ENC-1');
    expect(row('open').textContent).toContain('Paga');
    expect(row('open').textContent).toContain('Aberto 2 vezes');
    expect(button(row('awaiting_payment'), 'Ver a encomenda')).toBeTruthy();
    // Não há "abrir" sem pagamento.
    expect(button(row('awaiting_payment'), 'Desbloquear')).toBeFalsy();
  });

  it('os filtros mostram quantos há em cada estado', async () => {
    rows = [
      { ...BASE, order_id: 'o1', order_number: 'ENC-1', payment_status: 'paid', state: 'open' },
      { ...BASE, order_id: 'o2', order_number: 'ENC-2', payment_status: 'paid', state: 'open' },
      { ...BASE, order_id: 'o3', order_number: 'ENC-3', payment_status: 'pending', state: 'awaiting_payment' },
    ];
    await mount();
    const chip = (label) => [...host.querySelectorAll('[role="group"] button')].find((b) => b.textContent.startsWith(label));
    expect(chip('Todos').textContent).toContain('3');
    expect(chip('Aberto').textContent).toContain('2');
    expect(chip('Bloqueado')).toBeFalsy();
    await click(chip('Por pagar'));
    expect(host.querySelectorAll('[data-acesso]')).toHaveLength(1);
  });

  it('bloquear pede o motivo; desbloquear volta a abrir', async () => {
    rows = [
      { ...BASE, order_id: 'o1', order_number: 'ENC-1', payment_status: 'paid', state: 'open' },
      { ...BASE, download_id: 'd2', title: 'Revista (PDF)', order_id: 'o2', order_number: 'ENC-2', payment_status: 'paid', state: 'blocked', block_reason: 'Partilha', blocked_at: '2026-11-08T12:00:00Z' },
    ];
    await mount();
    expect(row('blocked').textContent).toContain('Partilha');
    await click(button(row('open'), 'Bloquear'));
    const dialog = document.querySelector('[role="dialog"]');
    const confirm = button(dialog, 'Bloquear');
    expect(confirm.disabled).toBe(true);
    const textarea = document.getElementById('bloqueio-motivo');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => { setter.call(textarea, 'Partilhou o ficheiro'); textarea.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(button(document.querySelector('[role="dialog"]'), 'Bloquear'));
    expect(api.blockDigitalAccess).toHaveBeenCalledWith({ downloadId: 'd1', userId: 'u1', reason: 'Partilhou o ficheiro' });
    await click(button(row('blocked'), 'Desbloquear'));
    expect(api.unblockDigitalAccess).toHaveBeenCalledWith({ downloadId: 'd2', userId: 'u1' });
  });

  it('sem "Gerir encomendas", diz onde se confirma o pagamento', async () => {
    perms = { isAdmin: false, orders: false };
    rows = [{ ...BASE, order_id: 'o1', order_number: 'ENC-1', payment_status: 'awaiting_confirmation', state: 'payment_review' }];
    await mount();
    expect(button(row('payment_review'), 'Confirmar o pagamento')).toBeFalsy();
    expect(row('payment_review').textContent).toContain('confirma-o em Encomendas');
  });

  it('sem a migração, explica o que falta', async () => {
    missing = true;
    await mount();
    expect(host.textContent).toContain('20261108160000_livros_digitais');
  });
});
