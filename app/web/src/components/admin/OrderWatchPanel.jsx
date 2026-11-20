// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, Hand, Loader2, Mail, RefreshCw, Siren } from 'lucide-react';
import pb from '@/lib/dataClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { acknowledgeAlert, acknowledgeOrder } from '@/lib/opsApi';

const fmtKz = (v) => `${Number(v || 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const fmtHours = (h) => (h >= 48 ? `${Math.floor(h / 24)} dias` : `${h} h`);

// Ordem da operação: da esquerda (entrada) para a direita (fecho).
const FLOW = ['awaiting_payment', 'paid', 'preparing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];

/**
 * Acompanhamento das encomendas: quantas estão em cada passo, quais estão paradas tempo
 * demais (as regras estão em supabase/functions/app/orderWatch.ts) e problemas reportados
 * pelos clientes. O agendador corre isto de hora a hora e envia o resumo às 07:29 de Luanda.
 */
export default function OrderWatchPanel({ onOpenOrder }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await pb.send('/admin/orders/watch', { method: 'GET' }));
    } catch (err) {
      setError(err?.status === 404
        ? 'A Edge Function publicada ainda não tem o acompanhamento. Publique a versão nova da função "app".'
        : err.message || 'Não foi possível carregar o acompanhamento.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (summary) => {
    setBusy(summary ? 'summary' : 'run');
    try {
      const r = await pb.send('/admin/orders/watch/run', { method: 'POST', body: { summary } });
      toast({
        title: summary ? 'Resumo enviado' : 'Vigilância actualizada',
        description: summary ? `${r.summary_sent} email(s) de resumo enviados.` : `${r.alerts} alerta(s); ${r.notified} aviso(s) novos à equipa.`,
      });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const takeOrder = async (orderId, orderNumber) => {
    setBusy(`ack-${orderId}`);
    try {
      const r = await acknowledgeOrder(orderId);
      toast({ title: r?.already ? `Já assumida por ${r.by_name || 'outra pessoa'}` : `Assumiu a encomenda ${orderNumber}` });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const takeAlert = async (alert) => {
    setBusy(`alert-${alert.order_id}-${alert.kind}`);
    try {
      await acknowledgeAlert(alert.order_id, alert.kind);
      toast({ title: 'Fica consigo', description: 'O alerta deixa de subir de nível. Resolva-o no passo da encomenda.' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const resolve = async (alert) => {
    const note = window.prompt(`Como foi resolvido o problema da encomenda ${alert.order_number}?`, '');
    if (note === null) return;
    try {
      await pb.send('/admin/orders/feedback-resolve', { method: 'POST', body: { order_id: alert.order_id, note } });
      toast({ title: 'Problema marcado como resolvido' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    }
  };

  if (loading && !data) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  const summary = data?.summary;
  const labels = data?.stage_labels || {};
  const alerts = data?.alerts || [];
  const critical = alerts.filter((a) => a.severity === 'critical');

  return (
    <div className="space-y-6">
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui as acções. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Resumo por email todos os dias às 07:29.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => run(false)} disabled={!!busy}>
            {busy === 'run' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Verificar agora
          </Button>
          <Button variant="outline" size="sm" onClick={() => run(true)} disabled={!!busy}>
            {busy === 'summary' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} Enviar resumo
          </Button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{summary.newToday}</p><p className="text-xs text-muted-foreground">Novas (24 h) · {fmtKz(summary.revenueToday)}</p></div>
            <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{summary.deliveredToday}</p><p className="text-xs text-muted-foreground">Entregues (24 h)</p></div>
            <div className="rounded-xl border bg-card p-4"><p className="text-2xl font-bold">{summary.confirmedByCustomer}</p><p className="text-xs text-muted-foreground">Confirmadas pelo cliente (24 h)</p></div>
            <div className={`rounded-xl border p-4 ${critical.length ? 'border-red-300 bg-red-50' : alerts.length ? 'border-amber-300 bg-amber-50' : 'bg-card'}`}>
              <p className="text-2xl font-bold">{alerts.length}</p>
              <p className="text-xs text-muted-foreground">A precisar de atenção{critical.length ? ` · ${critical.length} crítica(s)` : ''}</p>
            </div>
          </div>

          {/* O fluxo: cada coluna é um passo; a cor diz se há encomendas paradas nesse passo. */}
          <div className="overflow-x-auto">
            <div className="flex min-w-[720px] items-stretch gap-2">
              {FLOW.map((stage, i) => {
                const stuck = alerts.filter((a) => a.kind !== 'customer_problem' && stageOfAlert(a.kind) === stage).length;
                return (
                  <React.Fragment key={stage}>
                    <div className={`flex-1 rounded-xl border p-3 text-center ${stuck ? 'border-amber-300 bg-amber-50' : 'bg-card'}`}>
                      <p className="text-xl font-bold">{summary.stages[stage] || 0}</p>
                      <p className="text-[11px] leading-tight text-muted-foreground">{labels[stage] || stage}</p>
                      {stuck > 0 && <p className="mt-1 text-[10px] font-semibold text-amber-800">{stuck} parada(s)</p>}
                    </div>
                    {i < FLOW.length - 1 && <div className="self-center text-muted-foreground" aria-hidden>→</div>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </>
      )}

      {(data?.unacknowledged || []).length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 border-b border-primary/20 p-4">
            <Hand className="h-4 w-4 text-primary" aria-hidden />
            <h3 className="text-lg font-semibold">Por assumir ({data.unacknowledged.length})</h3>
            <span className="text-xs text-muted-foreground">Quem assume fica responsável; se ninguém assumir a tempo, sobe às urgências.</span>
          </div>
          <ul className="divide-y divide-primary/10">
            {data.unacknowledged.map((o) => (
              <li key={o.order_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <span className="font-mono text-xs text-primary">{o.order_number}</span>
                  <span className="ml-2 font-medium">{o.customer_name || 'Cliente'}</span>
                  <span className="ml-2 text-muted-foreground">
                    {o.shipping_method === 'pickup' ? `Levantamento: ${o.pickup_store || 'loja'}` : o.shipping_method === 'express' ? 'Entrega expressa' : o.shipping_method === 'digital' ? 'Edição digital (sem envio)' : 'Entrega ao domicílio'}
                    {' · '}{fmtKz(o.total)} · {new Date(o.created).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  {onOpenOrder && <Button size="sm" variant="outline" onClick={() => onOpenOrder(o.order_number)}>Ver</Button>}
                  <Button size="sm" className="btn-primary" onClick={() => takeOrder(o.order_id, o.order_number)} disabled={busy === `ack-${o.order_id}`}>
                    {busy === `ack-${o.order_id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Assumir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <Siren className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-lg font-semibold">A precisar de atenção</h3>
        </div>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Nenhuma encomenda parada nem problema por resolver.</div>
        ) : (
          <ul className="divide-y">
            {alerts.map((a) => (
              <li key={`${a.order_id}:${a.kind}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${a.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
                      {a.severity === 'critical' ? 'Crítico' : 'Atenção'}
                    </span>
                    <span className="font-mono text-xs text-primary">{a.order_number}</span>
                    <span className="text-sm font-medium">{a.label}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" aria-hidden /> {fmtHours(a.hours)} neste passo{a.limit ? ` (limite ${fmtHours(a.limit)})` : ''}{a.customer_name ? ` · ${a.customer_name}` : ''}
                  </p>
                  {a.detail && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800"><AlertTriangle className="mr-1 inline h-3 w-3" />{a.detail}</p>}
                  {(a.acknowledged_by_name || a.acknowledged_at) && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">Com {a.acknowledged_by_name || 'alguém da equipa'} a tratar</p>
                  )}
                  {a.escalated_at && !a.acknowledged_at && (
                    <p className="mt-1 text-xs font-medium text-red-700">Subiu às urgências: ninguém assumiu a tempo</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {onOpenOrder && <Button size="sm" variant="outline" onClick={() => onOpenOrder(a.order_number)}>Ver encomenda</Button>}
                  {a.kind === 'new_unacknowledged' ? (
                    <Button size="sm" onClick={() => takeOrder(a.order_id, a.order_number)} disabled={!!busy}>Assumir encomenda</Button>
                  ) : !a.acknowledged_at && (
                    <Button size="sm" variant="secondary" onClick={() => takeAlert(a)} disabled={busy === `alert-${a.order_id}-${a.kind}`}>Estou a tratar</Button>
                  )}
                  {a.kind === 'customer_problem' && <Button size="sm" onClick={() => resolve(a)}>Marcar resolvido</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function stageOfAlert(kind) {
  return {
    new_unacknowledged: 'awaiting_payment',
    delivery_overdue: 'in_transit',
    payment_pending: 'awaiting_payment',
    not_prepared: 'paid',
    preparing_too_long: 'preparing',
    pickup_waiting: 'shipped',
    in_transit_too_long: 'in_transit',
    out_for_delivery_too_long: 'out_for_delivery',
  }[kind];
}
