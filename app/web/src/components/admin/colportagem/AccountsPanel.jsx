import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CodeChip } from '@/components/admin/users/userFormat';
import { downloadCsv } from '@/lib/churchRegistryApi';
import { assignOrderToColporteur, ledgerAdjust, recordPayment, setColporteurCategory } from '@/lib/colporteurApi';
import { CATEGORIES, STATUSES, kz, today } from '@/lib/colporteurCommission';
import { LEDGER_KINDS, ledgerWithBalance, suggestCategory, weekLabel } from '@/lib/colporteurReports';
import { openPrint, statementHtml } from '@/lib/colporteurPrint';
import { DataTable, NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';

const METHODS = ['Numerário', 'Multicaixa Express', 'Transferência', 'Outro'];

/** Contas correntes: saldo de cada colportor, extracto, pagamentos e correcções. */
export function AccountsPanel({ data, ops, run }) {
  const [open, setOpen] = useState(null);
  const [pay, setPay] = useState({ direction: 'recebido', amount: '', method: METHODS[0], reference: '', date: today(), notes: '' });
  const [adj, setAdj] = useState({ amount: '', description: '' });
  const [orderNumber, setOrderNumber] = useState('');
  const ov = useMemo(() => new Map(ops.overview.map((o) => [o.colporteur_id, o])), [ops.overview]);
  const rows = data.colporteurs.filter((c) => c.code)
    .sort((a, b) => Math.abs(Number(ov.get(b.id)?.balance || 0)) - Math.abs(Number(ov.get(a.id)?.balance || 0)));
  const owed = rows.reduce((s, c) => s + Math.max(0, Number(ov.get(c.id)?.balance || 0)), 0);

  const c = open && data.colporteurs.find((x) => x.id === open);
  const entries = c ? ops.ledger.filter((e) => e.colporteur_id === c.id) : [];
  const statement = ledgerWithBalance(entries).reverse();

  const exportCsv = () => downloadCsv('contas-colportores', ['Código', 'Colportor', 'Estado', 'À consignação (Kz)', 'Saldo (Kz)', 'Comissão do ano (Kz)', 'Último relatório'],
    rows.map((x) => { const o = ov.get(x.id) || {}; return [x.code, x.full_name, STATUSES[x.status]?.label, o.in_hand_value, o.balance, o.year_commission, o.last_report || '']; }));

  return (
    <div>
      <Toolbar>
        <p className="text-sm text-muted-foreground">Saldo positivo: o colportor deve à Livraria (livros à consignação ou vendidos por pagar). Negativo: a Livraria deve-lhe. Total a receber: <strong>{kz(owed)}</strong>.</p>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
      </Toolbar>
      <DataTable count={rows.length} head={['Colportor', 'Estado', 'À consignação', 'Saldo', 'Comissão do ano', 'Último relatório']} empty="Ainda não há colportores aprovados.">
        {rows.map((x) => {
          const o = ov.get(x.id) || {};
          const bal = Number(o.balance || 0);
          return (
            <tr key={x.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(x.id)}>
              <td className="px-3 py-2"><CodeChip code={x.code} /> {x.full_name}</td>
              <td className="px-3 py-2"><Pill tone={STATUSES[x.status]?.tone}>{STATUSES[x.status]?.label}</Pill></td>
              <td className="px-3 py-2 tabular-nums">{kz(o.in_hand_value)}</td>
              <td className={`px-3 py-2 tabular-nums font-semibold ${bal > 0 ? 'text-amber-700 dark:text-amber-300' : bal < 0 ? 'text-sky-700 dark:text-sky-300' : ''}`}>{kz(bal)}</td>
              <td className="px-3 py-2 tabular-nums">{kz(o.year_commission)}</td>
              <td className="px-3 py-2">{o.last_report ? weekLabel(o.last_report) : <Pill tone="amber">nenhum</Pill>}</td>
            </tr>
          );
        })}
      </DataTable>

      <Dialog open={!!c} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          {c && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">Conta de {c.full_name} <CodeChip code={c.code} /></DialogTitle>
                <DialogDescription>Saldo {kz(ov.get(c.id)?.balance)} · à consignação {kz(ov.get(c.id)?.in_hand_value)}</DialogDescription>
              </DialogHeader>
              <section className="space-y-2 rounded-xl border border-border p-3">
                <h4 className="font-semibold">Registar pagamento</h4>
                <div className="grid gap-2 sm:grid-cols-3">
                  <NativeSelect value={pay.direction} onChange={(v) => setPay({ ...pay, direction: v })}>
                    <option value="recebido">Recebido do colportor</option>
                    <option value="pago">Pago ao colportor</option>
                  </NativeSelect>
                  <Input type="number" min={0} step="0.01" placeholder="Valor (Kz)" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                  <Input type="date" max={today()} value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
                  <NativeSelect value={pay.method} onChange={(v) => setPay({ ...pay, method: v })}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</NativeSelect>
                  <Input placeholder="Referência" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} maxLength={80} />
                  <Input placeholder="Nota" value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} maxLength={300} />
                </div>
                <Button size="sm" disabled={!(Number(pay.amount) > 0)} onClick={() => run(async () => {
                  await recordPayment({ colporteurId: c.id, ...pay });
                  setPay({ ...pay, amount: '', reference: '', notes: '' });
                }, 'Pagamento registado.')}>Registar</Button>
              </section>
              <details className="rounded-xl border border-border p-3">
                <summary className="cursor-pointer font-semibold">Correcção à mão</summary>
                <p className="my-2 text-xs text-muted-foreground">Positivo: o colportor passa a dever mais. Negativo: a dever menos. Fica no extracto com a explicação.</p>
                <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
                  <Input type="number" step="0.01" placeholder="± Kz" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
                  <Input placeholder="Explicação" value={adj.description} onChange={(e) => setAdj({ ...adj, description: e.target.value })} maxLength={300} />
                  <Button size="sm" variant="outline" onClick={() => run(async () => { await ledgerAdjust({ colporteurId: c.id, ...adj }); setAdj({ amount: '', description: '' }); }, 'Correcção registada.')}>Aplicar</Button>
                </div>
              </details>
              <details className="rounded-xl border border-border p-3">
                <summary className="cursor-pointer font-semibold">Encomenda do site sem o código</summary>
                <p className="my-2 text-xs text-muted-foreground">Quando o cliente comprou por indicação de {c.full_name} mas não pôs o código. Precisa da permissão "Encomendas"; a comissão entra quando a encomenda estiver paga e entregue.</p>
                <div className="flex gap-2">
                  <Input placeholder="N.º da encomenda" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} maxLength={40} />
                  <Button size="sm" variant="outline" disabled={!orderNumber.trim()} onClick={() => run(async () => {
                    await assignOrderToColporteur(orderNumber, c.code);
                    setOrderNumber('');
                  }, `Encomenda ligada a ${c.code}.`)}>Ligar</Button>
                </div>
              </details>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Extracto</h4>
                <Button size="sm" variant="outline" onClick={() => openPrint(statementHtml({ colporteur: c, entries, inHand: ov.get(c.id)?.in_hand || [] }))}><Printer className="mr-1.5 h-4 w-4" />Imprimir</Button>
              </div>
              <DataTable head={['Data', 'Movimento', 'Descrição', 'Valor', 'Saldo']} empty="Sem movimentos.">
                {statement.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-1.5 whitespace-nowrap">{e.entry_date}</td>
                    <td className="px-3 py-1.5">{LEDGER_KINDS[e.kind]}</td>
                    <td className="px-3 py-1.5">{e.description}{e.method ? ` · ${e.method}` : ''}{e.reference ? ` · ${e.reference}` : ''}</td>
                    <td className="px-3 py-1.5 tabular-nums">{kz(e.amount)}</td>
                    <td className="px-3 py-1.5 tabular-nums">{kz(e.balance)}</td>
                  </tr>
                ))}
              </DataTable>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Reclassificação anual: sugestão por colportor; a equipa aplica uma a uma. */
export function ReclassPanel({ data, ops, run }) {
  const [onlyChanges, setOnlyChanges] = useState(true);
  const rows = data.colporteurs.filter((c) => c.status === 'activo' && c.code)
    .map((c) => ({ c, s: suggestCategory({ colporteur: c, reports: ops.reports, settings: data.settings }) }))
    .filter((r) => !onlyChanges || r.s.changes)
    .sort((a, b) => a.c.full_name.localeCompare(b.c.full_name));
  return (
    <div>
      <Toolbar>
        <p className="text-sm text-muted-foreground">
          Pelas horas dos relatórios validados e pelos requisitos em Definições (Working Policy: Credenciado a partir de 12 meses; tempo inteiro com {data.settings.full_time_weekly_hours ?? 35} h/semana). Normalmente faz-se no início de cada ano.
        </p>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />Só os que mudam</label>
      </Toolbar>
      <DataTable count={rows.length} head={['Colportor', 'Agora', 'Sugestão', 'Porquê', '']} empty={onlyChanges ? 'Ninguém muda de categoria.' : 'Sem colportores activos.'}>
        {rows.map(({ c, s }) => (
          <tr key={c.id}>
            <td className="px-3 py-2"><CodeChip code={c.code} /> {c.full_name}</td>
            <td className="px-3 py-2">{CATEGORIES[c.category]?.label}</td>
            <td className="px-3 py-2">{s.changes ? <Pill tone="amber">{CATEGORIES[s.suggested]?.label}</Pill> : CATEGORIES[s.suggested]?.label}</td>
            <td className="px-3 py-2 text-muted-foreground">{s.why}</td>
            <td className="px-3 py-2 text-right">
              {s.changes && <Button size="sm" variant="outline" onClick={() => run(() => setColporteurCategory(c.id, s.suggested, `Reclassificação: ${s.why}`), 'Categoria actualizada.')}>Aplicar</Button>}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
