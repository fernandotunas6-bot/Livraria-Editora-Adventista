import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexRegistry } from '@/lib/churchRegistryApi';

// A lista de interessados para os pastores: por distrito, o WhatsApp para o pastor, os filtros,
// a impressão e o Excel.
vi.setConfig({ testTimeout: 30000 });

const print = vi.hoisted(() => ({ openPrint: vi.fn(() => true) }));
vi.mock('@/lib/colporteurPrint', async (importOriginal) => ({ ...(await importOriginal()), ...print }));
const registry = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock('@/lib/churchRegistryApi', async (importOriginal) => ({ ...(await importOriginal()), ...registry }));

const { default: InterestsPanel, interestPeriod } = await import('./InterestsPanel');

const IDX = indexRegistry({
  fields: [], municipalities: [],
  provinces: [{ id: 'huambo', name: 'Huambo' }],
  districts: [{ id: 'd1', name: 'Distrito Centro', province_id: 'huambo' }, { id: 'd2', name: 'Distrito Sul', province_id: 'huambo' }],
  churches: [{ id: 'c1', name: 'Igreja Central', district_id: 'd1' }, { id: 'c2', name: 'Igreja da Calenga', district_id: 'd2' }],
  pastors: [{ id: 'p1', name: 'João Kalandula', title: 'Pr.', phone: '923456789' }],
  assignments: [{ pastor_id: 'p1', district_id: 'd1', kind: 'titular', start_date: '2026-01-01', end_date: null }],
});
const DATA = { colporteurs: [
  { id: 'a', code: 'CPT-0001', full_name: 'Ana Chilombo', church_id: 'c1', start_date: '2026-10-01' },
  { id: 'b', code: 'CPT-0002', full_name: 'Bento Kalunga', church_id: 'c2', start_date: '2026-10-01' },
] };
const OPS = { reports: [
  { id: 'r1', colporteur_id: 'a', week_start: '2026-11-09', status: 'validado', interest_contacts: [{ name: 'Maria João', phone: '923000111', place: 'Académico', request: 'Estudos bíblicos' }] },
  { id: 'r2', colporteur_id: 'b', week_start: '2026-11-02', status: 'enviado', interest_contacts: [{ name: 'Rosa Sapalo', phone: '924000222', place: 'Calenga' }] },
  { id: 'r3', colporteur_id: 'a', week_start: '2026-10-05', status: 'validado', interest_contacts: [{ name: 'Outubro Antigo', phone: '925000333' }] },
] };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<InterestsPanel data={DATA} ops={OPS} idx={IDX} />));
  return host;
}
const choose = async (select, value) => act(async () => {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
const section = (el, label) => el.querySelector(`section[aria-label="Interessados · ${label}"]`);
const button = (scope, text) => [...scope.querySelectorAll('button, a')].find((b) => b.textContent.trim() === text);

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

describe('interestPeriod', () => {
  it('as últimas 4 semanas, com a corrente; um mês pelas suas semanas', () => {
    expect(interestPeriod('recentes', '', '2026-11-14')).toMatchObject({ from: '2026-10-19', to: '2026-11-09', label: 'semanas de 19/10 a 15/11' });
    expect(interestPeriod('mes', '2026-11', '2026-11-14')).toMatchObject({ from: '2026-11-02', to: '2026-11-23', label: 'Novembro de 2026' });
  });
});

describe('InterestsPanel', () => {
  it('por distrito, com o pastor e o WhatsApp; sem pastor, o aviso', async () => {
    const el = await mount();
    expect(el.textContent).toContain('2 interessados em 2 distritos');
    expect(el.textContent).toContain('1 vem de um relatório ainda por validar.');
    const centro = section(el, 'Distrito Centro · Huambo');
    expect(centro.textContent).toContain('Pr. João Kalandula');
    expect(centro.textContent).toContain('Maria João');
    expect(centro.textContent).toContain('923 000 111');
    const wa = button(centro, 'Enviar ao pastor');
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/244923456789\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href'))).toContain('Maria João — 923 000 111 — Académico — Estudos bíblicos');
    const sul = section(el, 'Distrito Sul · Huambo');
    expect(sul.textContent).toContain('Sem pastor no registo.');
    expect(button(sul, 'Enviar ao pastor').disabled).toBe(true);
    expect(el.textContent).toContain('Um distrito não tem pastor no registo.');
    expect(el.textContent).not.toContain('Outubro Antigo'); // fora das últimas 4 semanas
  });

  it('filtrar por distrito e procurar', async () => {
    const el = await mount();
    await choose(el.querySelector('select[aria-label="Distrito"]'), 'd2');
    expect(section(el, 'Distrito Centro · Huambo')).toBeNull();
    expect(section(el, 'Distrito Sul · Huambo')).not.toBeNull();
    await choose(el.querySelector('select[aria-label="Distrito"]'), 'all');
    const procurar = el.querySelector('input[aria-label="Procurar"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(procurar, 'academico');
      procurar.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(el.textContent).toContain('Maria João');
    expect(el.textContent).not.toContain('Rosa Sapalo');
  });

  it('um mês: Outubro tem o interessado antigo', async () => {
    const el = await mount();
    await choose(el.querySelector('select[aria-label="Período"]'), 'mes');
    await choose(el.querySelector('select[aria-label="Mês"]'), '2026-10');
    expect(el.textContent).toContain('Outubro Antigo');
    expect(el.textContent).not.toContain('Maria João');
  });

  it('imprimir um distrito ou todos, e o Excel', async () => {
    const el = await mount();
    await act(async () => button(section(el, 'Distrito Centro · Huambo'), 'Imprimir').click());
    expect(print.openPrint.mock.calls[0][0]).toContain('Interessados · Distrito Centro · Huambo');
    expect(print.openPrint.mock.calls[0][0]).not.toContain('Distrito Sul');
    await act(async () => button(el.querySelector('.ml-auto'), 'Imprimir').click());
    expect(print.openPrint.mock.calls[1][0]).toContain('Distrito Sul');
    await act(async () => button(el, 'Excel').click());
    const [nome, cabecalho, linhas] = registry.downloadCsv.mock.calls[0];
    expect(nome).toBe('interessados-colportagem-recentes-2026-11-09');
    expect(cabecalho.slice(0, 4)).toEqual(['Distrito', 'Pastor', 'Telefone do pastor', 'Nome']);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].slice(0, 4)).toEqual(['Distrito Centro · Huambo', 'Pr. João Kalandula', '923456789', 'Maria João']);
  });
});
