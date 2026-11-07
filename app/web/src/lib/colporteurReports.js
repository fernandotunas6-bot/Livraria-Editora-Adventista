/**
 * Colportagem — semanas, relatórios em falta, reclassificação anual e extracto da conta.
 * Código puro, testado em colporteurReports.test.js.
 */
import { resolvePct } from '@/lib/colporteurCommission';

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);

/** Segunda-feira da semana de uma data (YYYY-MM-DD), como date_trunc('week') no Postgres. */
export function weekStart(date = new Date().toISOString().slice(0, 10)) {
  const d = parse(date);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  return iso(new Date(d.getTime() - dow * DAY));
}
export const weekEnd = (start) => iso(new Date(parse(start).getTime() + 6 * DAY));
export function weekLabel(start) {
  const a = parse(start);
  const b = parse(weekEnd(start));
  const f = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${f(a)} a ${f(b)}`;
}
/** As últimas n semanas já começadas, da mais recente para trás. */
export function recentWeeks(n = 8, today = new Date().toISOString().slice(0, 10)) {
  const first = parse(weekStart(today)).getTime();
  return Array.from({ length: n }, (_, i) => iso(new Date(first - i * 7 * DAY)));
}

/**
 * Colportores activos sem relatório (enviado ou validado) nas semanas dadas.
 * Só conta semanas a partir do início de cada um.
 */
export function missingReports({ colporteurs, reports, weeks }) {
  const have = new Set(reports.filter((r) => r.status === 'enviado' || r.status === 'validado').map((r) => `${r.colporteur_id}|${r.week_start}`));
  const out = [];
  for (const c of colporteurs.filter((x) => x.status === 'activo')) {
    const missing = weeks.filter((w) => (!c.start_date || weekEnd(w) >= c.start_date) && !have.has(`${c.id}|${w}`));
    if (missing.length) out.push({ colporteur: c, weeks: missing });
  }
  return out.sort((a, b) => b.weeks.length - a.weeks.length);
}

const monthsBetween = (from, to) => {
  const a = parse(from);
  const b = parse(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
};

/**
 * Reclassificação anual (Working Policy FP 70): sugestão por colportor a partir das horas dos
 * relatórios validados. A equipa confirma uma a uma.
 * - Estudante fica estudante (plano de bolsa).
 * - Média semanal abaixo das horas de tempo inteiro (com 4 ou mais relatórios) → Tempo parcial.
 * - Meses e horas de Credenciado → Credenciado; de Licenciado → Licenciado; senão Aspirante.
 * Nunca desce de Credenciado ou Licenciado só por faltarem meses: só pelas horas semanais.
 */
export function suggestCategory({ colporteur, reports, settings, today = new Date().toISOString().slice(0, 10) }) {
  const mine = reports.filter((r) => r.colporteur_id === colporteur.id && r.status === 'validado');
  const totalHours = mine.reduce((s, r) => s + Number(r.hours || 0), 0);
  const months = colporteur.start_date ? Math.max(0, monthsBetween(colporteur.start_date, today)) : 0;
  const weeks = mine.length;
  const avg = weeks ? totalHours / weeks : 0;
  const s = {
    full: Number(settings.full_time_weekly_hours ?? 35),
    licM: Number(settings.licensed_months ?? 6), licH: Number(settings.licensed_hours ?? 600),
    credM: Number(settings.credentialed_months ?? 12), credH: Number(settings.credentialed_hours ?? 1200),
  };
  let suggested;
  let why;
  if (colporteur.category === 'estudante') {
    suggested = 'estudante';
    why = 'Plano de estudante: mantém-se.';
  } else if (weeks >= 4 && avg < s.full) {
    suggested = 'tempo_parcial';
    why = `Média de ${avg.toFixed(1)} h/semana, abaixo das ${s.full} h de tempo inteiro.`;
  } else if (months >= s.credM && totalHours >= s.credH) {
    suggested = 'credenciado';
    why = `${months} meses e ${Math.round(totalHours)} h (pede ${s.credM} meses e ${s.credH} h).`;
  } else if (months >= s.licM && totalHours >= s.licH) {
    suggested = colporteur.category === 'credenciado' ? 'credenciado' : 'licenciado';
    why = `${months} meses e ${Math.round(totalHours)} h (Licenciado pede ${s.licM} meses e ${s.licH} h).`;
  } else {
    suggested = ['licenciado', 'credenciado'].includes(colporteur.category) ? colporteur.category : 'aspirante';
    why = `${months} meses e ${Math.round(totalHours)} h: ainda não cumpre os requisitos de Licenciado.`;
  }
  return { suggested, why, months, totalHours, weeks, avg, changes: suggested !== colporteur.category };
}

/** Extracto: entradas por ordem, com o saldo depois de cada uma. */
export function ledgerWithBalance(entries) {
  let balance = 0;
  return [...entries]
    .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)) || Number(a.id) - Number(b.id))
    .map((e) => { balance = Math.round((balance + Number(e.amount)) * 100) / 100; return { ...e, balance }; });
}

export const LEDGER_KINDS = {
  entrega: 'Entrega à consignação',
  devolucao: 'Devolução',
  compra: 'Compra com desconto',
  comissao: 'Comissão',
  pagamento_recebido: 'Pagamento recebido',
  pagamento_feito: 'Pagamento ao colportor',
  ajuste: 'Correcção',
};

export const REPORT_STATUSES = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  enviado: { label: 'Por validar', tone: 'amber' },
  validado: { label: 'Validado', tone: 'green' },
  devolvido: { label: 'Devolvido', tone: 'red' },
};

/**
 * Previsão da comissão de um relatório por validar (a que conta é a da base de dados, na
 * validação): consignação × percentagem do último dia da semana.
 */
export function previewCommission({ report, colporteur, books, rules, overrides, basePct }) {
  const date = weekEnd(report.week_start);
  let value = 0;
  let commission = 0;
  for (const line of report.sales || []) {
    const b = books.get(line.book_id);
    if (!b) continue;
    const v = Number(b.price || 0) * Number(line.qty || 0);
    value += v;
    if (line.source !== 'proprio') {
      const { pct } = resolvePct({ category: colporteur?.category, productType: b.product_type || 'livro', saleMode: 'consignacao', date, rules, overrides, basePct });
      commission += Math.round(v * pct) / 100;
    }
  }
  return { value, commission };
}

export const SUMMARY_GROUPS = {
  colportor: 'Colportor',
  igreja: 'Igreja',
  distrito: 'Distrito',
  provincia: 'Província',
  campo: 'Campo',
};

/**
 * Totais da colportagem agrupados (colportor, igreja, distrito, província ou campo), a partir
 * dos relatórios validados desde `from` (YYYY-MM-DD) e, se `withSite`, das vendas no site do ano.
 * `where(c)` diz a igreja, o distrito, a província e o campo de cada colportor.
 */
export function summarize({ colporteurs, reports, overview = [], groupBy = 'colportor', from = '', withSite = false, where }) {
  const site = new Map(overview.map((o) => [o.colporteur_id, Number(o.site_year_value || 0)]));
  const groups = new Map();
  const keyOf = (c) => {
    const w = where(c);
    switch (groupBy) {
      case 'igreja': return [w.churchKey || '', w.churchLabel || 'Sem igreja'];
      case 'distrito': return [w.districtId || '', w.districtLabel || 'Sem distrito'];
      case 'provincia': return [w.provinceId || '', w.provinceLabel || 'Sem província'];
      case 'campo': return [w.fieldId || '', w.fieldLabel || 'Sem campo'];
      default: return [c.id, `${c.code || ''} ${c.full_name}`.trim()];
    }
  };
  const row = (c) => {
    const [key, label] = keyOf(c);
    if (!groups.has(key)) {
      groups.set(key, { key, label, colporteurs: new Set(), active: 0, reports: 0, hours: 0, visits: 0, bibleStudies: 0, baptisms: 0, interests: 0, sales: 0, commission: 0, site: 0 });
    }
    return groups.get(key);
  };
  const byId = new Map(colporteurs.map((c) => [c.id, c]));
  for (const c of colporteurs.filter((x) => x.code)) {
    const g = row(c);
    g.colporteurs.add(c.id);
    if (c.status === 'activo') g.active += 1;
    if (withSite) g.site += site.get(c.id) || 0;
  }
  for (const r of reports) {
    if (r.status !== 'validado' || (from && String(r.week_start) < from)) continue;
    const c = byId.get(r.colporteur_id);
    if (!c) continue;
    const g = row(c);
    g.reports += 1;
    g.hours += Number(r.hours || 0);
    g.visits += Number(r.visits || 0);
    g.bibleStudies += Number(r.bible_studies || 0);
    g.baptisms += Number(r.baptisms || 0);
    g.interests += Number(r.interests || 0);
    g.sales += Number(r.sales_value || 0);
    g.commission += Number(r.commission_value || 0);
  }
  const rows = [...groups.values()].map(({ colporteurs: set, ...g }) => ({ ...g, count: set.size, total: g.sales + g.site }));
  const totals = rows.reduce((t, g) => {
    for (const k of ['count', 'active', 'reports', 'hours', 'visits', 'bibleStudies', 'baptisms', 'interests', 'sales', 'commission', 'site', 'total']) t[k] = (t[k] || 0) + g[k];
    return t;
  }, {});
  return { rows: rows.sort((a, b) => b.total - a.total || b.hours - a.hours || a.label.localeCompare(b.label)), totals };
}
