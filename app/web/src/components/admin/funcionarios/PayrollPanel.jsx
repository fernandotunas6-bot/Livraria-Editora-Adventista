import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Banknote, ChevronLeft, ChevronRight, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, FormField, NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';
import { useToast } from '@/hooks/use-toast';
import { useSignal } from '@/hooks/useSignal';
import { kwanza } from '@/lib/money';
import { PAY_METHODS, PAYROLL_STATUS, monthLabel, monthStart, payrollNet, payrollTotals, shiftMonth, todayLuanda } from '@/lib/production';
import { deletePayrollLine, generatePayroll, loadPayroll, payPayrollLine, updatePayrollLine, voidPayrollLine } from '@/lib/productionApi';
import { cn } from '@/lib/utils';

/**
 * Os salários de um mês: gerar as linhas a partir do salário de cada um, acertar os descontos
 * (INSS, IRT, faltas — escritos à mão: o sistema não calcula impostos), pagar e anular. Pago ou
 * anulado, não muda mais; cada pagamento fica no registo de segurança.
 */
export default function PayrollPanel({ data }) {
  const { toast } = useToast();
  const [period, setPeriod] = useState(() => monthStart(todayLuanda()));
  const [lines, setLines] = useState(null);
  const [paying, setPaying] = useState(null); // { ids, label, paid_on, method, reference }
  const [voiding, setVoiding] = useState(null);
  const person = (id) => data.staff.find((s) => s.id === id);

  const load = useCallback(async () => {
    try {
      setLines(await loadPayroll(period));
    } catch (err) {
      toast({ title: 'Não foi possível ler os salários', description: err.message, variant: 'destructive' });
      setLines([]);
    }
  }, [period, toast]);
  useEffect(() => { setLines(null); load(); }, [load]);
  // Em tempo real: um salário pago ou anulado por um colega aparece logo. Cada linha só se volta a
  // montar quando muda (key com `updated`): o desconto que se está a escrever noutra não se perde.
  useSignal('painel', 'financas', () => {
    loadPayroll(period).then(setLines, () => { /* fica o que está à vista */ });
  });

  const run = async (fn, success) => {
    try {
      const out = await fn();
      if (success !== null) toast({ title: typeof out === 'string' ? out : (success || 'Feito.') });
      await load();
      return true;
    } catch (err) {
      toast({ title: 'Não foi possível', description: err.message, variant: 'destructive' });
      return false;
    }
  };

  const totals = payrollTotals(lines || []);
  const due = (lines || []).filter((l) => l.status === 'por_pagar');
  const sorted = (lines || []).slice().sort((a, b) => String(person(a.staff_id)?.full_name || '').localeCompare(String(person(b.staff_id)?.full_name || ''), 'pt'));

  const pay = async () => {
    if (!paying.method) throw new Error('Diga como se pagou.');
    for (const id of paying.ids) await payPayrollLine(id, paying);
    setPaying(null);
    return paying.ids.length === 1 ? 'Salário pago.' : `${paying.ids.length} salários pagos.`;
  };

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês anterior" onClick={() => setPeriod(shiftMonth(period, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="min-w-[10rem] text-center font-semibold" aria-live="polite">{monthLabel(period)}</p>
          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="Mês seguinte" onClick={() => setPeriod(shiftMonth(period, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run(async () => {
            const n = await generatePayroll(period);
            return n ? `${n} ${n === 1 ? 'linha criada' : 'linhas criadas'} a partir do salário de cada um.` : 'Já estão todos no mês (ou falta o salário base nas fichas).';
          })}><Sparkles className="mr-1.5 h-4 w-4" />Gerar o mês</Button>
          {due.length > 0 && (
            <Button size="sm" onClick={() => setPaying({ ids: due.map((l) => l.id), label: `${due.length} ${due.length === 1 ? 'salário' : 'salários'} por pagar · ${kwanza(totals.due)}`, paid_on: todayLuanda(), method: 'transferencia', reference: '' })}>
              <Banknote className="mr-1.5 h-4 w-4" />Pagar os por pagar ({due.length})
            </Button>
          )}
        </div>
      </Toolbar>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Líquido do mês" value={kwanza(totals.net)} hint={`${totals.count} ${totals.count === 1 ? 'pessoa' : 'pessoas'} · descontos ${kwanza(totals.deductions)}`} />
        <Card label="Pago" value={kwanza(totals.paid)} hint={`${totals.paidCount} ${totals.paidCount === 1 ? 'salário' : 'salários'}`} tone="green" />
        <Card label="Por pagar" value={kwanza(totals.due)} hint={`${totals.dueCount} ${totals.dueCount === 1 ? 'salário' : 'salários'}`} tone={totals.dueCount ? 'amber' : ''} />
      </div>

      {lines === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">A carregar…</p>
      ) : (
        <DataTable head={['Funcionário', 'Base', 'Subsídios', 'Descontos', 'Líquido', 'Estado', '']} count={sorted.length}
          empty={'Sem salários neste mês. "Gerar o mês" cria uma linha por pessoa com salário base na ficha.'}>
          {sorted.map((l) => <PayrollRow key={`${l.id}-${l.updated}`} line={l} person={person(l.staff_id)} run={run}
            onPay={() => setPaying({ ids: [l.id], label: `${person(l.staff_id)?.full_name} · ${kwanza(l.net)}`, paid_on: todayLuanda(), method: 'transferencia', reference: '' })}
            onVoid={() => setVoiding({ id: l.id, reason: '', label: `${person(l.staff_id)?.full_name} · ${monthLabel(l.period)}` })} />)}
        </DataTable>
      )}

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar</DialogTitle>
            <DialogDescription>{paying?.label}. Depois de pago, não muda mais.</DialogDescription>
          </DialogHeader>
          {paying && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Data"><Input type="date" value={paying.paid_on} max={todayLuanda()} onChange={(e) => setPaying({ ...paying, paid_on: e.target.value })} /></FormField>
                <FormField label="Forma">
                  <NativeSelect value={paying.method} onChange={(v) => setPaying({ ...paying, method: v })}>
                    {Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </FormField>
              </div>
              <FormField label="Referência"><Input value={paying.reference} onChange={(e) => setPaying({ ...paying, reference: e.target.value })} maxLength={80} placeholder="Nº da transferência…" /></FormField>
            </div>
          )}
          <DialogFooter><Button onClick={() => run(pay)}>Marcar como pago</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular o salário</DialogTitle>
            <DialogDescription>{voiding?.label}. Fica riscado, com o motivo; pode gerar-se outro para o mesmo mês.</DialogDescription>
          </DialogHeader>
          {voiding && <FormField label="Porque se anula *"><Input value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} maxLength={300} /></FormField>}
          <DialogFooter>
            <Button variant="destructive" onClick={() => run(async () => { await voidPayrollLine(voiding.id, voiding.reason); setVoiding(null); return 'Salário anulado.'; })}>Anular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Card({ label, value, hint, tone = '' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', tone === 'green' && 'text-emerald-700 dark:text-emerald-400', tone === 'amber' && 'text-amber-700 dark:text-amber-400')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Uma linha: os descontos e os subsídios mudam-se enquanto está por pagar (grava ao sair do campo). */
function PayrollRow({ line, person, run, onPay, onVoid }) {
  const editable = line.status === 'por_pagar';
  const [draft, setDraft] = useState({ allowances: String(line.allowances), deductions: String(line.deductions) });
  const net = payrollNet({ base_salary: line.base_salary, ...draft });
  const st = PAYROLL_STATUS[line.status];
  const commit = (key) => {
    if (Number(draft[key]) === Number(line[key])) return;
    run(() => updatePayrollLine(line.id, { [key]: draft[key] }), null);
  };
  return (
    <tr className={line.status === 'anulado' ? 'opacity-60' : ''}>
      <td className="px-3 py-2">
        <span className="font-medium">{person?.full_name || '—'}</span> <span className="font-mono text-xs text-muted-foreground">{person?.code}</span>
        {line.status === 'anulado' && line.void_reason && <span className="block text-xs text-muted-foreground">Anulado: {line.void_reason}</span>}
      </td>
      <td className="px-3 py-2 tabular-nums">{kwanza(line.base_salary)}</td>
      <td className="px-3 py-2">
        {editable ? (
          <Input type="number" inputMode="decimal" min={0} step="0.01" className="h-9 w-28" aria-label={`Subsídios de ${person?.full_name}`}
            value={draft.allowances} onChange={(e) => setDraft({ ...draft, allowances: e.target.value })} onBlur={() => commit('allowances')} />
        ) : <span className="tabular-nums">{kwanza(line.allowances)}</span>}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <Input type="number" inputMode="decimal" min={0} step="0.01" className="h-9 w-28" aria-label={`Descontos de ${person?.full_name}`}
            value={draft.deductions} onChange={(e) => setDraft({ ...draft, deductions: e.target.value })} onBlur={() => commit('deductions')} />
        ) : <span className="tabular-nums">{kwanza(line.deductions)}</span>}
      </td>
      <td className={cn('px-3 py-2 font-semibold tabular-nums', line.status === 'anulado' && 'line-through', net < 0 && 'text-destructive')}>{kwanza(editable ? net : line.net)}</td>
      <td className="px-3 py-2">
        <Pill tone={st.tone}>{st.label}</Pill>
        {line.status === 'pago' && <span className="block text-xs text-muted-foreground">{PAY_METHODS[line.method]}{line.reference && ` · ${line.reference}`}</span>}
      </td>
      <td className="px-3 py-2 text-right">
        {editable && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={onPay}>Pagar</Button>
            <Button size="icon" variant="ghost" className="h-9 w-9" title="Anular" aria-label={`Anular o salário de ${person?.full_name}`} onClick={onVoid}><Ban className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" title="Apagar (gerada por engano)" aria-label={`Apagar a linha de ${person?.full_name}`}
              onClick={() => confirm('Apagar esta linha? (Só por engano: uma linha por pagar.)') && run(() => deletePayrollLine(line.id), 'Linha apagada.')}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </td>
    </tr>
  );
}
