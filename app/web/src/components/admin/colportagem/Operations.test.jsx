import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O primeiro render (Radix no jsdom) pode passar dos 5 s numa máquina carregada.
vi.setConfig({ testTimeout: 30000 });

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const api = vi.hoisted(() => ({ validateReport: vi.fn(), returnReport: vi.fn(), saveReport: vi.fn(), issueDocument: vi.fn() }));
vi.mock('@/lib/colporteurApi', async (importOriginal) => ({ ...(await importOriginal()), ...api }));

const { default: ReportForm, EMPTY_REPORT, reportPayload } = await import('@/components/colportagem/ReportForm');
const { default: ReportsPanel } = await import('./ReportsPanel');
const { default: GuidesPanel } = await import('./GuidesPanel');
const { pickWeek } = await import('@/components/colportagem/ColporteurWorkspace');

const BOOKS = [
  { id: 'b1', title: 'O Grande Conflito', book_code: 'COL-001', price: 1000, stock: 40, product_type: 'livro', hasVariants: false },
  { id: 'b2', title: 'Bíblia de Estudo', book_code: 'BIB-001', price: 5000, stock: 8, product_type: 'biblia', hasVariants: false },
  { id: 'b3', title: 'T-shirt', book_code: 'VES-001', price: 2000, stock: 30, product_type: 'vestuario', hasVariants: true },
];
const IN_HAND = [{ book_id: 'b1', title: 'O Grande Conflito', book_code: 'COL-001', qty: 2, unit_price: 1000 }];
const DATA = {
  colporteurs: [{ id: 'k1', code: 'CPT-0001', full_name: 'João Colportor', phone: '923000111', status: 'activo', category: 'aspirante', credit_limit: null, start_date: '2026-01-01' }],
  rules: [{ id: 'r1', category: null, product_type: null, sale_mode: null, pct: 30, valid_from: '2026-01-01', valid_to: null }],
  overrides: [],
  settings: { base_pct: 0, default_credit_limit: 0 },
};
const OPS = {
  overview: [{ colporteur_id: 'k1', balance: 2000, in_hand: IN_HAND, in_hand_value: 2000 }],
  reports: [{ id: 'r1', colporteur_id: 'k1', week_start: '2026-11-02', status: 'enviado', hours: 30, visits: 40, prayers: 5, free_literature: 0, bible_studies: 2, interests: 1, baptisms: 0,
    sales: [{ book_id: 'b1', qty: 2, source: 'consignacao' }], interest_contacts: [{ name: 'Ana', phone: '923999000' }], notes: '' }],
  documents: [],
  ledger: [],
};

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
const byText = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const typeInto = async (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('ReportForm', () => {
  function Harness({ onValue }) {
    const [v, setV] = useState({ ...EMPTY_REPORT, week_start: '2026-11-02' });
    onValue(v);
    return <ReportForm value={v} onChange={setV} inHand={IN_HAND} books={BOOKS} weeks={['2026-11-02', '2026-10-26']} />;
  }
  it('não deixa vender mais do que tem à consignação', async () => {
    let last;
    const el = await mount(<Harness onValue={(v) => { last = v; }} />);
    const plus = el.querySelector('button[aria-label="Mais O Grande Conflito"]');
    await act(async () => { plus.click(); });
    await act(async () => { plus.click(); });
    expect(plus.disabled).toBe(true);
    expect(last.sales).toEqual([{ book_id: 'b1', qty: 2, source: 'consignacao' }]);
    expect(el.textContent).toContain('Vendido à consignação');
  });
  it('stock próprio: procura, não mostra produtos com variantes, conta à parte', async () => {
    let last;
    const el = await mount(<Harness onValue={(v) => { last = v; }} />);
    const search = el.querySelector('input[placeholder^="Procurar livro"]');
    await typeInto(search, 'bí');
    const opt = [...el.querySelectorAll('li button')].find((b) => b.textContent.includes('Bíblia'));
    await act(async () => opt.click());
    expect(last.sales).toEqual([{ book_id: 'b2', qty: 1, source: 'proprio' }]);
    await typeInto(search, 't-sh');
    expect([...el.querySelectorAll('li button')].some((b) => b.textContent.includes('T-shirt'))).toBe(false);
  });
  it('payload: números e interessados contados', () => {
    const p = reportPayload({ ...EMPTY_REPORT, week_start: '2026-11-02', hours: '12.5', interests: '', interest_contacts: [{ name: 'Ana' }, { name: ' ' }] });
    expect(p.hours).toBe(12.5);
    expect(p.visits).toBe(0);
    expect(p.interests).toBe(1);
  });
  it('a semana a preencher é a mais antiga das três últimas sem relatório enviado', () => {
    const weeks = ['2026-11-02', '2026-10-26', '2026-10-19'];
    expect(pickWeek([{ week_start: '2026-10-19', status: 'validado' }], weeks)).toBe('2026-10-26');
    expect(pickWeek([], weeks)).toBe('2026-10-19');
    expect(pickWeek(weeks.map((w) => ({ week_start: w, status: 'enviado' })), weeks)).toBe('2026-11-02');
  });
});

describe('ReportsPanel', () => {
  it('mostra a comissão prevista e valida', async () => {
    api.validateReport.mockResolvedValue({ sales_value: 2000, commission: 600 });
    const run = vi.fn(async (fn) => fn());
    const el = await mount(<ReportsPanel data={DATA} ops={OPS} books={BOOKS} run={run} />);
    const row = el.querySelector('tbody tr');
    expect(row.textContent).toContain('João Colportor');
    expect(row.textContent).toMatch(/600 Kz/);
    await act(async () => row.click());
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('Ana');
    await act(async () => byText(dialog, 'Validar').click());
    expect(api.validateReport).toHaveBeenCalledWith('r1');
  });
});

describe('GuidesPanel', () => {
  it('entrega: escolhe livros, mostra o saldo depois e emite', async () => {
    api.issueDocument.mockResolvedValue({ number: 'GUI-000001' });
    const run = vi.fn(async (fn) => fn());
    const el = await mount(<GuidesPanel data={DATA} ops={OPS} books={BOOKS} run={run} />);
    const selects = el.querySelectorAll('select');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(selects[1], 'k1');
      selects[1].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await typeInto(el.querySelector('input[placeholder^="Procurar livro"]'), 'conflito');
    await act(async () => [...el.querySelectorAll('li button')].find((b) => b.textContent.includes('Conflito')).click());
    expect(el.textContent).toMatch(/Saldo depois da guia: 3[\s.,]?000/);
    await act(async () => byText(el, 'Emitir guia').click());
    expect(api.issueDocument).toHaveBeenCalledWith({ colporteurId: 'k1', kind: 'entrega', lines: [{ book_id: 'b1', qty: 1 }], notes: '' });
  });
});
