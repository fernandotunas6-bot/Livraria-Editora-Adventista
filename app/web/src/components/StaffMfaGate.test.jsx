import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { rpc: (...a) => rpc(...a), auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));
let user = { id: 'u1', role: 'admin' };
const logout = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user, logout }) }));
vi.mock('@/components/MfaSettings', () => ({ default: () => <div data-testid="mfa-settings">activar</div> }));

const { default: StaffMfaGate, formatDeadline, isStaffRole, staffMfaView } = await import('./StaffMfaGate');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(element) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  for (let i = 0; i < 6; i++) await flush();
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  rpc.mockReset();
  user = { id: 'u1', role: 'admin' };
});

const PAINEL = <p data-testid="painel">painel</p>;

describe('staffMfaView', () => {
  it('só a equipa sem código vê alguma coisa', () => {
    expect(staffMfaView(null)).toBe('none');
    expect(staffMfaView({ staff: false, has_factor: false, enforced: true })).toBe('none');
    expect(staffMfaView({ staff: true, has_factor: true, enforced: true })).toBe('none');
    expect(staffMfaView({ staff: true, has_factor: false, enforced: false })).toBe('notice');
    expect(staffMfaView({ staff: true, has_factor: false, enforced: true })).toBe('gate');
  });

  it('papéis da equipa', () => {
    expect(isStaffRole({ role: 'admin' })).toBe(true);
    expect(isStaffRole({ role: 'manager' })).toBe(true);
    expect(isStaffRole({ role: 'member' })).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });

  it('a data do prazo em hora de Luanda', () => {
    expect(formatDeadline('2026-11-27T10:00:00+00:00')).toMatch(/27 de novembro/);
    expect(formatDeadline('infinity')).toBe('');
    expect(formatDeadline(null)).toBe('');
  });
});

describe('StaffMfaGate', () => {
  it('depois do prazo, a equipa sem código vê o ecrã de activação em vez do painel', async () => {
    rpc.mockResolvedValue({ data: { staff: true, has_factor: false, enforced: true, enforce_after: '2026-11-27T10:00:00Z' }, error: null });
    await mount(<StaffMfaGate>{PAINEL}</StaffMfaGate>);
    expect(rpc).toHaveBeenCalledWith('staff_mfa_status');
    expect(host.querySelector('[data-testid="painel"]')).toBeNull();
    expect(host.textContent).toMatch(/Active a verificação em dois passos/);
    expect(host.querySelector('[data-testid="mfa-settings"]')).not.toBeNull();
  });

  it('dentro do prazo, o painel abre com o aviso e a data', async () => {
    rpc.mockResolvedValue({ data: { staff: true, has_factor: false, enforced: false, enforce_after: '2026-11-27T10:00:00Z' }, error: null });
    await mount(<StaffMfaGate>{PAINEL}</StaffMfaGate>);
    expect(host.querySelector('[data-testid="painel"]')).not.toBeNull();
    expect(host.textContent).toMatch(/A partir de .*27 de novembro/);
  });

  it('sem aviso quando pedido (TV), mas o ecrã de activação continua depois do prazo', async () => {
    rpc.mockResolvedValue({ data: { staff: true, has_factor: false, enforced: false, enforce_after: '2026-11-27T10:00:00Z' }, error: null });
    await mount(<StaffMfaGate notice={false}>{PAINEL}</StaffMfaGate>);
    expect(host.textContent).not.toMatch(/obrigatória/);
  });

  it('com o código activo, só o painel', async () => {
    rpc.mockResolvedValue({ data: { staff: true, has_factor: true, enforced: true }, error: null });
    await mount(<StaffMfaGate>{PAINEL}</StaffMfaGate>);
    expect(host.querySelector('[data-testid="painel"]')).not.toBeNull();
    expect(host.textContent).not.toMatch(/dois passos/);
  });

  it('clientes não perguntam nada ao servidor', async () => {
    user = { id: 'c1', role: 'member' };
    await mount(<StaffMfaGate>{PAINEL}</StaffMfaGate>);
    expect(rpc).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="painel"]')).not.toBeNull();
  });

  it('sem a migração (erro do servidor), o painel abre como antes', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await mount(<StaffMfaGate>{PAINEL}</StaffMfaGate>);
    expect(host.querySelector('[data-testid="painel"]')).not.toBeNull();
  });
});
