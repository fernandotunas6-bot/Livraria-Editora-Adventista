// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

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

// --- Meses (relatório mensal) ---------------------------------------------------------------------
// Os relatórios são semanais (segunda a domingo) e uma semana pode ter dias de dois meses. Para o
// relatório mensal, cada semana conta inteira para o mês da sua quinta-feira (a regra das semanas
// ISO): o mês tem 4 ou 5 semanas, e nenhuma fica de fora nem conta duas vezes.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** O mês (YYYY-MM) a que pertence a semana que começa em `start`: o da sua quinta-feira. */
export const weekMonth = (start) => iso(new Date(parse(start).getTime() + 3 * DAY)).slice(0, 7);

/** As semanas (as segundas-feiras) de um mês YYYY-MM, pela ordem. */
export function monthWeeks(month) {
  const out = [];
  for (let t = parse(weekStart(`${month}-01`)).getTime(); ; t += 7 * DAY) {
    const w = iso(new Date(t));
    const m = weekMonth(w);
    if (m > month) break;
    if (m === month) out.push(w);
  }
  return out;
}

/** «Novembro de 2026». */
export function monthLabel(month) {
  const [y, m] = String(month).split('-');
  return `${MESES[Number(m) - 1] || ''} de ${y}`;
}

/** O mês civil (do dia 1 ao último), para as encomendas do site, que não são semanais. */
export function monthBounds(month) {
  const [y, m] = String(month).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * Os meses que se podem escolher, do mais recente (o de `today`) para trás, até ao primeiro com
 * relatórios ou com colportores a começar (no máximo 60). Sem nada, só o mês actual.
 */
export function reportMonths({ reports = [], colporteurs = [], today = new Date().toISOString().slice(0, 10) } = {}) {
  const now = today.slice(0, 7);
  const firsts = [
    ...reports.map((r) => r.week_start && weekMonth(r.week_start)),
    ...colporteurs.map((c) => c.start_date && String(c.start_date).slice(0, 7)),
  ].filter((m) => m && m <= now);
  const first = firsts.length ? firsts.reduce((a, b) => (a < b ? a : b)) : now;
  const out = [];
  let [y, m] = now.split('-').map(Number);
  while (out.length < 60) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key <= first) break;
    m -= 1;
    if (!m) { m = 12; y -= 1; }
  }
  return out;
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
  // Portes das entregas que o colportor fez (migração entregas_por_colportor): a Livraria deve-lhos.
  taxa_entrega: 'Portes de entrega',
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
  loja: 'Loja',
  igreja: 'Igreja',
  distrito: 'Distrito',
  provincia: 'Província',
  campo: 'Campo',
};

/**
 * Totais da colportagem agrupados (colportor, loja, igreja, distrito, província ou campo), a partir
 * dos relatórios validados das semanas que começam entre `from` e `to` (YYYY-MM-DD, os dois
 * opcionais) e, se `withSite`, das vendas no site: as de `sitePeriod` (o que colporteur_site_period
 * devolve para o período: valor e comissão) ou, sem ele, as do ano no `overview`.
 * `where(c)` diz a loja, a igreja, o distrito, a província e o campo de cada colportor.
 * `commission` é a dos relatórios; `siteCommission`, a das vendas no site.
 */
export function summarize({ colporteurs, reports, overview = [], groupBy = 'colportor', from = '', to = '', withSite = false, sitePeriod = null, where }) {
  const site = sitePeriod
    ? new Map(sitePeriod.map((s) => [s.colporteur_id, { value: Number(s.value || 0), commission: Number(s.commission || 0) }]))
    : new Map(overview.map((o) => [o.colporteur_id, { value: Number(o.site_year_value || 0), commission: 0 }]));
  const groups = new Map();
  const keyOf = (c) => {
    const w = where(c);
    switch (groupBy) {
      case 'igreja': return [w.churchKey || '', w.churchLabel || 'Sem igreja'];
      case 'distrito': return [w.districtId || '', w.districtLabel || 'Sem distrito'];
      case 'provincia': return [w.provinceId || '', w.provinceLabel || 'Sem província'];
      case 'campo': return [w.fieldId || '', w.fieldLabel || 'Sem campo'];
      // A loja de cada colportor (migração lojas_donas_dos_dados).
      case 'loja': return [w.storeId || '', w.storeLabel || 'Sem loja'];
      default: return [c.id, `${c.code || ''} ${c.full_name}`.trim()];
    }
  };
  const row = (c) => {
    const [key, label] = keyOf(c);
    if (!groups.has(key)) {
      groups.set(key, { key, label, colporteurs: new Set(), active: 0, reports: 0, hours: 0, visits: 0, prayers: 0, freeLiterature: 0, bibleStudies: 0, baptisms: 0, interests: 0, sales: 0, commission: 0, site: 0, siteCommission: 0 });
    }
    return groups.get(key);
  };
  const byId = new Map(colporteurs.map((c) => [c.id, c]));
  for (const c of colporteurs.filter((x) => x.code)) {
    const g = row(c);
    g.colporteurs.add(c.id);
    if (c.status === 'activo') g.active += 1;
    if (withSite) {
      g.site += site.get(c.id)?.value || 0;
      g.siteCommission += site.get(c.id)?.commission || 0;
    }
  }
  for (const r of reports) {
    if (r.status !== 'validado' || (from && String(r.week_start) < from) || (to && String(r.week_start) > to)) continue;
    const c = byId.get(r.colporteur_id);
    if (!c) continue;
    const g = row(c);
    g.reports += 1;
    g.hours += Number(r.hours || 0);
    g.visits += Number(r.visits || 0);
    g.prayers += Number(r.prayers || 0);
    g.freeLiterature += Number(r.free_literature || 0);
    g.bibleStudies += Number(r.bible_studies || 0);
    g.baptisms += Number(r.baptisms || 0);
    g.interests += Number(r.interests || 0);
    g.sales += Number(r.sales_value || 0);
    g.commission += Number(r.commission_value || 0);
  }
  const rows = [...groups.values()].map(({ colporteurs: set, ...g }) => ({ ...g, count: set.size, total: g.sales + g.site, totalCommission: g.commission + g.siteCommission }));
  const totals = rows.reduce((t, g) => {
    for (const k of ['count', 'active', 'reports', 'hours', 'visits', 'prayers', 'freeLiterature', 'bibleStudies', 'baptisms', 'interests', 'sales', 'commission', 'site', 'siteCommission', 'total', 'totalCommission']) t[k] = (t[k] || 0) + g[k];
    return t;
  }, {});
  return { rows: rows.sort((a, b) => b.total - a.total || b.hours - a.hours || a.label.localeCompare(b.label)), totals };
}
