import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O primeiro render (Radix no jsdom) pode passar dos 5 s numa máquina carregada.
vi.setConfig({ testTimeout: 30000 });

const REG = {
  provinces: [{ id: 'hua', name: 'Huambo', sort_order: 1 }, { id: 'bie', name: 'Bié', sort_order: 2 }],
  municipalities: [{ id: 'm-hua', name: 'Huambo', province: 'hua' }, { id: 'm-cui', name: 'Cuito', province: 'bie' }],
  fields: [{ id: 'f1', name: 'Missão Centro', short_name: 'MC', kind: 'missao', active: true, notes: '' }],
  districts: [
    { id: 'd1', name: 'Distrito Centro', field_id: 'f1', province_id: 'hua', municipality_id: 'm-hua', active: true, notes: '' },
    { id: 'd2', name: 'Distrito Centro', field_id: 'f1', province_id: 'bie', municipality_id: 'm-cui', active: true, notes: '' },
  ],
  churches: [
    { id: 'c1', cn: '001', name: 'Central Huambo', kind: 'igreja', district_id: 'd1', field_id: 'f1', province_id: 'hua', municipality_id: 'm-hua', delegate_name: '', delegate_pastor_id: 'p1', active: true },
    { id: 'c2', cn: '250', name: 'Central Cuito', kind: 'igreja', district_id: 'd2', field_id: 'f1', province_id: 'bie', municipality_id: 'm-cui', delegate_name: 'Ancião X', delegate_pastor_id: null, active: true },
  ],
  pastors: [
    { id: 'p1', title: 'Pr.', name: 'Gomes João', role: 'pastor_distrital', field_id: 'f1', province_id: 'hua', posting: '', phone: '928000000', email: '', status: 'activo', notes: '' },
    { id: 'p2', title: 'Pr.', name: 'Domingos Suquina', role: 'professor', field_id: 'f1', province_id: 'hua', posting: 'ISPAB – Bongo', phone: '', email: '', status: 'activo', notes: '' },
  ],
  assignments: [{ id: 'a1', pastor_id: 'p1', district_id: 'd1', kind: 'titular', start_date: '2026-01-01', end_date: null, notes: '' }],
};

const api = vi.hoisted(() => ({ loadRegistry: vi.fn(), saveRecord: vi.fn(), assignPastor: vi.fn() }));
vi.mock('@/lib/churchRegistryApi', async (importOriginal) => ({ ...(await importOriginal()), ...api }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: false, hasPermission: (k) => k === 'manage_church_registry' }) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: ChurchRegistryTab } = await import('./ChurchRegistryTab');
const { default: DistrictsPanel } = await import('./DistrictsPanel');
const { default: PastorsPanel } = await import('./PastorsPanel');
const { indexRegistry } = await import('@/lib/churchRegistryApi');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount(node) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});
const button = (el, title) => el.querySelector(`button[title="${title}"]`);

describe('ChurchRegistryTab', () => {
  it('carrega o registo e mostra o resumo por província', async () => {
    api.loadRegistry.mockResolvedValue(REG);
    const el = await mount(<ChurchRegistryTab />);
    expect(el.textContent).toContain('Registo da Igreja');
    expect(el.textContent).toContain('Distritos (2)');
    expect(el.textContent).toContain('Importar');
    const rows = [...el.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(rows[0]).toContain('Huambo');
    expect(rows[1]).toContain('Bié');
    expect(el.textContent).toMatch(/distritos activos sem pastor titular/);
  });

  it('migração por aplicar: explica em vez de rebentar', async () => {
    api.loadRegistry.mockRejectedValue(new Error('O registo da Igreja ainda não está na base de dados (migração 20261107100000_registo_igreja por aplicar).'));
    const el = await mount(<ChurchRegistryTab />);
    expect(el.textContent).toContain('Não foi possível ler o registo da Igreja');
    expect(el.textContent).toContain('20261107100000');
  });
});

describe('DistrictsPanel', () => {
  const idx = indexRegistry(REG);
  it('mostra os dois "Distrito Centro" com província, titular e igrejas', async () => {
    const el = await mount(<DistrictsPanel reg={REG} idx={idx} canEdit run={vi.fn()} />);
    const rows = [...el.querySelectorAll('tbody tr')].map((tr) => tr.textContent);
    expect(rows).toHaveLength(2);
    expect(rows.join('\n')).toContain('Pr. Gomes João');
    expect(rows.join('\n')).toContain('sem titular');
  });

  it('transferir abre a escolha de pastor e chama a função da base de dados', async () => {
    const run = vi.fn(async (fn) => fn());
    const el = await mount(<DistrictsPanel reg={REG} idx={idx} canEdit run={run} />);
    const huambo = [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Huambo'));
    await act(async () => button(huambo, 'Transferir / atribuir pastor').click());
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('Pastores de Distrito Centro');
    const select = [...dialog.querySelectorAll('select')][0];
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, 'p2');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const atribuir = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Atribuir');
    await act(async () => atribuir.click());
    expect(api.assignPastor).toHaveBeenCalledWith(expect.objectContaining({ districtId: 'd1', pastorId: 'p2', kind: 'titular' }));
  });

  it('sem permissão de edição não há botões', async () => {
    const el = await mount(<DistrictsPanel reg={REG} idx={idx} canEdit={false} run={vi.fn()} />);
    expect(el.textContent).not.toContain('Novo distrito');
    expect(button(el, 'Editar')).toBeNull();
  });
});

describe('PastorsPanel', () => {
  const idx = indexRegistry(REG);
  it('mostra o distrito ou o local de serviço', async () => {
    const el = await mount(<PastorsPanel reg={REG} idx={idx} canEdit run={vi.fn()} />);
    const text = el.textContent;
    expect(text).toContain('Distrito Centro');
    expect(text).toContain('ISPAB – Bongo');
    expect(text).toContain('Professor / Pastor');
  });

  it('guardar limpa o telefone (+244, espaços)', async () => {
    const run = vi.fn(async (fn) => fn());
    const el = await mount(<PastorsPanel reg={REG} idx={idx} canEdit run={run} />);
    const row = [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Suquina'));
    await act(async () => button(row, 'Editar').click());
    const dialog = document.body.querySelector('[role="dialog"]');
    const phone = dialog.querySelector('input[inputmode="tel"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(phone, '+244 923 456 789');
      phone.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const guardar = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Guardar');
    await act(async () => guardar.click());
    expect(api.saveRecord).toHaveBeenCalledWith('pastor', expect.objectContaining({ id: 'p2', phone: '923456789' }));
  });
});
