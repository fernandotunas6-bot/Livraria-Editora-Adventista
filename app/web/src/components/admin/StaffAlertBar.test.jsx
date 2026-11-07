import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ops = {
  listActionAlerts: vi.fn(),
  acknowledgeOrder: vi.fn(),
  dismissAlert: vi.fn(),
};
vi.mock('@/lib/opsApi', () => ops);
const { default: StaffAlertBar } = await import('./StaffAlertBar');

let root;
let host;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label);

async function mount(props = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<StaffAlertBar {...props} />));
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(ops)) fn.mockReset();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('StaffAlertBar', () => {
  it('encomenda nova: mostra e "Assumir" chama order_acknowledge; o aviso só sai quando alguém assume', async () => {
    ops.listActionAlerts
      .mockResolvedValueOnce([{ id: 1, kind: 'new_order', title: 'Nova encomenda ENC-1 — assumir', body: 'Levantamento: Huambo · João · 5 000 Kz', order_id: 'o1', severity: 'high' }])
      .mockResolvedValueOnce([]);
    ops.acknowledgeOrder.mockResolvedValue({ already: false });
    await mount();
    expect(host.textContent).toContain('Nova encomenda ENC-1 — assumir');
    expect(button('Marcar como visto')).toBeUndefined();
    await act(async () => button('Assumir').click());
    await flush();
    expect(ops.acknowledgeOrder).toHaveBeenCalledWith('o1');
    expect(host.textContent).not.toContain('ENC-1');
  });

  it('se outra pessoa já assumiu, diz quem', async () => {
    ops.listActionAlerts.mockResolvedValue([{ id: 1, kind: 'new_order', title: 'Nova encomenda ENC-1', body: '', order_id: 'o1', severity: 'high' }]);
    ops.acknowledgeOrder.mockResolvedValue({ already: true, by_name: 'Ana' });
    await mount();
    await act(async () => button('Assumir').click());
    await flush();
    expect(host.querySelector('[role="alert"]').textContent).toContain('já foi assumida por Ana');
  });

  it('alerta crítico: "Ver" leva ao sítio certo e pode ser marcado como visto', async () => {
    const onOpen = vi.fn();
    const crit = { id: 7, kind: 'escalation', title: 'Sem resposta: Paga e ainda não preparada — ENC-2', body: 'ninguém assumiu', order_id: 'o2', severity: 'critical' };
    ops.listActionAlerts.mockResolvedValue([crit]);
    await mount({ onOpen });
    await act(async () => button('Ver').click());
    expect(onOpen).toHaveBeenCalledWith(crit);
    await act(async () => button('Marcar como visto').click());
    await flush();
    expect(ops.dismissAlert).toHaveBeenCalledWith(7);
  });

  it('pede um clique para activar o som (regra dos browsers) e lembra-se neste aparelho', async () => {
    ops.listActionAlerts.mockResolvedValue([]);
    await mount();
    const enable = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Activar som'));
    expect(enable).toBeTruthy();
    await act(async () => enable.click());
    await flush();
    expect(localStorage.getItem('livraria_alertas_som')).toBe('1');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent.includes('Activar som'))).toBe(false);
  });
});
