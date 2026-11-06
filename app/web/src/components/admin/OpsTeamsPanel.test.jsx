import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
const real = await vi.importActual('@/lib/opsApi');
const ops = {
  DUTIES: real.DUTIES,
  DUTY_LABELS: real.DUTY_LABELS,
  WEEK_DAYS: real.WEEK_DAYS,
  loadTeams: vi.fn(),
  loadRouting: vi.fn(),
  saveTeam: vi.fn(),
  deleteTeam: vi.fn(),
  setTeamMembers: vi.fn(),
  saveOpsHours: vi.fn(),
  sendTeamTest: vi.fn(),
};
vi.mock('@/lib/opsApi', () => ops);
const { default: OpsTeamsPanel } = await import('./OpsTeamsPanel');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim().includes(label) || b.getAttribute('aria-label') === label);

const DATA = {
  teams: [{ id: 't1', name: 'Loja Huambo', store_id: 's1', duties: ['new_order', 'pickup'], escalation_minutes: 20, notify_email: true, notify_whatsapp: true, notify_push: true, active: true }],
  members: [{ team_id: 't1', profile_id: 'p1', is_lead: true }],
  staff: [{ id: 'p1', name: 'Ana', role: 'manager', phone: '' }, { id: 'p2', name: 'Rui', role: 'admin', phone: '923000000' }],
  stores: [{ id: 's1', name: 'Livraria — Huambo', active: true }],
  hours: { open_hour: 8, close_hour: 18, open_days: [1, 2, 3, 4, 5, 6] },
};

async function mount(props = { canEdit: true }) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<OpsTeamsPanel {...props} />));
  await flush();
  await flush();
}

beforeEach(() => {
  for (const fn of Object.values(ops)) if (typeof fn?.mockReset === 'function') fn.mockReset();
  toast.mockReset();
  ops.loadTeams.mockResolvedValue(DATA);
  ops.loadRouting.mockResolvedValue({
    rows: [{ store_id: 's1', label: 'Livraria — Huambo', duty: 'new_order', recipients: [{ id: 'p1', name: 'Ana', lead: true }], escalation: [{ id: 'p2', name: 'Rui' }] }],
    whatsapp_configured: false, push_enabled: true,
  });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('OpsTeamsPanel', () => {
  it('mostra equipas, membros (★ responsável), funções sem equipa e quem recebe o quê', async () => {
    await mount();
    expect(host.textContent).toContain('Loja Huambo');
    expect(host.textContent).toContain('★ Ana');
    expect(host.textContent).toContain('Funções sem equipa com membros');
    expect(host.textContent).toMatch(/Pagamentos, Preparação, Entregas, Atendimento, Urgências/);
    expect(host.textContent).toContain('Livraria — Huambo');
    expect(host.textContent).toContain('WhatsApp por configurar');
  });

  it('nova equipa: guarda a equipa e os membros, com o responsável', async () => {
    ops.saveTeam.mockResolvedValue({ id: 't2' });
    await mount();
    await act(async () => button('Nova equipa').click());
    const name = host.querySelector('input[placeholder="Ex.: Loja do Huambo"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(name, 'Urgências');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const duty = [...host.querySelectorAll('label')].find((l) => l.textContent.startsWith('Urgências')).querySelector('input');
    await act(async () => duty.click());
    const rui = [...host.querySelectorAll('label')].find((l) => l.textContent.includes('Rui')).querySelector('input');
    await act(async () => rui.click());
    await act(async () => button('Responsável').click());
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(ops.saveTeam).toHaveBeenCalledWith(expect.objectContaining({ name: 'Urgências', duties: ['urgent'] }));
    expect(ops.setTeamMembers).toHaveBeenCalledWith('t2', [{ profile_id: 'p2', is_lead: true }]);
  });

  it('avisa quando o WhatsApp está ligado e há membros sem telefone', async () => {
    await mount();
    await act(async () => button('Editar').click());
    expect(host.textContent).toContain('1 membro(s) sem telefone');
  });

  it('sem "gerir utilizadores": só vê, não edita', async () => {
    await mount({ canEdit: false });
    expect(button('Nova equipa')).toBeUndefined();
    expect(button('Editar')).toBeUndefined();
  });
});
