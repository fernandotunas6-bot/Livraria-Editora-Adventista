import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Download, Loader2, RefreshCw, Wallet, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPaymentsReport } from '@/api/PlatformApi';
import { supabase } from '@/lib/supabaseClient';
import { exportPaymentMovements } from '@/lib/orderExport';
import { CHANNEL_LABELS } from '@/lib/payments';
import OrderPaymentsPanel from '@/components/admin/OrderPaymentsPanel';

const kz = (n) => `Kz ${Number(n || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2 })}`;
// Datas em Luanda (UTC+1), como a base de dados conta os dias.
const dayLuanda = (offsetDays = 0) => new Date(Date.now() + 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
const AGING = { '0-2': 'até 2 dias', '3-7': '3 a 7 dias', '8-30': '8 a 30 dias', '30+': 'mais de 30 dias' };
const OUTCOME = {
  recorded: { label: 'Gravado', color: 'bg-green-500/10 text-green-700' },
  duplicate: { label: 'Repetido', color: 'bg-muted text-muted-foreground' },
  orphan: { label: 'Sem encomenda', color: 'bg-destructive/10 text-destructive' },
  ignored: { label: 'Ignorado', color: 'bg-muted text-muted-foreground' },
  rejected: { label: 'Recusado', color: 'bg-destructive/10 text-destructive' },
};

function periodRange(key, custom) {
  const today = dayLuanda(0);
  if (key === 'today') return [today, today];
  if (key === 'yesterday') return [dayLuanda(-1), dayLuanda(-1)];
  if (key === '7d') return [dayLuanda(-6), today];
  if (key === '30d') return [dayLuanda(-29), today];
  if (key === 'month') return [`${today.slice(0, 8)}01`, today];
  if (key === 'lastmonth') {
    const d = new Date(`${today.slice(0, 8)}01T12:00:00Z`);
    d.setUTCDate(0);
    const end = d.toISOString().slice(0, 10);
    return [`${end.slice(0, 8)}01`, end];
  }
  return [custom.from || today, custom.to || today];
}

function Card({ title, value, hint, tone = '', icon: Icon }) {
  return (
    <div className="bg-card border rounded-xl p-4">
      <p className="text-xs text-muted-foreground flex items-center gap-1">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{title}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

/** Uma encomenda que pede acção, com o painel de pagamentos à mão. */
function ActionRow({ title, detail, orderId, canConfirm, currentUserName, onChanged }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <button type="button" className="w-full flex items-start justify-between gap-2 text-left text-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="min-w-0">
          <span className="font-medium">{title}</span>
          {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </button>
      {open && (
        <div className="mt-2">
          <OrderPaymentsPanel order={{ id: orderId }} canConfirm={canConfirm} currentUserName={currentUserName} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
}

/**
 * Pagamentos e caixa: o dinheiro que entrou (pela data em que entrou), o que falta receber, o
 * que espera pela equipa e o que o gateway disse. Lê `public.payments_report` (migração
 * relatorio_de_pagamentos), a mesma fonte do resumo diário, por isso os números batem certo.
 * Quem tem "Confirmar pagamentos" decide aqui os pagamentos por verificar.
 */
export default function PaymentsReportTab({ canConfirm = false, currentUserName = '' }) {
  const [period, setPeriod] = useState('7d');
  const [custom, setCustom] = useState({ from: dayLuanda(-6), to: dayLuanda(0) });
  const [report, setReport] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, to] = useMemo(() => periodRange(period, custom), [period, custom]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [r, ev] = await Promise.all([
        getPaymentsReport(from, to),
        supabase.from('payment_gateway_events')
          .select('id, received_at, provider, transaction_id, order_ref, amount, gateway_status, outcome, detail')
          .order('received_at', { ascending: false }).limit(20),
      ]);
      setReport(r);
      setEvents(ev?.data || []);
    } catch (err) {
      setError(err.message || 'Não foi possível ler o relatório.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const byDay = (report?.by_day || []).map((d) => ({ ...d, label: d.day.slice(8, 10) + '/' + d.day.slice(5, 7), received: Number(d.received) || 0 }));
  const received = report?.received || {};
  const gateway = report?.gateway || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" aria-hidden="true" /> Pagamentos e caixa</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Recebido é o dinheiro que entrou, na data em que entrou. Confirma o gateway, automaticamente, ou quem tem &quot;Confirmar pagamentos&quot;.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="caixa-periodo" className="text-xs">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger id="caixa-periodo" className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="lastmonth">Mês passado</SelectItem>
                <SelectItem value="custom">Escolher datas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === 'custom' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="caixa-de" className="text-xs">De</Label>
                <Input id="caixa-de" type="date" className="h-9" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="caixa-ate" className="text-xs">Até</Label>
                <Input id="caixa-ate" type="date" className="h-9" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </div>
            </>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Actualizar
          </Button>
          <Button variant="outline" size="sm" className="h-9" disabled={!report?.movements?.length} onClick={() => exportPaymentMovements(report)}>
            <Download className="h-4 w-4 mr-1" /> Movimentos (Excel)
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {loading && !report && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A calcular…</p>}

      {report && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card title="Recebido no período" value={kz(received.net)} tone="text-primary"
              hint={`${received.count || 0} pagamento(s) · reembolsos ${kz(received.refunds)}`} />
            <Card title="Automático (gateway)" icon={Zap} value={kz(received.automatic)} hint={`Manual (equipa): ${kz(received.manual)}`} />
            <Card title="Vendido no período" value={kz(report.sold?.value)} hint={`${report.sold?.orders || 0} encomenda(s) — não é receita`} />
            <Card title="Por receber" value={kz(report.receivable?.amount)} tone={Number(report.receivable?.amount) > 0 ? 'text-amber-700 dark:text-amber-400' : ''}
              hint={`${report.receivable?.count || 0} encomenda(s) activa(s)`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <section className="bg-card border rounded-xl p-4 lg:col-span-2" aria-labelledby="caixa-por-dia">
              <h4 id="caixa-por-dia" className="font-semibold text-sm mb-3">Recebido por dia</h4>
              {byDay.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byDay}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={70} />
                      <Tooltip formatter={(v) => kz(v)} />
                      <Bar dataKey="received" fill="#0ea5c9" radius={[4, 4, 0, 0]} name="Recebido" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-muted-foreground">Nenhum pagamento confirmado neste período.</p>}
            </section>
            <section className="bg-card border rounded-xl p-4" aria-labelledby="caixa-antiguidade">
              <h4 id="caixa-antiguidade" className="font-semibold text-sm mb-3">Por receber, por antiguidade</h4>
              <ul className="space-y-1.5 text-sm">
                {(report.receivable?.aging || []).map((a) => (
                  <li key={a.bucket} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{AGING[a.bucket] || a.bucket} ({a.count})</span>
                    <span className={`tabular-nums ${a.bucket === '30+' && Number(a.amount) > 0 ? 'text-destructive font-medium' : ''}`}>{kz(a.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <section className="bg-card border rounded-xl p-4" aria-labelledby="caixa-metodo">
              <h4 id="caixa-metodo" className="font-semibold text-sm mb-3">Por método</h4>
              {report.by_method?.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted-foreground text-left"><th className="font-normal pb-1">Método</th><th className="font-normal pb-1 text-right">Recebido</th><th className="font-normal pb-1 text-right">Reembolsado</th></tr></thead>
                  <tbody>
                    {report.by_method.map((m) => (
                      <tr key={m.method_code || 'sem'} className="border-t border-border">
                        <td className="py-1.5">{m.method_name || m.method_code || 'Sem método'} <span className="text-xs text-muted-foreground">({m.count})</span></td>
                        <td className="py-1.5 text-right tabular-nums">{kz(m.received)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{kz(m.refunded)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-sm text-muted-foreground">Sem movimentos.</p>}
            </section>
            <section className="bg-card border rounded-xl p-4" aria-labelledby="caixa-canal">
              <h4 id="caixa-canal" className="font-semibold text-sm mb-3">Por canal e colportagem</h4>
              <ul className="space-y-1.5 text-sm">
                {(report.by_channel || []).map((c) => (
                  <li key={c.channel} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{CHANNEL_LABELS[c.channel] || c.channel} ({c.count})</span>
                    <span className="tabular-nums">{kz(c.net)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t border-border pt-1.5">
                  <span className="text-muted-foreground">Recebido dos colportores</span><span className="tabular-nums">{kz(report.colportagem?.received)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Pago aos colportores</span><span className="tabular-nums">{kz(report.colportagem?.paid)}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Comissões de vendas no site</span><span className="tabular-nums">{kz(report.colportagem?.site_commissions)}</span>
                </li>
              </ul>
            </section>
          </div>

          <section className="bg-card border rounded-xl p-4" aria-labelledby="caixa-verificar">
            <h4 id="caixa-verificar" className="font-semibold text-sm flex items-center gap-2">
              Por verificar <span className="text-xs font-normal text-muted-foreground">
                {report.to_confirm?.count || 0} pagamento(s) · {kz(report.to_confirm?.amount)}
                {report.to_confirm?.cash ? ` · ${report.to_confirm.cash} em dinheiro, indicado por quem entregou` : ''}
              </span>
            </h4>
            {report.to_confirm?.items?.length ? (
              <ul className="divide-y divide-border mt-2">
                {report.to_confirm.items.map((p) => (
                  <ActionRow key={p.payment_id} orderId={p.order_id} canConfirm={canConfirm} currentUserName={currentUserName} onChanged={load}
                    title={`${p.order_number} · ${kz(p.amount)} · ${p.method_name || 'pagamento'}`}
                    detail={[
                      p.source === 'staff' ? `dinheiro recebido por ${p.collected_by || 'equipa'}` : 'indicado pelo cliente',
                      p.reference ? `ref. ${p.reference}` : '',
                      p.customer_name,
                      new Date(p.created).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }),
                    ].filter(Boolean).join(' · ')} />
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground mt-2">Nada por verificar.</p>}
          </section>

          {(report.delivered_unpaid?.count > 0 || report.refund_due?.count > 0 || report.overpaid?.count > 0) && (
            <section className="bg-card border border-destructive/30 rounded-xl p-4" aria-labelledby="caixa-accao">
              <h4 id="caixa-accao" className="font-semibold text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Dinheiro que pede acção
              </h4>
              <ul className="divide-y divide-border mt-2">
                {(report.delivered_unpaid?.orders || []).map((o) => (
                  <ActionRow key={`e-${o.order_id}`} orderId={o.order_id} canConfirm={canConfirm} currentUserName={currentUserName} onChanged={load}
                    title={`${o.order_number} · entregue sem pagamento registado`} detail={`faltam ${kz(o.outstanding)} · ${o.method || ''}`} />
                ))}
                {(report.refund_due?.orders || []).map((o) => (
                  <ActionRow key={`r-${o.order_id}`} orderId={o.order_id} canConfirm={canConfirm} currentUserName={currentUserName} onChanged={load}
                    title={`${o.order_number} · paga e cancelada`} detail={`por reembolsar ${kz(o.due)} · ${o.method || ''}`} />
                ))}
              </ul>
              {report.overpaid?.count > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">{report.overpaid.count} encomenda(s) pagas a mais ({kz(report.overpaid.amount)}): veja-as no Acompanhamento.</p>
              )}
            </section>
          )}

          <section className="bg-card border rounded-xl p-4" aria-labelledby="caixa-gateway">
            <h4 id="caixa-gateway" className="font-semibold text-sm flex items-center gap-2">
              <Zap className="h-4 w-4" aria-hidden="true" /> Gateway de pagamentos
              <span className="text-xs font-normal text-muted-foreground">
                no período: {gateway.recorded || 0} gravado(s) · {gateway.duplicate || 0} repetido(s) · {gateway.orphan || 0} sem encomenda · {gateway.rejected || 0} recusado(s)
              </span>
            </h4>
            {events.length ? (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm min-w-[560px]">
                  <thead><tr className="text-xs text-muted-foreground text-left"><th className="font-normal pb-1">Quando</th><th className="font-normal pb-1">Encomenda</th><th className="font-normal pb-1">Transacção</th><th className="font-normal pb-1 text-right">Valor</th><th className="font-normal pb-1">Resultado</th></tr></thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-border align-top">
                        <td className="py-1.5 whitespace-nowrap">{new Date(e.received_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="py-1.5 font-mono text-xs">{e.order_ref || '—'}</td>
                        <td className="py-1.5 font-mono text-xs">{e.transaction_id || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums">{e.amount != null ? kz(e.amount) : '—'}</td>
                        <td className="py-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${(OUTCOME[e.outcome] || OUTCOME.ignored).color}`}>{(OUTCOME[e.outcome] || OUTCOME.ignored).label}</span>
                          {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">
                Ainda nenhum aviso do gateway. Enquanto o gateway não estiver ligado (Vendas → Pagamentos), os pagamentos confirmam-se só pela equipa.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
