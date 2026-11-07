import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O primeiro render (Radix no jsdom) pode passar dos 5 s numa máquina carregada.
vi.setConfig({ testTimeout: 30000 });

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const REG = {
  provinces: [{ id: 'hua', name: 'Huambo', sort_order: 1 }],
  municipalities: [{ id: 'm-hua', name: 'Huambo', province: 'hua' }],
  fields: [{ id: 'f1', name: 'Missão Centro' }],
  districts: [{ id: 'd1', name: 'Distrito Centro', field_id: 'f1', province_id: 'hua', active: true }],
  churches: [{ id: 'c1', cn: '001', name: 'Central Huambo', district_id: 'd1', province_id: 'hua', municipality_id: 'm-hua', active: true }],
  pastors: [{ id: 'p1', title: 'Pr.', name: 'Gomes João', role: 'pastor_distrital', status: 'activo' }],
  assignments: [{ id: 'a1', pastor_id: 'p1', district_id: 'd1', kind: 'titular', start_date: '2026-01-01', end_date: null }],
};
const base = { email: '', church_other: '', territory: '', school: '', recommended_by_name: '', notes: '', motivation: '', status_reason: '', province_id: 'hua', municipality_id: 'm-hua', church_id: 'c1' };
const DATA = {
  colporteurs: [
    { ...base, id: 'k1', code: null, full_name: 'Maria Candidata', phone: '923111222', status: 'candidatura', category: 'aspirante', requested_category: 'estudante', recommended_by_pastor_id: 'p1', recommendation_ok: false, created: '2026-11-06T08:00:00Z' },
    { ...base, id: 'k2', code: 'CPT-0001', full_name: 'João Colportor', phone: '923222333', status: 'activo', category: 'licenciado', requested_category: 'aspirante', profile_id: null, start_date: '2026-02-01', created: '2026-01-10T08:00:00Z' },
  ],
  events: [{ id: 1, colporteur_id: 'k2', kind: 'estado', detail: { to: 'activo' }, created: '2026-02-01T08:00:00Z' }],
  rules: [
    { id: 'r1', category: null, product_type: null, sale_mode: null, pct: 20, valid_from: '2026-01-01', valid_to: null, created: '2026-01-01' },
    { id: 'r2', category: 'licenciado', product_type: null, sale_mode: 'site', pct: 35, valid_from: '2026-01-01', valid_to: null, created: '2026-01-01' },
  ],
  overrides: [],
  settings: { id: 1, base_pct: 10, default_credit_limit: 50000 },
};

const api = vi.hoisted(() => ({
  loadColporteurAdmin: vi.fn(), setColporteurStatus: vi.fn(), createInvite: vi.fn(), setRule: vi.fn(),
  saveColporteur: vi.fn(), deleteCandidate: vi.fn(), setColporteurCategory: vi.fn(), setOverride: vi.fn(), unlinkAccount: vi.fn(),
  pctPreview: vi.fn(), saveColporteurSettings: vi.fn(),
  loadOperations: vi.fn(async () => ({ documents: [], reports: [], ledger: [], overview: [] })),
  loadBooksForColportage: vi.fn(async () => []),
}));
vi.mock('@/lib/colporteurApi', async (importOriginal) => ({ ...(await importOriginal()), ...api }));
vi.mock('@/lib/churchRegistryApi', async (importOriginal) => ({ ...(await importOriginal()), loadRegistry: vi.fn(async () => REG) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: ColportagemTab } = await import('./ColportagemTab');
const { default: CommissionPanel } = await import('./CommissionPanel');

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
afterEach(() => { act(() => root?.unmount()); host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); });
const byText = (scope, tag, text) => [...scope.querySelectorAll(tag)].find((b) => b.textContent.trim() === text);

describe('ColportagemTab', () => {
  it('abre nas candidaturas, com o número por decidir e a recomendação', async () => {
    api.loadColporteurAdmin.mockResolvedValue(DATA);
    const el = await mount(<ColportagemTab />);
    expect(el.textContent).toContain('1 colportores activos · 1 candidaturas por decidir');
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Maria Candidata');
    expect(rows[0].textContent).toContain('Estudante');
    expect(rows[0].textContent).toContain('Pr. Gomes João');
  });

  it('aprovar chama a função e avisa do código', async () => {
    api.loadColporteurAdmin.mockResolvedValue(DATA);
    api.setColporteurStatus.mockResolvedValue({ code: 'CPT-0002', status: 'activo' });
    const el = await mount(<ColportagemTab />);
    await act(async () => el.querySelector('tbody tr').click());
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('recomendação do pastor ainda não está confirmada');
    await act(async () => byText(dialog, 'button', 'Aprovar').click());
    expect(api.setColporteurStatus).toHaveBeenCalledWith('k1', 'activo', '');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('CPT-0002') }));
  });

  it('recusar sem motivo não chama a base de dados', async () => {
    api.loadColporteurAdmin.mockResolvedValue(DATA);
    const el = await mount(<ColportagemTab />);
    await act(async () => el.querySelector('tbody tr').click());
    const dialog = document.body.querySelector('[role="dialog"]');
    await act(async () => byText(dialog, 'button', 'Recusar').click());
    expect(api.setColporteurStatus).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/motivo/) }));
  });
});

describe('CommissionPanel', () => {
  it('a matriz mostra o que herda e o que tem regra própria', async () => {
    const el = await mount(<CommissionPanel data={DATA} run={vi.fn()} />);
    const lic = [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent.startsWith('Licenciado'));
    const cells = [...lic.querySelectorAll('button')].map((b) => [b.textContent, b.className.includes('font-bold')]);
    // Todos os modos, Consignação, Compra, Site
    expect(cells.map((c) => c[0])).toEqual(['20%', '20%', '20%', '35%']);
    expect(cells[3][1]).toBe(true);
    expect(cells[1][1]).toBe(false);
  });

  it('simular dá a percentagem do colportor', async () => {
    const el = await mount(<CommissionPanel data={DATA} run={vi.fn()} />);
    const sel = el.querySelectorAll('section')[2].querySelectorAll('select');
    await act(async () => {
      const set = (s, v) => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, v); s.dispatchEvent(new Event('change', { bubbles: true })); };
      set(sel[0], 'k2');
      set(sel[2], 'site');
    });
    expect(el.textContent).toMatch(/João Colportor.*ganha 35%/);
  });
});
