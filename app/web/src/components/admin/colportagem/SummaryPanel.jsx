import React, { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeChip } from '@/components/admin/users/userFormat';
import { useToast } from '@/hooks/use-toast';
import { downloadCsv } from '@/lib/churchRegistryApi';
import { colporteurSitePeriod } from '@/lib/colporteurApi';
import { kz } from '@/lib/colporteurCommission';
import { openPrint, summaryHtml } from '@/lib/colporteurPrint';
import { SUMMARY_GROUPS, monthBounds, monthLabel, monthWeeks, reportMonths, summarize, weekEnd } from '@/lib/colporteurReports';
import { DataTable, NativeSelect, Toolbar } from '@/components/admin/igreja/registryUi';

const DAY = 86400000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const KINDS = { ano: 'Este ano', mes: 'Um mês', trimestre: 'Últimos 3 meses', tudo: 'Desde o início' };

/**
 * O período escolhido. Os relatórios contam pela semana (from/to são segundas-feiras); as vendas
 * no site pela data da encomenda (siteFrom/siteTo). «Um mês» é o relatório mensal: as semanas com
 * a quinta-feira nesse mês, e as encomendas do dia 1 ao último dia do mês.
 */
export function periodOf(kind, month, today = new Date().toISOString().slice(0, 10)) {
  const year = today.slice(0, 4);
  if (kind === 'mes') {
    const weeks = monthWeeks(month);
    const b = monthBounds(month);
    return { key: month, label: monthLabel(month), from: weeks[0], to: weeks.at(-1), weeks, siteFrom: b.from, siteTo: b.to };
  }
  if (kind === 'trimestre') {
    const from = isoDay(Date.parse(today) - 91 * DAY);
    return { key: 'trimestre', label: 'Últimos 3 meses', from, to: '', siteFrom: from, siteTo: today };
  }
  if (kind === 'tudo') {
    // A base de dados soma no máximo dez anos de cada vez.
    return { key: 'tudo', label: 'Desde o início', from: '', to: '', siteFrom: isoDay(Date.parse(today) - 3650 * DAY), siteTo: today };
  }
  return { key: year, label: `Este ano (${year})`, from: `${year}-01-01`, to: '', siteFrom: `${year}-01-01`, siteTo: today };
}

/**
 * Resumo e relatório mensal: quanto se trabalhou, vendeu e ganhou, por colportor, loja, igreja,
 * distrito, província ou campo, num período (este ano, um mês, os últimos 3 meses ou tudo).
 */
export default function SummaryPanel({ data, ops, reg, idx }) {
  const { toast } = useToast();
  const [groupBy, setGroupBy] = useState('colportor');
  const [kind, setKind] = useState('ano');
  const months = useMemo(() => reportMonths({ reports: ops.reports, colporteurs: data.colporteurs }), [ops.reports, data.colporteurs]);
  const [month, setMonth] = useState(() => months[0]);
  const period = useMemo(() => periodOf(kind, month), [kind, month]);

  // As vendas no site do período (colporteur_site_period). Sem a migração (null), só o ano, pelo
  // total que o colporteur_overview já traz.
  const [site, setSite] = useState({ key: '', rows: undefined, error: '' });
  const siteKey = `${period.siteFrom}|${period.siteTo}`;
  useEffect(() => {
    let alive = true;
    colporteurSitePeriod(period.siteFrom, period.siteTo)
      .then((rows) => { if (alive) setSite({ key: siteKey, rows, error: '' }); })
      .catch((err) => { if (alive) setSite({ key: siteKey, rows: null, error: err.message }); });
    return () => { alive = false; };
  }, [period.siteFrom, period.siteTo, siteKey]);
  const siteRows = site.key === siteKey ? site.rows : undefined;
  const siteLoading = siteRows === undefined && !site.error;
  const sitePeriod = Array.isArray(siteRows) ? siteRows : null;
  const withSite = !!sitePeriod || (siteRows === null && kind === 'ano');

  const storeNames = useMemo(() => new Map((data.stores || []).map((s) => [s.id, s.name])), [data.stores]);
  const where = useMemo(() => (c) => {
    const church = idx.churchesById.get(c.church_id);
    const districtId = church?.district_id || '';
    return {
      storeId: c.store_id || '', storeLabel: storeNames.get(c.store_id) || '',
      churchKey: c.church_id || `outra:${c.church_other}`,
      churchLabel: church?.name || (c.church_other ? `${c.church_other} (fora do registo)` : ''),
      districtId, districtLabel: districtId ? `${idx.districtName(districtId)} · ${idx.provinceName(idx.districts.get(districtId)?.province_id)}` : '',
      provinceId: c.province_id || '', provinceLabel: idx.provinceName(c.province_id),
      fieldId: church?.field_id || '', fieldLabel: idx.fieldName(church?.field_id),
    };
  }, [idx, storeNames]);

  const { rows, totals } = useMemo(() => summarize({
    colporteurs: data.colporteurs, reports: ops.reports, overview: ops.overview, groupBy, from: period.from, to: period.to, withSite, sitePeriod, where,
  }), [data.colporteurs, ops.reports, ops.overview, groupBy, period.from, period.to, withSite, sitePeriod, where]);

  const inPeriod = (w) => (!period.from || w >= period.from) && (!period.to || w <= period.to);
  const toValidateInPeriod = ops.reports.filter((r) => r.status === 'enviado' && inPeriod(String(r.week_start))).length;
  const pending = data.colporteurs.filter((c) => ['candidatura', 'em_analise'].includes(c.status)).length;
  const toValidate = ops.reports.filter((r) => r.status === 'enviado').length;
  const owed = ops.overview.reduce((s, o) => s + Math.max(0, Number(o.balance || 0)), 0);
  const inHand = ops.overview.reduce((s, o) => s + Number(o.in_hand_value || 0), 0);
  const byCode = useMemo(() => new Map(data.colporteurs.map((c) => [c.id, c.code])), [data.colporteurs]);
  const nWeeks = period.weeks?.length || null;
  const perColporteur = groupBy === 'colportor';

  const pendingNote = toValidateInPeriod
    ? `${toValidateInPeriod} ${toValidateInPeriod === 1 ? 'relatório deste período está' : 'relatórios deste período estão'} por validar e ainda não ${toValidateInPeriod === 1 ? 'conta' : 'contam'}.`
    : '';
  // O que o ecrã e a impressão dizem sobre o período.
  const notes = [
    'Contam só os relatórios validados.',
    period.weeks
      ? `Relatório de ${period.label}: as ${nWeeks} semanas com a quinta-feira no mês (de ${ddmm(period.from)} a ${ddmm(weekEnd(period.to))}); cada semana conta inteira para um só mês.`
      : '',
    withSite && sitePeriod
      ? `Vendas no site: encomendas com o código do colportor de ${ddmm(period.siteFrom)}/${period.siteFrom.slice(0, 4)} a ${ddmm(period.siteTo)}/${period.siteTo.slice(0, 4)}, sem as canceladas nem as reembolsadas. A comissão do site é a que já entrou na conta (encomenda paga e entregue).`
      : withSite ? 'As vendas no site são as do ano (encomendas não canceladas nem reembolsadas).' : '',
    siteRows === null && !site.error && kind !== 'ano' ? 'As vendas no site só entram na vista «Este ano» até a migração colportagem_relatorio_mensal estar aplicada.' : '',
  ].filter(Boolean);

  const exportCsv = () => downloadCsv(`resumo-colportagem-${groupBy}-${period.key}`,
    [SUMMARY_GROUPS[groupBy], 'Colportores', 'Activos', 'Relatórios', 'Horas', 'Visitas', 'Orações', 'Literatura oferecida', 'Estudos bíblicos', 'Interessados', 'Baptismos', 'Vendas (relatórios)', ...(withSite ? ['Vendas no site', 'Comissão no site'] : []), 'Comissão (relatórios)', 'Comissão total'],
    [...rows, { ...totals, label: `Total · ${period.label}` }].map((r) => [r.label, r.count, r.active, r.reports, r.hours, r.visits, r.prayers, r.freeLiterature, r.bibleStudies, r.interests, r.baptisms, r.sales,
      ...(withSite ? [r.site, r.siteCommission] : []), r.commission, r.totalCommission]));

  const print = () => {
    const html = summaryHtml({
      title: 'Relatório da colportagem', period: period.label, groupLabel: SUMMARY_GROUPS[groupBy],
      rows, totals, weeks: nWeeks, withSite, notes: [...notes, pendingNote].filter(Boolean),
    });
    if (!openPrint(html)) toast({ variant: 'destructive', title: 'Não foi possível abrir o relatório', description: 'O browser bloqueou a janela de impressão. Permita janelas pop-up para este site.' });
  };

  const num = (v) => Number(v || 0).toLocaleString('pt-AO', { maximumFractionDigits: 1 });
  const cells = (r, total = false) => (
    <>
      {!perColporteur && <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.active}/{r.count}</td>}
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{nWeeks && perColporteur && !total ? `${r.reports}/${nWeeks}` : r.reports}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.hours)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.visits)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.prayers)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.freeLiterature)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.bibleStudies)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.interests)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{num(r.baptisms)}</td>
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{kz(r.sales)}</td>
      {withSite && <td className="px-3 py-2 tabular-nums whitespace-nowrap">{kz(r.site)}</td>}
      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{kz(r.totalCommission)}</td>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Colportores activos', data.colporteurs.filter((c) => c.status === 'activo').length],
          ['Candidaturas por decidir', pending],
          ['Relatórios por validar', toValidate],
          ['Livros à consignação', kz(inHand)],
          [`Horas · ${period.label}`, num(totals.hours)],
          [`Vendas · ${period.label}`, kz(totals.total)],
          [`Comissões · ${period.label}`, kz(totals.totalCommission)],
          ['A receber dos colportores', kz(owed)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>

      <div>
        <Toolbar>
          <NativeSelect value={groupBy} onChange={setGroupBy} className="w-auto" aria-label="Agrupar por">
            {Object.entries(SUMMARY_GROUPS).map(([k, l]) => <option key={k} value={k}>Por {l.toLowerCase()}</option>)}
          </NativeSelect>
          <NativeSelect value={kind} onChange={setKind} className="w-auto" aria-label="Período">
            {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{k === 'ano' ? periodOf('ano', month).label : l}</option>)}
          </NativeSelect>
          {kind === 'mes' && (
            <NativeSelect value={month} onChange={setMonth} className="w-auto" aria-label="Mês">
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </NativeSelect>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={print}><Printer className="mr-1.5 h-4 w-4" />Imprimir</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          </div>
        </Toolbar>
        {pendingNote && (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            {pendingNote} {toValidateInPeriod === 1 ? 'Valide-o' : 'Valide-os'} em Relatórios para {toValidateInPeriod === 1 ? 'entrar' : 'entrarem'} no {period.weeks ? 'relatório do mês' : 'resumo'}.
          </p>
        )}
        <DataTable count={rows.length} empty="Sem colportores aprovados ainda."
          head={[SUMMARY_GROUPS[groupBy], ...(perColporteur ? [] : ['Colportores']), 'Relatórios', 'Horas', 'Visitas', 'Orações', 'Literatura', 'Estudos', 'Interessados', 'Baptismos', 'Vendas', ...(withSite ? ['No site'] : []), 'Comissão']}>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-2 font-medium">{perColporteur ? <><CodeChip code={byCode.get(r.key)} /> {r.label.replace(/^CPT-\d+\s*/, '')}</> : r.label}</td>
              {cells(r)}
            </tr>
          ))}
          {rows.length > 1 && (
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-3 py-2">Total</td>
              {cells(totals, true)}
            </tr>
          )}
        </DataTable>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {notes.map((t) => <p key={t}>{t}</p>)}
          {siteLoading && <p>A carregar as vendas no site do período…</p>}
          {site.error && <p className="text-destructive">Vendas no site: {site.error}</p>}
          <p>Igrejas: {reg.churches.length} no registo.</p>
        </div>
      </div>
    </div>
  );
}
