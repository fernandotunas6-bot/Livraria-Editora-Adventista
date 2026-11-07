import { describe, expect, it } from 'vitest';
import {
  ledgerWithBalance, missingReports, previewCommission, recentWeeks, suggestCategory, summarize, weekEnd, weekLabel, weekStart,
} from '@/lib/colporteurReports';
import { documentHtml, statementHtml } from '@/lib/colporteurPrint';

describe('semanas', () => {
  it('a semana começa à segunda, como no Postgres', () => {
    expect(weekStart('2026-11-04')).toBe('2026-11-02'); // quarta
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // segunda
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(weekEnd('2026-11-02')).toBe('2026-11-08');
    expect(weekLabel('2026-12-28')).toBe('28/12 a 03/01');
  });
  it('últimas semanas', () => {
    expect(recentWeeks(3, '2026-11-06')).toEqual(['2026-11-02', '2026-10-26', '2026-10-19']);
  });
});

describe('missingReports', () => {
  const colporteurs = [
    { id: 'a', status: 'activo', start_date: '2026-01-01' },
    { id: 'b', status: 'activo', start_date: '2026-10-30' },
    { id: 'c', status: 'suspenso', start_date: '2026-01-01' },
  ];
  const reports = [
    { colporteur_id: 'a', week_start: '2026-10-26', status: 'validado' },
    { colporteur_id: 'a', week_start: '2026-10-19', status: 'rascunho' },
  ];
  it('só activos, só semanas depois do início, rascunho conta como em falta', () => {
    const m = missingReports({ colporteurs, reports, weeks: ['2026-10-26', '2026-10-19'] });
    expect(m).toEqual([{ colporteur: colporteurs[0], weeks: ['2026-10-19'] }, { colporteur: colporteurs[1], weeks: ['2026-10-26'] }]);
  });
});

describe('suggestCategory', () => {
  const settings = { full_time_weekly_hours: 35, licensed_months: 6, licensed_hours: 600, credentialed_months: 12, credentialed_hours: 1200 };
  const weeks = (id, n, hours) => Array.from({ length: n }, (_, i) => ({ colporteur_id: id, status: 'validado', hours, week_start: `w${i}` }));
  it('aspirante com 7 meses e 640 h → licenciado', () => {
    const r = suggestCategory({ colporteur: { id: 'x', category: 'aspirante', start_date: '2026-03-01' }, reports: weeks('x', 16, 40), settings, today: '2026-10-15' });
    expect(r.suggested).toBe('licenciado');
    expect(r.changes).toBe(true);
  });
  it('13 meses e 1 280 h → credenciado', () => {
    const r = suggestCategory({ colporteur: { id: 'x', category: 'licenciado', start_date: '2025-09-01' }, reports: weeks('x', 32, 40), settings, today: '2026-10-15' });
    expect(r.suggested).toBe('credenciado');
  });
  it('média abaixo de tempo inteiro → tempo parcial', () => {
    const r = suggestCategory({ colporteur: { id: 'x', category: 'licenciado', start_date: '2025-01-01' }, reports: weeks('x', 20, 15), settings, today: '2026-10-15' });
    expect(r.suggested).toBe('tempo_parcial');
    expect(r.why).toMatch(/15\.0 h\/semana/);
  });
  it('estudante mantém-se; poucos relatórios não fazem descer', () => {
    expect(suggestCategory({ colporteur: { id: 'x', category: 'estudante', start_date: '2025-01-01' }, reports: weeks('x', 20, 5), settings }).suggested).toBe('estudante');
    expect(suggestCategory({ colporteur: { id: 'x', category: 'licenciado', start_date: '2026-09-01' }, reports: weeks('x', 2, 5), settings, today: '2026-10-15' }).suggested).toBe('licenciado');
  });
});

describe('ledgerWithBalance', () => {
  it('ordena por data e acumula sem erros de arredondamento', () => {
    const rows = ledgerWithBalance([
      { id: 3, entry_date: '2026-11-08', amount: '-1800.00' },
      { id: 1, entry_date: '2026-11-01', amount: '20000.00' },
      { id: 4, entry_date: '2026-11-09', amount: '-0.10' },
      { id: 5, entry_date: '2026-11-09', amount: '-0.20' },
    ]);
    expect(rows.map((r) => r.balance)).toEqual([20000, 18200, 18199.9, 18199.7]);
  });
});

describe('previewCommission', () => {
  it('só a consignação dá comissão, com a percentagem do fim da semana', () => {
    const books = new Map([['b1', { price: 1000, product_type: 'livro' }], ['b2', { price: 5000, product_type: 'biblia' }]]);
    const rules = [
      { category: null, product_type: null, sale_mode: 'consignacao', pct: 30, valid_from: '2026-01-01', valid_to: null },
      { category: null, product_type: 'biblia', sale_mode: 'consignacao', pct: 20, valid_from: '2026-01-01', valid_to: null },
    ];
    const r = previewCommission({
      report: { week_start: '2026-11-02', sales: [{ book_id: 'b1', qty: 6 }, { book_id: 'b2', qty: 1, source: 'proprio' }, { book_id: 'b2', qty: 2, source: 'consignacao' }] },
      colporteur: { category: 'aspirante' }, books, rules, overrides: [], basePct: 0,
    });
    expect(r).toEqual({ value: 21000, commission: 1800 + 2000 });
  });
});

describe('impressão', () => {
  it('guia de compra com desconto e texto escapado', () => {
    const html = documentHtml({
      doc: { number: 'GUI-000007', kind: 'compra', created: '2026-11-06T10:00:00Z', notes: '<b>x</b>', amount: 3000, discount_value: 2000,
        lines: [{ book_code: 'COL-001', title: 'O Grande <Conflito>', qty: 5, unit_price: 1000, pct: 40 }] },
      colporteur: { code: 'CPT-0001', full_name: 'João', phone: '923000111' },
    });
    expect(html).toContain('GUI-000007');
    expect(html).toContain('O Grande &lt;Conflito&gt;');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Total a pagar');
  });
  it('extracto diz quem deve a quem', () => {
    const html = statementHtml({ colporteur: { code: 'CPT-0001', full_name: 'João' }, entries: [{ id: 1, entry_date: '2026-11-01', kind: 'entrega', amount: 1000, description: 'GUI-1' }] });
    expect(html).toContain('O colportor deve à Livraria');
  });
});

describe('summarize', () => {
  const colporteurs = [
    { id: 'a', code: 'CPT-0001', full_name: 'Ana', status: 'activo', church_id: 'c1' },
    { id: 'b', code: 'CPT-0002', full_name: 'Bento', status: 'activo', church_id: 'c2' },
    { id: 'x', code: null, full_name: 'Candidato', status: 'candidatura', church_id: 'c1' },
  ];
  const churches = { c1: { name: 'Central Huambo', district: 'd1' }, c2: { name: 'Central Cuito', district: 'd2' } };
  const districts = { d1: 'Distrito Centro (Huambo)', d2: 'Distrito Centro (Bié)' };
  const where = (c) => ({ churchKey: c.church_id, churchLabel: churches[c.church_id]?.name, districtId: churches[c.church_id]?.district, districtLabel: districts[churches[c.church_id]?.district] });
  const reports = [
    { colporteur_id: 'a', status: 'validado', week_start: '2026-10-05', hours: 30, visits: 40, bible_studies: 2, baptisms: 1, interests: 3, sales_value: 10000, commission_value: 3000 },
    { colporteur_id: 'a', status: 'enviado', week_start: '2026-10-12', hours: 99, sales_value: 99999 },
    { colporteur_id: 'b', status: 'validado', week_start: '2026-01-05', hours: 20, sales_value: 5000, commission_value: 1500 },
  ];
  it('por colportor: só relatórios validados, candidatos de fora', () => {
    const { rows, totals } = summarize({ colporteurs, reports, where });
    expect(rows.map((r) => [r.label, r.hours, r.sales])).toEqual([['CPT-0001 Ana', 30, 10000], ['CPT-0002 Bento', 20, 5000]]);
    expect(totals).toMatchObject({ count: 2, active: 2, hours: 50, commission: 4500 });
  });
  it('por distrito, com período e vendas no site', () => {
    const { rows } = summarize({ colporteurs, reports, where, groupBy: 'distrito', from: '2026-06-01', withSite: true, overview: [{ colporteur_id: 'b', site_year_value: 8000 }] });
    expect(rows.map((r) => [r.label, r.hours, r.site, r.total])).toEqual([['Distrito Centro (Huambo)', 30, 0, 10000], ['Distrito Centro (Bié)', 0, 8000, 8000]]);
  });
});
