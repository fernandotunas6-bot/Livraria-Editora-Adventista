// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Plus, RotateCcw, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  confirmOrderPayment, getOrderPayments, getPaymentMethods, recordOrderPayment, recordOrderRefund,
  rejectOrderPayment, voidOrderPayment,
} from '@/api/PlatformApi';
import { getPaymentStatusColor, getPaymentStatusLabel } from '@/lib/orderUtils';
import { PAYMENT_ENTRY_STATUS, netReceived, outstanding, overpaid, refundDue } from '@/lib/payments';
import { fromLocalInput, toLocalInput } from '@/lib/pricing';

const kz = (n) => `Kz ${Number(n || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const nowLocal = () => toLocalInput(new Date().toISOString());
const REJECT_REASONS = ['Não aparece no extracto', 'Valor diferente do pedido', 'Referência incompleta ou ilegível'];

/** De onde veio e quem decidiu, numa linha. */
function origin(p) {
  const parts = [];
  if (p.source === 'customer') parts.push(`Indicado pelo cliente em ${when(p.created)}`);
  else if (p.source === 'migration') parts.push('Registado antes do registo de pagamentos');
  else if (p.status === 'reported') parts.push(`Indicado por ${p.created_by_name || 'equipa'} em ${when(p.created)}`);
  if (p.collected_by) parts.push(`recebido por ${p.collected_by}`);
  if (p.received_at && p.status !== 'reported') parts.push(`${p.kind === 'refund' ? 'devolvido' : 'entrou'} em ${when(p.received_at)}`);
  if (p.account) parts.push(p.account);
  if (p.decided_by_name && p.status !== 'reported') {
    const verb = { confirmed: p.kind === 'refund' ? 'registado' : 'confirmado', rejected: 'rejeitado', voided: 'anulado' }[p.status];
    parts.push(`${verb} por ${p.decided_by_name}`);
  }
  return parts.join(' · ');
}

/**
 * Pagamento de uma encomenda, no painel: quanto, o que entrou e o que falta, cada pagamento e
 * reembolso com quem o confirmou, e as acções de quem tem "Confirmar pagamentos". O estado do
 * pagamento resulta destes registos (migração pagamentos_registados): não há botão para o mudar
 * à mão.
 */
export default function OrderPaymentsPanel({ order, canConfirm, currentUserName = '', onChanged }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [methods, setMethods] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getOrderPayments(order.id));
    } catch (err) {
      setError(err.message || 'Não foi possível ler os pagamentos.');
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => { load(); }, [load, order.payment_status, order.amount_paid, order.amount_refunded]);
  useEffect(() => {
    if (!canConfirm) return;
    let alive = true;
    getPaymentMethods().then((r) => { if (alive) setMethods(r?.methods || []); }).catch(() => {});
    return () => { alive = false; };
  }, [canConfirm]);

  const o = { ...order, ...(data?.order || {}) };
  const payments = data?.payments || [];
  const due = outstanding(o);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast({ title: 'Referência copiada' })).catch(() => {});

  const run = async (fn, okTitle) => {
    setBusy(true);
    try {
      const res = await fn();
      toast({
        title: `${okTitle}${res?.email_sent ? ' · cliente avisado por email' : ''}`,
        description: res?.notice || undefined,
        duration: res?.notice ? 12000 : 5000,
      });
      setForm(null);
      await load();
      onChanged?.();
    } catch (err) {
      // 409: a referência já confirmou outra encomenda. Pergunta se é a mesma transferência.
      if (err?.status === 409 && (form?.mode === 'confirm' || form?.mode === 'record')) {
        setForm((f) => ({ ...f, needsShared: true, sharedMessage: err.message }));
      } else {
        toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const f = form;
    const amount = Number(String(f.amount ?? '').replace(',', '.'));
    if (['confirm', 'record', 'refund'].includes(f.mode) && !(amount > 0)) {
      setForm({ ...f, error: 'Indique o valor.' });
      return;
    }
    if (['reject', 'void', 'refund'].includes(f.mode) && String(f.reason || '').trim().length < 5) {
      setForm({ ...f, error: 'Escreva o motivo (pelo menos 5 letras).' });
      return;
    }
    if (f.mode === 'confirm') {
      run(() => confirmOrderPayment({
        paymentId: f.payment.id, amount, receivedAt: fromLocalInput(f.receivedAt), account: f.account,
        notes: f.notes, sharedReferenceOk: !!f.sharedReferenceOk,
      }), 'Pagamento confirmado');
    } else if (f.mode === 'reject') {
      run(() => rejectOrderPayment(f.payment.id, f.reason.trim()), 'Pagamento rejeitado');
    } else if (f.mode === 'void') {
      run(() => voidOrderPayment(f.payment.id, f.reason.trim()), f.payment.kind === 'refund' ? 'Reembolso anulado' : 'Pagamento anulado');
    } else if (f.mode === 'record') {
      run(() => recordOrderPayment({
        orderId: order.id, amount, methodCode: f.methodCode, reference: f.reference, receivedAt: fromLocalInput(f.receivedAt),
        account: f.account, collectedBy: f.collectedBy, notes: f.notes, sharedReferenceOk: !!f.sharedReferenceOk,
      }), 'Pagamento registado');
    } else if (f.mode === 'refund') {
      run(() => recordOrderRefund({
        orderId: order.id, amount, methodCode: f.methodCode, reference: f.reference, refundedAt: fromLocalInput(f.refundedAt),
        account: f.account, reason: f.reason.trim(),
      }), 'Reembolso registado');
    }
  };

  const methodOptions = methods.length
    ? methods
    : [{ code: o.payment_method_code || '', name: o.payment_method_name || 'Método da encomenda' }];

  const methodSelect = (id) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">Método</Label>
      <Select value={form.methodCode || ''} onValueChange={(v) => set('methodCode', v)}>
        <SelectTrigger id={id} className="h-9"><SelectValue placeholder="Método" /></SelectTrigger>
        <SelectContent>
          {methodOptions.filter((m) => m.code).map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const field = (id, label, key, props = {}) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} className="h-9" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  const fid = `pag-${order.id}`;

  return (
    <section aria-label="Pagamento" className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          Pagamento
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(o.payment_status)}`}>
            {getPaymentStatusLabel(o.payment_status || 'pending')}
          </span>
        </p>
        {canConfirm && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
              onClick={() => setForm({ mode: 'record', amount: due || '', methodCode: o.payment_method_code || '', reference: '',
                receivedAt: nowLocal(), account: '', collectedBy: currentUserName, notes: '' })}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Registar pagamento
            </Button>
            {netReceived(o) > 0 && (
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
                onClick={() => setForm({ mode: 'refund', amount: refundDue(o) || overpaid(o) || netReceived(o), methodCode: o.payment_method_code || '',
                  reference: '', refundedAt: nowLocal(), account: '', reason: '' })}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Registar reembolso
              </Button>
            )}
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Total</dt><dd className="font-medium tabular-nums">{kz(o.total)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Recebido</dt><dd className="font-medium tabular-nums text-green-700 dark:text-green-400">{kz(o.amount_paid)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Em falta</dt><dd className={`font-medium tabular-nums ${due > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>{kz(due)}</dd></div>
        {Number(o.amount_refunded) > 0 && (
          <div><dt className="text-xs text-muted-foreground">Reembolsado</dt><dd className="font-medium tabular-nums">{kz(o.amount_refunded)}</dd></div>
        )}
      </dl>

      {refundDue(o) > 0 && (
        <p role="status" className="text-sm text-destructive flex items-start gap-1.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          Cancelada com {kz(refundDue(o))} pagos: falta reembolsar o cliente.
        </p>
      )}
      {overpaid(o) > 0 && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          Pago a mais: {kz(overpaid(o))}. Devolva a diferença com &quot;Registar reembolso&quot;.
        </p>
      )}

      {loading && !data ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> A ler os pagamentos…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há pagamentos registados.</p>
      ) : (
        <ul className="divide-y divide-border">
          {payments.map((p) => {
            const st = PAYMENT_ENTRY_STATUS[p.status] || PAYMENT_ENTRY_STATUS.reported;
            return (
              <li key={p.id} className="py-2 flex flex-wrap items-start justify-between gap-2 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium tabular-nums flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={p.status === 'voided' || p.status === 'rejected' ? 'line-through text-muted-foreground' : ''}>
                      {p.kind === 'refund' ? '− ' : ''}{kz(p.amount)}
                    </span>
                    <span className="text-muted-foreground font-normal">{p.kind === 'refund' ? 'Reembolso' : (p.method_name || p.method_code || 'Pagamento')}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.color}`}>{st.label}</span>
                  </p>
                  {p.reference && (
                    <p className="text-xs">
                      Ref.: <span className="font-mono">{p.reference}</span>
                      <button type="button" className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5" onClick={() => copy(p.reference)}>
                        <Copy className="h-3 w-3" aria-hidden="true" /> copiar
                      </button>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{origin(p)}</p>
                  {p.decision_reason && <p className="text-xs text-muted-foreground">Motivo: {p.decision_reason}</p>}
                  {p.notes && <p className="text-xs text-muted-foreground italic">{p.notes}</p>}
                  {p.duplicates?.length > 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      A mesma referência aparece em {p.duplicates.map((d) => d.order_number).join(', ')}: confirme no extracto.
                    </p>
                  )}
                </div>
                {canConfirm && (
                  <div className="flex flex-wrap gap-1">
                    {p.status === 'reported' && (
                      <>
                        <Button type="button" size="sm" className="h-8 text-xs" disabled={busy}
                          onClick={() => setForm({ mode: 'confirm', payment: p, amount: p.amount, receivedAt: nowLocal(), account: '', notes: '' })}>
                          <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Confirmar
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
                          onClick={() => setForm({ mode: 'reject', payment: p, reason: '' })}>
                          <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Rejeitar
                        </Button>
                      </>
                    )}
                    {p.status === 'confirmed' && (
                      <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={busy}
                        onClick={() => setForm({ mode: 'void', payment: p, reason: '' })}>
                        <Undo2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Anular
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <form onSubmit={submit} className="rounded-lg bg-muted/40 p-3 space-y-3" aria-label="Registo de pagamento">
          <p className="text-sm font-medium">
            {{
              confirm: `Confirmar ${kz(form.payment?.amount)} indicados${form.payment?.reference ? ` (ref. ${form.payment.reference})` : ''}`,
              reject: 'Rejeitar o pagamento indicado — o motivo vai para o cliente',
              void: `Anular ${form.payment?.kind === 'refund' ? 'o reembolso' : 'o pagamento'} de ${kz(form.payment?.amount)} — os administradores são avisados`,
              record: 'Registar um pagamento já verificado (balcão, entrega, extracto)',
              refund: `Registar um reembolso — no máximo ${kz(netReceived(o))}`,
            }[form.mode]}
          </p>

          {(form.mode === 'confirm' || form.mode === 'record' || form.mode === 'refund') && (
            <div className="grid sm:grid-cols-2 gap-3">
              {field(`${fid}-valor`, form.mode === 'refund' ? 'Valor devolvido (Kz)' : 'Valor que entrou (Kz)', 'amount',
                { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', required: true })}
              {field(`${fid}-data`, form.mode === 'refund' ? 'Devolvido em' : 'Entrou em', form.mode === 'refund' ? 'refundedAt' : 'receivedAt',
                { type: 'datetime-local' })}
              {form.mode !== 'confirm' && methodSelect(`${fid}-metodo`)}
              {form.mode !== 'confirm' && field(`${fid}-ref`, 'Referência (talão do TPA, transferência)', 'reference', { maxLength: 120 })}
              {form.mode === 'record' && field(`${fid}-quem`, 'Quem recebeu o dinheiro', 'collectedBy', { maxLength: 120 })}
              {field(`${fid}-conta`, form.mode === 'refund' ? 'Conta de onde saiu' : 'Conta ou caixa onde entrou', 'account',
                { maxLength: 120, placeholder: 'Ex.: BAI ···159, Caixa do Huambo' })}
              {form.mode !== 'refund' && field(`${fid}-nota`, 'Nota (opcional)', 'notes', { maxLength: 500 })}
            </div>
          )}

          {(form.mode === 'reject' || form.mode === 'void' || form.mode === 'refund') && (
            <div className="space-y-1">
              <Label htmlFor={`${fid}-motivo`} className="text-xs">Motivo</Label>
              <Textarea id={`${fid}-motivo`} rows={2} maxLength={300} value={form.reason || ''}
                onChange={(e) => set('reason', e.target.value)} required />
              {form.mode === 'reject' && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {REJECT_REASONS.map((r) => (
                    <button key={r} type="button" className="text-xs rounded-full border border-border px-2 py-0.5 hover:bg-muted"
                      onClick={() => set('reason', r)}>{r}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {form.needsShared && (
            <label className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
              <Checkbox checked={!!form.sharedReferenceOk} onCheckedChange={(v) => set('sharedReferenceOk', v === true)} className="mt-0.5" />
              <span>{form.sharedMessage} Confirmo no extracto que a mesma transferência pagou as duas encomendas.</span>
            </label>
          )}
          {form.error && <p role="alert" className="text-sm text-destructive">{form.error}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={busy || (form.needsShared && !form.sharedReferenceOk)}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {{ confirm: 'Confirmar pagamento', reject: 'Rejeitar', void: 'Anular', record: 'Registar pagamento', refund: 'Registar reembolso' }[form.mode]}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setForm(null)}>Cancelar</Button>
          </div>
        </form>
      )}
    </section>
  );
}
