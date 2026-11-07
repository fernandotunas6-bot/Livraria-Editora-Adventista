import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// O cliente do Supabase simulado: guarda o que foi pedido e devolve `result`.
let result = { data: [], error: null };
const calls = [];
const query = {
  select(cols) { calls.push(['select', cols]); return query; },
  order(col, opts) { calls.push(['order', col, opts]); return query; },
  limit(n) { calls.push(['limit', n]); return Promise.resolve(result); },
};
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (table) => { calls.push(['from', table]); return query; } },
}));
const { default: SecurityLogTab } = await import('./SecurityLogTab');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<SecurityLogTab />));
  await flush();
}

const ROWS = [
  {
    id: 2, at: '2026-11-07T08:00:00Z', actor_email: 'intruso@exemplo.ao', actor_kind: 'conta',
    table_name: 'payment_methods', row_id: 'pm1', action: 'update', alerted: true,
    summary: 'Dados de pagamento alterados: Transferência BAI',
    changes: { account_info: { de: 'IBAN AO06 0000', para: 'IBAN AO06 9999' } },
  },
  {
    id: 1, at: '2026-11-07T07:00:00Z', actor_email: null, actor_kind: 'servidor',
    table_name: 'orders', row_id: 'o1', action: 'update', alerted: false,
    summary: 'Encomenda ENC-1: pagamento pending → paid', changes: {},
  },
];

beforeEach(() => {
  calls.length = 0;
  result = { data: ROWS, error: null };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('SecurityLogTab', () => {
  it('lê o registo do mais recente para o mais antigo e mostra quem, o quê e o antes/depois', async () => {
    await mount();
    expect(calls).toContainEqual(['from', 'security_audit_log']);
    expect(calls).toContainEqual(['order', 'at', { ascending: false }]);
    const text = host.textContent;
    expect(text).toContain('Dados de pagamento alterados: Transferência BAI');
    expect(text).toContain('intruso@exemplo.ao');
    expect(text).toContain('Servidor (API)');
    expect(text).toContain('Conta / IBAN');
    expect(text).toContain('IBAN AO06 0000');
    expect(text).toContain('IBAN AO06 9999');
    expect(host.querySelectorAll('li')).toHaveLength(2);
    expect(host.querySelector('[aria-label="Avisado aos administradores"]')).not.toBeNull();
  });

  it('"Só as que geraram aviso" deixa só as alteradas que avisaram', async () => {
    await mount();
    const box = [...host.querySelectorAll('input[type="checkbox"]')][0];
    await act(async () => { box.click(); });
    expect(host.querySelectorAll('li')).toHaveLength(1);
    expect(host.textContent).toContain('1 de 2 alterações');
  });

  it('sem a migração aplicada, explica em vez de mostrar um erro técnico', async () => {
    result = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.security_audit_log'" } };
    await mount();
    expect(host.textContent).toContain('ainda não está activo');
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('um erro de permissão aparece como alerta', async () => {
    result = { data: null, error: { code: '42501', message: 'permission denied for table security_audit_log' } };
    await mount();
    expect(host.querySelector('[role="alert"]').textContent).toContain('permission denied');
  });
});
