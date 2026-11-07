import React, { useMemo, useState } from 'react';
import { Download, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CodeChip } from '@/components/admin/users/userFormat';
import { downloadCsv } from '@/lib/churchRegistryApi';
import { returnReport, saveReport, validateReport } from '@/lib/colporteurApi';
import { kz } from '@/lib/colporteurCommission';
import { REPORT_STATUSES, missingReports, previewCommission, recentWeeks, weekLabel } from '@/lib/colporteurReports';
import ReportForm, { EMPTY_REPORT, reportPayload, reportToForm } from '@/components/colportagem/ReportForm';
import { DataTable, FormField, NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';

/** Relatórios semanais: validar ou devolver, ver quem falta, lançar por um colportor. */
export default function ReportsPanel({ data, ops, books, run }) {
  const weeks = useMemo(() => recentWeeks(12), []);
  const [week, setWeek] = useState('');
  const [status, setStatus] = useState('enviado');
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [entry, setEntry] = useState(null);
  const byId = useMemo(() => new Map(data.colporteurs.map((c) => [c.id, c])), [data.colporteurs]);
  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const inHandOf = (id) => ops.overview.find((o) => o.colporteur_id === id)?.in_hand || [];

  const rows = ops.reports
    .filter((r) => (!week || r.week_start === week) && (status === 'all' || r.status === status))
    .sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
  // As duas últimas semanas já fechadas (a corrente ainda não acabou).
  const missing = missingReports({ colporteurs: data.colporteurs, reports: ops.reports, weeks: weeks.slice(1, 3) });
  const preview = (r) => {
    if (r.status === 'validado') return { value: Number(r.sales_value), commission: Number(r.commission_value) };
    const c = byId.get(r.colporteur_id);
    return previewCommission({ report: r, colporteur: c, books: bookMap, rules: data.rules, overrides: data.overrides.filter((o) => o.colporteur_id === c?.id), basePct: data.settings.base_pct });
  };

  const exportCsv = () => downloadCsv('relatorios-colportores', ['Semana', 'Código', 'Colportor', 'Horas', 'Visitas', 'Orações', 'Literatura grátis', 'Estudos bíblicos', 'Interessados', 'Baptismos', 'Vendas (Kz)', 'Comissão (Kz)', 'Estado'],
    rows.map((r) => {
      const c = byId.get(r.colporteur_id);
      const p = preview(r);
      return [r.week_start, c?.code, c?.full_name, r.hours, r.visits, r.prayers, r.free_literature, r.bible_studies, r.interests, r.baptisms, p.value, p.commission, REPORT_STATUSES[r.status]?.label];
    }));

  const current = open && ops.reports.find((r) => r.id === open);
  const cur = current && byId.get(current.colporteur_id);
  const curPreview = current && preview(current);
  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-1 font-semibold">Sem relatório nas duas últimas semanas fechadas</p>
          <p>{missing.map(({ colporteur: c, weeks: w }) => `${c.code} ${c.full_name} (${w.map(weekLabel).join(', ')})`).join(' · ')}</p>
        </div>
      )}
      <Toolbar>
        <NativeSelect value={week} onChange={setWeek} className="w-auto">
          <option value="">Todas as semanas</option>
          {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
        </NativeSelect>
        <NativeSelect value={status} onChange={setStatus} className="w-auto">
          <option value="enviado">Por validar</option>
          <option value="validado">Validados</option>
          <option value="devolvido">Devolvidos</option>
          <option value="rascunho">Rascunhos</option>
          <option value="all">Todos</option>
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          <Button size="sm" onClick={() => setEntry({ colporteurId: '', form: { ...EMPTY_REPORT, week_start: weeks[1] } })}><PenLine className="mr-1.5 h-4 w-4" />Lançar por um colportor</Button>
        </div>
      </Toolbar>
      <DataTable count={rows.length} head={['Semana', 'Colportor', 'Horas', 'Visitas', 'Estudos', 'Vendas', 'Comissão', 'Estado']}
        empty="Nenhum relatório com estes filtros.">
        {rows.map((r) => {
          const c = byId.get(r.colporteur_id);
          const p = preview(r);
          const st = REPORT_STATUSES[r.status];
          return (
            <tr key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setOpen(r.id); setReason(''); }}>
              <td className="px-3 py-2 whitespace-nowrap">{weekLabel(r.week_start)}</td>
              <td className="px-3 py-2"><CodeChip code={c?.code} /> {c?.full_name}</td>
              <td className="px-3 py-2 tabular-nums">{Number(r.hours)}</td>
              <td className="px-3 py-2 tabular-nums">{r.visits}</td>
              <td className="px-3 py-2 tabular-nums">{r.bible_studies}</td>
              <td className="px-3 py-2 tabular-nums">{kz(p.value)}</td>
              <td className="px-3 py-2 tabular-nums">{kz(p.commission)}{r.status !== 'validado' && <span className="text-xs text-muted-foreground"> prev.</span>}</td>
              <td className="px-3 py-2"><Pill tone={st.tone}>{st.label}</Pill></td>
            </tr>
          );
        })}
      </DataTable>

      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">{cur?.full_name} <CodeChip code={cur?.code} /> <Pill tone={REPORT_STATUSES[current.status].tone}>{REPORT_STATUSES[current.status].label}</Pill></DialogTitle>
                <DialogDescription>Semana de {weekLabel(current.week_start)}{current.submitted_at ? ` · enviado a ${new Date(current.submitted_at).toLocaleString('pt-AO')}` : ''}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[['Horas', Number(current.hours)], ['Visitas', current.visits], ['Orações', current.prayers], ['Literatura', current.free_literature], ['Estudos', current.bible_studies], ['Interessados', current.interests], ['Baptismos', current.baptisms]].map(([l, n]) => (
                  <div key={l} className="rounded-lg bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold tabular-nums">{n}</p></div>
                ))}
              </div>
              <DataTable head={['Livro', 'Origem', 'Qtd', 'Valor', '%']} empty="Sem vendas.">
                {(current.sales || []).map((s, i) => {
                  const b = bookMap.get(s.book_id);
                  const price = Number(s.unit_price ?? b?.price ?? 0);
                  return (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{s.title || b?.title}</td>
                      <td className="px-3 py-1.5">{s.source === 'proprio' ? 'stock próprio' : 'consignação'}</td>
                      <td className="px-3 py-1.5 tabular-nums">{s.qty}</td>
                      <td className="px-3 py-1.5 tabular-nums">{kz(price * s.qty)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{s.pct != null ? `${Number(s.pct)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </DataTable>
              <p className="text-sm">Vendas {kz(curPreview.value)} · comissão {kz(curPreview.commission)}{current.status !== 'validado' && ' (prevista; a final é calculada ao validar)'}</p>
              {(current.interest_contacts || []).length > 0 && (
                <div className="text-sm">
                  <p className="font-semibold">Interessados para o pastor</p>
                  <ul className="list-disc pl-5">{current.interest_contacts.map((c, i) => <li key={i}>{c.name}{c.phone ? ` · ${c.phone}` : ''}{c.place ? ` · ${c.place}` : ''}{c.request ? ` — ${c.request}` : ''}</li>)}</ul>
                </div>
              )}
              {current.notes && <p className="rounded-lg bg-muted/50 p-3 text-sm">{current.notes}</p>}
              {current.return_reason && current.status === 'devolvido' && <p className="text-sm text-destructive">Devolvido: {current.return_reason}</p>}
              {current.status === 'enviado' && (
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-end">
                  <FormField label="Devolver para corrigir" className="flex-1"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="O que o colportor tem de corrigir" maxLength={500} /></FormField>
                  <Button variant="outline" onClick={() => run(async () => { await returnReport(current.id, reason); setOpen(null); }, 'Relatório devolvido ao colportor.')}>Devolver</Button>
                  <Button onClick={() => run(async () => {
                    const r = await validateReport(current.id);
                    setOpen(null);
                    return `Validado: vendas ${kz(r.sales_value)}, comissão ${kz(r.commission)}.`;
                  })}>Validar</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!entry} onOpenChange={(o) => !o && setEntry(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar relatório</DialogTitle>
            <DialogDescription>Para colportores sem telemóvel: a equipa preenche e envia por eles.</DialogDescription>
          </DialogHeader>
          {entry && (
            <div className="space-y-4">
              <FormField label="Colportor">
                <NativeSelect value={entry.colporteurId} onChange={(v) => {
                  const existing = ops.reports.find((r) => r.colporteur_id === v && r.week_start === entry.form.week_start);
                  setEntry({ colporteurId: v, form: existing ? reportToForm(existing) : { ...EMPTY_REPORT, week_start: entry.form.week_start } });
                }}>
                  <option value="">— escolher —</option>
                  {data.colporteurs.filter((c) => c.status === 'activo').sort((a, b) => a.full_name.localeCompare(b.full_name)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.full_name}</option>)}
                </NativeSelect>
              </FormField>
              {entry.colporteurId && (
                <ReportForm value={entry.form} onChange={(form) => setEntry({ ...entry, form })} inHand={inHandOf(entry.colporteurId)} books={books} weeks={weeks} />
              )}
            </div>
          )}
          <DialogFooter>
            <Button disabled={!entry?.colporteurId || !entry?.form.week_start} onClick={() => run(async () => {
              await saveReport(reportPayload(entry.form), true, entry.colporteurId);
              setEntry(null);
            }, 'Relatório lançado. Fica por validar.')}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
