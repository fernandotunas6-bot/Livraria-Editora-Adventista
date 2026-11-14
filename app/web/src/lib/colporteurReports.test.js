import { describe, expect, it } from 'vitest';
import {
  ledgerWithBalance, missingReports, monthBounds, monthLabel, monthWeeks, previewCommission, recentWeeks, reportMonths, suggestCategory, summarize,
  weekEnd, weekLabel, weekMonth, weekStart,
} from '@/lib/colporteurReports';
import { documentHtml, statementHtml, summaryHtml } from '@/lib/colporteurPrint';

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
  it('por loja: quantos colportores tem cada uma, e os sem loja à parte', () => {
    const lojas = { a: ['hua', 'Livraria Adventista — Huambo'], b: ['hua', 'Livraria Adventista — Huambo'] };
    const comLoja = (c) => ({ ...where(c), storeId: lojas[c.id]?.[0] || '', storeLabel: lojas[c.id]?.[1] || '' });
    const outro = [...colporteurs, { id: 'c', code: 'CPT-0003', full_name: 'Carla', status: 'activo', church_id: 'c2' }];
    const { rows } = summarize({ colporteurs: outro, reports, where: comLoja, groupBy: 'loja' });
    expect(rows.map((r) => [r.label, r.count, r.hours])).toEqual(expect.arrayContaining([['Livraria Adventista — Huambo', 2, 50], ['Sem loja', 1, 0]]));
  });
});

describe('meses (relatório mensal)', () => {
  it('cada semana conta para o mês da sua quinta-feira', () => {
    expect(weekMonth('2026-10-26')).toBe('2026-10'); // quinta 29/10
    expect(weekMonth('2026-11-30')).toBe('2026-12'); // quinta 03/12
    expect(weekMonth('2026-09-28')).toBe('2026-10'); // quinta 01/10
  });
  it('Novembro de 2026 tem 4 semanas (02/11 a 29/11); Outubro tem 5', () => {
    expect(monthWeeks('2026-11')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(monthWeeks('2026-10')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(monthWeeks('2027-01')).toEqual(['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
  });
  it('num ano, nenhuma semana fica de fora nem conta duas vezes', () => {
    const doAno = Array.from({ length: 12 }, (_, i) => monthWeeks(`2026-${String(i + 1).padStart(2, '0')}`)).flat();
    expect(new Set(doAno).size).toBe(doAno.length);
    expect(doAno[0]).toBe('2025-12-29'); // a quinta 01/01/2026 está nessa semana
    expect(doAno.at(-1)).toBe('2026-12-28');
    for (let i = 1; i < doAno.length; i += 1) expect(Date.parse(doAno[i]) - Date.parse(doAno[i - 1])).toBe(7 * 86400000);
  });
  it('nome e dias do mês civil (para as encomendas do site)', () => {
    expect(monthLabel('2026-11')).toBe('Novembro de 2026');
    expect(monthBounds('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('os meses a escolher: do actual até ao primeiro com relatórios ou colportores', () => {
    expect(reportMonths({ today: '2026-11-14' })).toEqual(['2026-11']);
    const r = reportMonths({ reports: [{ week_start: '2026-08-31' }], colporteurs: [{ start_date: '2026-10-01' }], today: '2026-11-14' });
    expect(r).toEqual(['2026-11', '2026-10', '2026-09']); // a semana de 31/08 é de Setembro
    expect(reportMonths({ colporteurs: [{ start_date: '2025-12-15' }], today: '2026-02-01' })).toEqual(['2026-02', '2026-01', '2025-12']);
    expect(reportMonths({ colporteurs: [{ start_date: '2000-01-01' }], today: '2026-11-14' })).toHaveLength(60);
  });
});

describe('summarize num mês', () => {
  const colporteurs = [
    { id: 'a', code: 'CPT-0001', full_name: 'Ana', status: 'activo' },
    { id: 'b', code: 'CPT-0002', full_name: 'Bento', status: 'activo' },
  ];
  const where = () => ({});
  const reports = [
    { colporteur_id: 'a', status: 'validado', week_start: '2026-10-26', hours: 10, prayers: 9, free_literature: 9, sales_value: 9, commission_value: 9 }, // Outubro
    { colporteur_id: 'a', status: 'validado', week_start: '2026-11-02', hours: 30, visits: 40, prayers: 12, free_literature: 5, bible_studies: 2, interests: 3, baptisms: 1, sales_value: 10000, commission_value: 3000 },
    { colporteur_id: 'a', status: 'validado', week_start: '2026-11-23', hours: 20, prayers: 8, free_literature: 1, sales_value: 2000, commission_value: 600 },
    { colporteur_id: 'a', status: 'validado', week_start: '2026-11-30', hours: 99, sales_value: 99 }, // Dezembro
    { colporteur_id: 'b', status: 'enviado', week_start: '2026-11-09', hours: 25, sales_value: 5000 }, // por validar
  ];
  const weeks = monthWeeks('2026-11');
  it('só as semanas do mês, com as orações e a literatura oferecida', () => {
    const { rows, totals } = summarize({ colporteurs, reports, where, from: weeks[0], to: weeks.at(-1) });
    const a = rows.find((r) => r.key === 'a');
    expect(a).toMatchObject({ reports: 2, hours: 50, visits: 40, prayers: 20, freeLiterature: 6, bibleStudies: 2, interests: 3, baptisms: 1, sales: 12000, commission: 3600 });
    expect(rows.find((r) => r.key === 'b')).toMatchObject({ reports: 0, hours: 0 });
    expect(totals).toMatchObject({ reports: 2, hours: 50, prayers: 20, freeLiterature: 6, totalCommission: 3600 });
  });
  it('com as vendas no site do período: valor e comissão somam-se à parte e no total', () => {
    const sitePeriod = [{ colporteur_id: 'b', orders: 2, value: 8000, commission: 800 }, { colporteur_id: 'a', orders: 1, value: '1500', commission: '150' }];
    const { rows, totals } = summarize({ colporteurs, reports, where, from: weeks[0], to: weeks.at(-1), withSite: true, sitePeriod, overview: [{ colporteur_id: 'a', site_year_value: 999999 }] });
    expect(rows.map((r) => [r.key, r.site, r.siteCommission, r.total, r.totalCommission])).toEqual([['a', 1500, 150, 13500, 3750], ['b', 8000, 800, 8000, 800]]);
    expect(totals).toMatchObject({ site: 9500, siteCommission: 950, total: 21500, commission: 3600, totalCommission: 4550 });
  });
  it('a impressão do relatório mensal: semanas por colportor, totais e textos escapados', () => {
    const { rows, totals } = summarize({ colporteurs: [...colporteurs, { id: 'c', code: 'CPT-0003', full_name: '<Carla>', status: 'activo' }], reports, where, from: weeks[0], to: weeks.at(-1), withSite: true, sitePeriod: [] });
    const html = summaryHtml({ title: 'Relatório da colportagem', period: 'Novembro de 2026', groupLabel: 'Colportor', rows, totals, weeks: 4, withSite: true, notes: ['Contam só os <validados>.'] });
    expect(html).toContain('Relatório da colportagem · Novembro de 2026');
    expect(html).toContain('size:A4 landscape');
    expect(html).toContain('>2/4<'); // Ana: 2 relatórios nas 4 semanas
    expect(html).toContain('CPT-0003 &lt;Carla&gt;');
    expect(html).toContain('Contam só os &lt;validados&gt;.');
    expect(html).toMatch(/<tr class="tot"><td>Total<\/td><td class="n">2<\/td>/);
    expect(html).toContain('No site');
    expect(summaryHtml({ title: 'T', period: 'P', groupLabel: 'Igreja', rows, totals })).not.toContain('No site');
  });
});
