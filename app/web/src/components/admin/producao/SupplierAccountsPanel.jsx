import React, { useMemo, useState } from 'react';
import { Ban, HandCoins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DataTable, FormField, NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';
import { kwanza } from '@/lib/money';
import { PAY_METHODS, supplierBalances, todayLuanda } from '@/lib/production';
import { recordSupplierPayment, voidSupplierPayment } from '@/lib/productionApi';
import { cn } from '@/lib/utils';

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-AO') : '');

/**
 * O que se deve a cada fornecedor (custos das ordens menos o que se pagou) e os pagamentos feitos.
 * Só as finanças registam e anulam; um pagamento não se corrige nem se apaga (anula-se, com o
 * motivo, e regista-se outro), e tudo fica no registo de segurança.
 */
export default function SupplierAccountsPanel({ data, canPay, run }) {
  const [paying, setPaying] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const balances = useMemo(() => supplierBalances(data.suppliers, data.costs, data.payments), [data]);
  const supplier = (id) => data.suppliers.find((s) => s.id === id);
  const order = (id) => data.orders.find((o) => o.id === id);
  const owed = balances.reduce((t, r) => t + Math.max(r.balance, 0), 0);

  const startPay = (supplierId = '', amount = '') => setPaying({
    supplier_id: supplierId, order_id: '', amount: amount ? String(amount) : '', paid_on: todayLuanda(), method: 'transferencia', reference: '', notes: '',
  });

  const pay = async () => {
    if (!paying.supplier_id) throw new Error('Escolha o fornecedor.');
    if (!(Number(paying.amount) > 0)) throw new Error('Indique o valor pago.');
    await recordSupplierPayment(paying);
    setPaying(null);
    return `Pagamento de ${kwanza(paying.amount)} a ${supplier(paying.supplier_id)?.name} registado.`;
  };

  return (
    <div className="space-y-6">
      <section>
        <Toolbar>
          <p className="text-sm text-muted-foreground">
            Por pagar a fornecedores: <strong className="text-foreground">{kwanza(owed)}</strong>
            {!canPay && <span className="block text-xs">Os pagamentos registam-se com a permissão "Finanças (saídas)".</span>}
          </p>
          {canPay && <Button size="sm" className="ml-auto" onClick={() => startPay()}><HandCoins className="mr-1.5 h-4 w-4" />Registar pagamento</Button>}
        </Toolbar>
        <DataTable head={['Fornecedor', 'Custos', 'Pago', 'Por pagar', '']} empty="Ainda não há custos nem pagamentos de fornecedores.">
          {balances.map((r) => (
            <tr key={r.supplier.id}>
              <td className="px-3 py-2"><span className="font-medium">{r.supplier.name}</span> <span className="font-mono text-xs text-muted-foreground">{r.supplier.code}</span></td>
              <td className="px-3 py-2 tabular-nums">{kwanza(r.costs)}</td>
              <td className="px-3 py-2 tabular-nums">{kwanza(r.paid)}</td>
              <td className={cn('px-3 py-2 font-semibold tabular-nums', r.balance > 0 ? 'text-amber-700 dark:text-amber-400' : r.balance < 0 ? 'text-sky-700 dark:text-sky-400' : '')}>
                {kwanza(r.balance)}{r.balance < 0 && <span className="block text-[11px] font-normal">pago a mais (adiantamento)</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {canPay && r.balance > 0 && <Button size="sm" variant="outline" onClick={() => startPay(r.supplier.id, r.balance)}>Pagar</Button>}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Pagamentos</h3>
        <DataTable head={['Data', 'Fornecedor', 'Ordem', 'Forma', 'Valor', '']} count={data.payments.length} empty="Ainda não há pagamentos a fornecedores.">
          {data.payments.map((p) => (
            <tr key={p.id} className={p.status === 'anulado' ? 'opacity-60' : ''}>
              <td className="px-3 py-2 tabular-nums">{fmtDate(p.paid_on)}</td>
              <td className="px-3 py-2">{supplier(p.supplier_id)?.name || '—'}</td>
              <td className="px-3 py-2 font-mono text-xs">{order(p.order_id)?.code || '—'}</td>
              <td className="px-3 py-2 text-sm">{PAY_METHODS[p.method]}{p.reference && <span className="block text-xs text-muted-foreground">{p.reference}</span>}</td>
              <td className="px-3 py-2 tabular-nums">
                <span className={cn('font-medium', p.status === 'anulado' && 'line-through')}>{kwanza(p.amount)}</span>
                {p.status === 'anulado' && <span className="block text-xs text-muted-foreground"><Pill>anulado</Pill> {p.void_reason}</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {canPay && p.status === 'pago' && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setVoiding({ id: p.id, reason: '', label: `${kwanza(p.amount)} a ${supplier(p.supplier_id)?.name}` })}>
                    <Ban className="mr-1 h-3.5 w-3.5" />Anular
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registar pagamento a fornecedor</DialogTitle>
            <DialogDescription>Fica registado com o seu nome. Não se corrige nem se apaga: um engano anula-se e regista-se outro.</DialogDescription>
          </DialogHeader>
          {paying && (
            <div className="space-y-3">
              <FormField label="Fornecedor *">
                <NativeSelect value={paying.supplier_id} onChange={(v) => setPaying({ ...paying, supplier_id: v, order_id: '' })}>
                  <option value="">— escolher —</option>
                  {data.suppliers.filter((s) => s.active || s.id === paying.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </NativeSelect>
              </FormField>
              {paying.supplier_id && supplier(paying.supplier_id)?.iban && (
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs">IBAN registado: <span className="font-mono">{supplier(paying.supplier_id).iban}</span></p>
              )}
              <FormField label="Ordem de produção" hint="Opcional: para saber o que se pagou de cada título.">
                <NativeSelect value={paying.order_id} onChange={(v) => setPaying({ ...paying, order_id: v })}>
                  <option value="">— nenhuma —</option>
                  {data.orders.filter((o) => o.status !== 'cancelada').map((o) => <option key={o.id} value={o.id}>{o.code} · {o.title}</option>)}
                </NativeSelect>
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Valor (Kz) *"><Input type="number" inputMode="decimal" min={0} step="0.01" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} /></FormField>
                <FormField label="Data"><Input type="date" value={paying.paid_on} max={todayLuanda()} onChange={(e) => setPaying({ ...paying, paid_on: e.target.value })} /></FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Forma">
                  <NativeSelect value={paying.method} onChange={(v) => setPaying({ ...paying, method: v })}>
                    {Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </NativeSelect>
                </FormField>
                <FormField label="Referência"><Input value={paying.reference} onChange={(e) => setPaying({ ...paying, reference: e.target.value })} maxLength={80} placeholder="Nº da transferência, recibo…" /></FormField>
              </div>
              <FormField label="Notas"><Input value={paying.notes} onChange={(e) => setPaying({ ...paying, notes: e.target.value })} maxLength={500} /></FormField>
            </div>
          )}
          <DialogFooter><Button onClick={() => run(pay)}>Registar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular o pagamento</DialogTitle>
            <DialogDescription>{voiding?.label}. O pagamento fica no registo, riscado, com o motivo.</DialogDescription>
          </DialogHeader>
          {voiding && (
            <FormField label="Porque se anula *"><Input value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} maxLength={300} placeholder="Valor errado, pagamento em duplicado…" /></FormField>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={() => run(async () => { await voidSupplierPayment(voiding.id, voiding.reason); setVoiding(null); return 'Pagamento anulado.'; })}>Anular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
