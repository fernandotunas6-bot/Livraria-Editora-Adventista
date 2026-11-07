import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CodeChip } from '@/components/admin/users/userFormat';
import { downloadCsv } from '@/lib/churchRegistryApi';
import { kz } from '@/lib/colporteurCommission';
import { SUMMARY_GROUPS, summarize } from '@/lib/colporteurReports';
import { DataTable, NativeSelect, Toolbar } from '@/components/admin/igreja/registryUi';

const year = new Date().getFullYear();
const PERIODS = {
  ano: { label: `Este ano (${year})`, from: `${year}-01-01` },
  trimestre: { label: 'Últimos 3 meses', from: new Date(Date.now() - 91 * 86400000).toISOString().slice(0, 10) },
  mes: { label: 'Este mês', from: new Date().toISOString().slice(0, 8) + '01' },
  tudo: { label: 'Desde o início', from: '' },
};

/** Resumo: quanto se trabalhou, vendeu e ganhou, por colportor, igreja, distrito, província ou campo. */
export default function SummaryPanel({ data, ops, reg, idx }) {
  const [groupBy, setGroupBy] = useState('colportor');
  const [period, setPeriod] = useState('ano');
  // As vendas no site somam-se só no ano (o resumo da base de dados traz o total do ano).
  const withSite = period === 'ano';

  const where = useMemo(() => (c) => {
    const church = idx.churchesById.get(c.church_id);
    const districtId = church?.district_id || '';
    return {
      churchKey: c.church_id || `outra:${c.church_other}`,
      churchLabel: church?.name || (c.church_other ? `${c.church_other} (fora do registo)` : ''),
      districtId, districtLabel: districtId ? `${idx.districtName(districtId)} · ${idx.provinceName(idx.districts.get(districtId)?.province_id)}` : '',
      provinceId: c.province_id || '', provinceLabel: idx.provinceName(c.province_id),
      fieldId: church?.field_id || '', fieldLabel: idx.fieldName(church?.field_id),
    };
  }, [idx]);

  const { rows, totals } = useMemo(() => summarize({
    colporteurs: data.colporteurs, reports: ops.reports, overview: ops.overview, groupBy, from: PERIODS[period].from, withSite, where,
  }), [data.colporteurs, ops.reports, ops.overview, groupBy, period, withSite, where]);

  const pending = data.colporteurs.filter((c) => ['candidatura', 'em_analise'].includes(c.status)).length;
  const toValidate = ops.reports.filter((r) => r.status === 'enviado').length;
  const owed = ops.overview.reduce((s, o) => s + Math.max(0, Number(o.balance || 0)), 0);
  const inHand = ops.overview.reduce((s, o) => s + Number(o.in_hand_value || 0), 0);
  const byCode = useMemo(() => new Map(data.colporteurs.map((c) => [c.id, c.code])), [data.colporteurs]);

  const exportCsv = () => downloadCsv(`resumo-colportagem-${groupBy}`,
    [SUMMARY_GROUPS[groupBy], 'Colportores', 'Activos', 'Relatórios', 'Horas', 'Visitas', 'Estudos bíblicos', 'Interessados', 'Baptismos', 'Vendas (relatórios)', ...(withSite ? ['Vendas no site'] : []), 'Comissão'],
    rows.map((r) => [r.label, r.count, r.active, r.reports, r.hours, r.visits, r.bibleStudies, r.interests, r.baptisms, r.sales, ...(withSite ? [r.site] : []), r.commission]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Colportores activos', data.colporteurs.filter((c) => c.status === 'activo').length],
          ['Candidaturas por decidir', pending],
          ['Relatórios por validar', toValidate],
          ['Livros à consignação', kz(inHand)],
          [`Horas (${PERIODS[period].label.toLowerCase()})`, Math.round(totals.hours || 0)],
          ['Vendas', kz(totals.total)],
          ['Comissões', kz(totals.commission)],
          ['A receber dos colportores', kz(owed)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>

      <div>
        <Toolbar>
          <NativeSelect value={groupBy} onChange={setGroupBy} className="w-auto">
            {Object.entries(SUMMARY_GROUPS).map(([k, l]) => <option key={k} value={k}>Por {l.toLowerCase()}</option>)}
          </NativeSelect>
          <NativeSelect value={period} onChange={setPeriod} className="w-auto">
            {Object.entries(PERIODS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </NativeSelect>
          <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
        </Toolbar>
        <DataTable count={rows.length} empty="Sem colportores aprovados ainda."
          head={[SUMMARY_GROUPS[groupBy], ...(groupBy === 'colportor' ? [] : ['Colportores']), 'Horas', 'Visitas', 'Estudos', 'Baptismos', 'Vendas', ...(withSite ? ['No site'] : []), 'Comissão']}>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-2 font-medium">{groupBy === 'colportor' ? <><CodeChip code={byCode.get(r.key)} /> {r.label.replace(/^CPT-\d+\s*/, '')}</> : r.label}</td>
              {groupBy !== 'colportor' && <td className="px-3 py-2 tabular-nums">{r.active}/{r.count}</td>}
              <td className="px-3 py-2 tabular-nums">{Math.round(r.hours)}</td>
              <td className="px-3 py-2 tabular-nums">{r.visits}</td>
              <td className="px-3 py-2 tabular-nums">{r.bibleStudies}</td>
              <td className="px-3 py-2 tabular-nums">{r.baptisms}</td>
              <td className="px-3 py-2 tabular-nums">{kz(r.sales)}</td>
              {withSite && <td className="px-3 py-2 tabular-nums">{kz(r.site)}</td>}
              <td className="px-3 py-2 tabular-nums">{kz(r.commission)}</td>
            </tr>
          ))}
        </DataTable>
        <p className="mt-2 text-xs text-muted-foreground">Contam só os relatórios validados. {withSite ? 'As vendas no site são as do ano (encomendas não canceladas nem reembolsadas).' : 'As vendas no site só entram na vista "Este ano".'} Igrejas: {reg.churches.length} no registo.</p>
      </div>
    </div>
  );
}
