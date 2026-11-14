import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O relatório mensal no Resumo da colportagem: escolher o mês, as semanas que contam, as vendas
// no site do mês, os relatórios por validar, a impressão e o Excel.
vi.setConfig({ testTimeout: 30000 });

const api = vi.hoisted(() => ({ colporteurSitePeriod: vi.fn() }));
vi.mock('@/lib/colporteurApi', async (importOriginal) => ({ ...(await importOriginal()), ...api }));
const print = vi.hoisted(() => ({ openPrint: vi.fn(() => true) }));
vi.mock('@/lib/colporteurPrint', async (importOriginal) => ({ ...(await importOriginal()), ...print }));
const registry = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock('@/lib/churchRegistryApi', async (importOriginal) => ({ ...(await importOriginal()), ...registry }));

const { default: SummaryPanel, periodOf } = await import('./SummaryPanel');

const DATA = {
  colporteurs: [
    { id: 'a', code: 'CPT-0001', full_name: 'Ana Colportora', status: 'activo', start_date: '2026-09-01' },
    { id: 'b', code: 'CPT-0002', full_name: 'Bento Colportor', status: 'activo', start_date: '2026-10-01' },
  ],
  stores: [],
};
const OPS = {
  overview: [],
  reports: [
    { id: 'r0', colporteur_id: 'a', status: 'validado', week_start: '2026-10-26', hours: 10, visits: 5, prayers: 1, free_literature: 2, sales_value: 1000, commission_value: 300 },
    { id: 'r1', colporteur_id: 'a', status: 'validado', week_start: '2026-11-02', hours: 30, visits: 40, prayers: 12, free_literature: 5, bible_studies: 2, interests: 3, baptisms: 1, sales_value: 10000, commission_value: 3000 },
    { id: 'r2', colporteur_id: 'a', status: 'validado', week_start: '2026-11-23', hours: 20, visits: 10, prayers: 8, free_literature: 1, sales_value: 2000, commission_value: 600 },
    { id: 'r3', colporteur_id: 'b', status: 'enviado', week_start: '2026-11-09', hours: 25, sales_value: 5000 },
  ],
};
const IDX = {
  churchesById: new Map(), districts: new Map(),
  districtName: () => '', provinceName: () => '', fieldName: () => '',
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<SummaryPanel data={DATA} ops={OPS} reg={{ churches: [] }} idx={IDX} />));
  return host;
}
const choose = async (select, value) => act(async () => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
const rowOf = (el, text) => [...el.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(text));
const cellsOf = (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('periodOf', () => {
  it('um mês: as semanas com a quinta-feira no mês, e o mês civil para o site', () => {
    expect(periodOf('mes', '2026-11', '2026-11-14')).toMatchObject({
      key: '2026-11', label: 'Novembro de 2026', from: '2026-11-02', to: '2026-11-23', siteFrom: '2026-11-01', siteTo: '2026-11-30',
    });
    expect(periodOf('ano', '2026-11', '2026-11-14')).toMatchObject({ from: '2026-01-01', to: '', siteFrom: '2026-01-01', siteTo: '2026-11-14' });
  });
});

describe('SummaryPanel: relatório mensal', () => {
  it('Novembro de 2026: 4 semanas, vendas no site do mês, relatório por validar, imprimir e Excel', async () => {
    api.colporteurSitePeriod.mockImplementation(async (from) => (from === '2026-11-01'
      ? [{ colporteur_id: 'b', orders: 2, value: 8000, commission: 800 }]
      : []));
    const el = await mount();
    await choose(el.querySelector('select[aria-label="Período"]'), 'mes');
    const mes = el.querySelector('select[aria-label="Mês"]');
    expect([...mes.options].map((o) => o.textContent)).toEqual(['Novembro de 2026', 'Outubro de 2026', 'Setembro de 2026']);
    expect(mes.value).toBe('2026-11');
    expect(api.colporteurSitePeriod).toHaveBeenLastCalledWith('2026-11-01', '2026-11-30');

    // Ana: os dois relatórios validados de Novembro (o de 26/10 é de Outubro).
    const ana = cellsOf(rowOf(el, 'Ana Colportora'));
    expect(ana.slice(1, 9)).toEqual(['2/4', '50', '50', '20', '6', '2', '3', '1']);
    expect(ana.at(-1)).toMatch(/^3[\s.]?600 Kz$/);
    // Bento: o relatório dele está por validar e não conta; as vendas no site do mês, sim.
    const bento = cellsOf(rowOf(el, 'Bento Colportor'));
    expect(bento[1]).toBe('0/4');
    expect(bento.at(-2)).toMatch(/^8[\s.]?000 Kz$/);
    expect(bento.at(-1)).toMatch(/^800 Kz$/);
    expect(cellsOf(rowOf(el, 'Total')).slice(0, 3)).toEqual(['Total', '2', '50']);
    expect(el.textContent).toContain('1 relatório deste período está por validar e ainda não conta.');
    expect(el.textContent).toContain('as 4 semanas com a quinta-feira no mês (de 02/11 a 29/11)');
    expect(el.textContent).toContain('Horas · Novembro de 2026');

    await act(async () => [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Imprimir')).click());
    const html = print.openPrint.mock.calls[0][0];
    expect(html).toContain('Relatório da colportagem · Novembro de 2026');
    expect(html).toContain('2/4');
    expect(html).toContain('No site');
    expect(html).toContain('1 relatório deste período está por validar');

    await act(async () => [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Excel')).click());
    const [nome, cabecalho, linhas] = registry.downloadCsv.mock.calls[0];
    expect(nome).toBe('resumo-colportagem-colportor-2026-11');
    expect(cabecalho).toEqual(expect.arrayContaining(['Orações', 'Literatura oferecida', 'Vendas no site', 'Comissão no site', 'Comissão total']));
    expect(linhas.at(-1)[0]).toBe('Total · Novembro de 2026');

    // Outubro: a semana de 26/10, e as vendas no site de Outubro.
    await choose(mes, '2026-10');
    expect(api.colporteurSitePeriod).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31');
    expect(cellsOf(rowOf(el, 'Ana Colportora')).slice(1, 3)).toEqual(['1/5', '10']);
    expect(el.textContent).not.toContain('por validar e ainda não conta');
  });

  it('sem a migração: o mês sai sem vendas no site, e o ecrã diz porquê', async () => {
    api.colporteurSitePeriod.mockResolvedValue(null);
    const el = await mount();
    expect(el.querySelector('thead').textContent).toContain('No site'); // «Este ano» usa o total do ano
    await choose(el.querySelector('select[aria-label="Período"]'), 'mes');
    expect(el.querySelector('thead').textContent).not.toContain('No site');
    expect(el.textContent).toContain('As vendas no site só entram na vista «Este ano»');
  });

  it('um erro ao ler as vendas no site aparece, e o resto do relatório continua', async () => {
    api.colporteurSitePeriod.mockRejectedValue(new Error('Sem acesso.'));
    const el = await mount();
    await choose(el.querySelector('select[aria-label="Período"]'), 'mes');
    expect(el.textContent).toContain('Vendas no site: Sem acesso.');
    expect(cellsOf(rowOf(el, 'Ana Colportora'))[1]).toBe('2/4');
  });
});
