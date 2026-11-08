import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Handshake, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CodeChip } from '@/components/admin/users/userFormat';
import { DataTable, NativeSelect, Pill, Spinner, Toolbar } from '@/components/admin/igreja/registryUi';
import { downloadCsv } from '@/lib/churchRegistryApi';
import { DELIVERY_OFFER_STATUS, handoverDelivery, loadDeliveriesBoard } from '@/lib/colporteurApi';
import { kz } from '@/lib/colporteurCommission';

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const PERIODS = { 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', 90: 'Últimos 3 meses', 365: 'Último ano' };
const orderHref = (number) => `/admin?tab=orders&encomenda=${encodeURIComponent(number)}`;

/** Em que ponto está uma entrega em curso, do ponto de vista da equipa. */
export function deliveryStage(d) {
  if (d.status === 'offered') return { key: 'waiting', tone: 'amber', label: 'À espera de resposta', detail: d.expires_at ? `até ${when(d.expires_at)}` : '' };
  if (d.source === 'loja' && !d.picked_up_at) return { key: 'prepare', tone: 'red', label: 'Preparar na loja', detail: 'levanta os livros na loja' };
  if (d.source === 'stock') return { key: 'out', tone: 'blue', label: 'Com o colportor', detail: 'com os livros dele' };
  return { key: 'out', tone: 'blue', label: 'Com o colportor', detail: `livros entregues a ${when(d.picked_up_at)}` };
}

/**
 * Colportagem → Entregas: o quadro das entregas por colportor (migração 20261108110000). O que a
 * equipa tem de preparar, as ofertas à espera, as entregas com os colportores, as encomendas que
 * ficaram com a equipa e, por colportor, quantas fez e quanto ganhou.
 */
export default function DeliveriesPanel() {
  const { toast } = useToast();
  const [days, setDays] = useState('30');
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setBoard(await loadDeliveriesBoard(Number(days)));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const handover = async (d) => {
    setBusy(d.id);
    try {
      await handoverDelivery(d.id);
      toast({ title: 'Livros entregues ao colportor; o cliente foi avisado' });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    } finally {
      setBusy('');
    }
  };

  if (error && !board) {
    return (
      <div className="rounded-xl border border-border p-4 text-sm">
        <p className="font-medium">Não foi possível abrir o quadro das entregas.</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" />Tentar de novo</Button>
      </div>
    );
  }
  if (!board) return <Spinner />;

  const active = board.active || [];
  const stages = active.map((d) => ({ d, s: deliveryStage(d) }));
  const count = (key) => stages.filter((x) => x.s.key === key).length;
  const t = board.totals || {};
  const period = (PERIODS[days] || '').toLowerCase();

  const exportCsv = () => downloadCsv(`entregas-colportores-${days}-dias`,
    ['Código', 'Colportor', 'Oferecidas', 'Entregues', 'Recusadas', 'Sem resposta', 'Devolvidas', 'Em curso', 'Ganhou (Kz)'],
    board.by_colporteur.map((c) => [c.code, c.name, c.offered, c.delivered, c.declined, c.expired, c.released, c.active, Number(c.fees || 0)]));

  return (
    <div className="space-y-6">
      <Toolbar>
        <NativeSelect value={days} onChange={setDays} className="w-auto" aria-label="Período">
          {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </Toolbar>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Preparar na loja', count('prepare')],
          ['À espera de resposta', count('waiting')],
          ['Com os colportores', count('out')],
          ['Com a equipa', board.to_team.length],
          [`Entregues por colportores (${period})`, t.delivered || 0],
          ['Recusadas ou sem resposta', (t.declined || 0) + (t.expired || 0)],
          ['Ganhos dos colportores', kz(t.fees || 0)],
          ['Encomendas entregues por colportor', `${t.orders_by_colporteur || 0} de ${t.orders_offered || 0}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>

      <section aria-labelledby="entregas-em-curso" className="space-y-2">
        <h3 id="entregas-em-curso" className="text-sm font-semibold">Em curso</h3>
        {stages.length === 0 ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Nenhuma entrega com colportores neste momento.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {stages.map(({ d, s }) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium">
                    <Link to={orderHref(d.order_number)} className="text-primary hover:underline">{d.order_number}</Link>
                    <span className="font-normal text-muted-foreground"> · {d.place} · {d.items} {d.items === 1 ? 'livro' : 'livros'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <CodeChip code={d.colporteur.code} /> {d.colporteur.name}
                    {d.colporteur.phone && <> · <a href={`tel:${d.colporteur.phone}`} className="hover:underline">{d.colporteur.phone}</a></>}
                    {Number(d.fee) > 0 && <> · para ele: {kz(d.fee)}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={s.tone}>{s.label}</Pill>
                  {s.detail && <span className="text-xs text-muted-foreground">{s.detail}</span>}
                  {s.key === 'prepare' && (
                    <Button size="sm" className="h-8 text-xs" disabled={!!busy} onClick={() => handover(d)}>
                      {busy === d.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Handshake className="mr-1 h-3.5 w-3.5" />}
                      Entregue ao colportor
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="entregas-equipa" className="space-y-2">
        <h3 id="entregas-equipa" className="text-sm font-semibold">Com a equipa</h3>
        <p className="text-xs text-muted-foreground">Pagas ao domicílio que nenhum colportor aceitou, ou que foram retiradas a um colportor, e ainda não estão entregues.</p>
        {board.to_team.length === 0 ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">Nenhuma.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {board.to_team.map((o) => (
              <li key={o.order_id} className="p-3 text-sm">
                <Link to={orderHref(o.order_number)} className="font-medium text-primary hover:underline">{o.order_number}</Link>
                <span className="text-muted-foreground"> · {o.place}</span>
                {o.reason && <span className="block text-xs text-muted-foreground">{o.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="entregas-por-colportor" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="entregas-por-colportor" className="text-sm font-semibold">Por colportor ({period})</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!board.by_colporteur.length}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
        </div>
        <DataTable count={board.by_colporteur.length} empty="Ainda nenhum colportor recebeu entregas neste período."
          head={['Colportor', 'Oferecidas', 'Entregues', 'Recusadas', 'Sem resposta', 'Devolvidas', 'Em curso', 'Ganhou']}>
          {board.by_colporteur.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 font-medium"><CodeChip code={c.code} /> {c.name}</td>
              <td className="px-3 py-2 tabular-nums">{c.offered}</td>
              <td className="px-3 py-2 tabular-nums">{c.delivered}</td>
              <td className="px-3 py-2 tabular-nums">{c.declined}</td>
              <td className="px-3 py-2 tabular-nums">{c.expired}</td>
              <td className="px-3 py-2 tabular-nums">{c.released}</td>
              <td className="px-3 py-2 tabular-nums">{c.active}</td>
              <td className="px-3 py-2 tabular-nums">{kz(c.fees || 0)}</td>
            </tr>
          ))}
        </DataTable>
        <p className="text-xs text-muted-foreground">
          {DELIVERY_OFFER_STATUS.expired.label}: o prazo para aceitar acabou. Devolvidas: o colportor desistiu, a equipa retirou-lha, ou a encomenda foi dada como entregue sem os livros estarem com ele.
          Os ganhos entram na conta corrente de cada um como «Portes de entrega».
        </p>
      </section>
    </div>
  );
}
