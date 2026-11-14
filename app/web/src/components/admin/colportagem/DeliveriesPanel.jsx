import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Handshake, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignal } from '@/hooks/useSignal';
import { useToast } from '@/hooks/use-toast';
import { CodeChip } from '@/components/admin/users/userFormat';
import { DataTable, NativeSelect, Pill, Spinner, Toolbar } from '@/components/admin/igreja/registryUi';
import { downloadCsv } from '@/lib/churchRegistryApi';
import { DELIVERY_OFFER_STATUS, colporteurRatings, handoverDelivery, loadDeliveriesBoard, ratingText } from '@/lib/colporteurApi';
import { kz } from '@/lib/colporteurCommission';

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const PERIODS = { 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', 90: 'Últimos 3 meses', 365: 'Último ano' };
const orderHref = (number) => `/admin?tab=orders&encomenda=${encodeURIComponent(number)}`;

/** Há quanto tempo: «há 3 h», «há 2 dias». */
export function since(iso, now = Date.now()) {
  if (!iso) return '';
  const hours = Math.floor((now - new Date(iso).getTime()) / 3600000);
  if (hours < 1) return 'há menos de 1 h';
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

/** Em que ponto está uma entrega em curso, do ponto de vista da equipa. */
export function deliveryStage(d) {
  if (d.status === 'offered') return { key: 'waiting', tone: 'amber', label: 'À espera de resposta', detail: d.expires_at ? `até ${when(d.expires_at)}` : '' };
  const accepted = d.responded_at ? ` · aceite ${since(d.responded_at)}` : '';
  if (d.source === 'loja' && !d.picked_up_at) return { key: 'prepare', tone: 'red', label: 'Preparar na loja', detail: `levanta os livros ${d.pickup_store ? `em ${d.pickup_store}` : 'na loja'}${accepted}` };
  const label = d.delivery_status === 'out_for_delivery' ? 'A caminho do cliente' : 'Com o colportor';
  if (d.source === 'stock') return { key: 'out', tone: 'blue', label, detail: `com livros à consignação${accepted}` };
  return { key: 'out', tone: 'blue', label, detail: `livros entregues a ${when(d.picked_up_at)}` };
}

/** Quantas entregas pedem acção da equipa: os livros por preparar na loja. */
export const countToPrepare = (active = []) => active.filter((d) => deliveryStage(d).key === 'prepare').length;

/**
 * Colportagem → Entregas: o quadro das entregas por colportor (migração 20261108170000). O que a
 * equipa tem de preparar, as ofertas à espera, as entregas com os colportores, as encomendas que
 * ficaram com a equipa e, por colportor, quantas fez e quanto ganhou. Actualiza-se com os sinais em
 * tempo real; sem eles, de minuto a minuto. `onCount` recebe quantas há por preparar.
 */
export default function DeliveriesPanel({ onCount }) {
  const { toast } = useToast();
  const [days, setDays] = useState('30');
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  // A média das avaliações dos clientes de cada colportor (sem a migração, a coluna fica a «—»).
  const [ratings, setRatings] = useState(() => new Map());
  useEffect(() => {
    let vivo = true;
    colporteurRatings().then((m) => { if (vivo) setRatings(m); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Mudar de período depressa não deixa uma resposta antiga por cima da mais recente.
  const lastRequest = useRef(0);
  const load = useCallback(async () => {
    const request = ++lastRequest.current;
    try {
      const next = await loadDeliveriesBoard(Number(days));
      if (request !== lastRequest.current) return;
      setBoard(next);
      setError('');
      onCount?.(countToPrepare(next.active));
    } catch (err) {
      if (request === lastRequest.current) setError(err.message);
    }
  }, [days, onCount]);
  useEffect(() => { load(); }, [load]);
  const live = useSignal('painel', ['entregas'], () => { load(); });
  useEffect(() => {
    const timer = setInterval(load, live ? 300000 : 60000);
    return () => clearInterval(timer);
  }, [load, live]);

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
        {error && <p role="alert" className="text-xs text-destructive">Não foi possível actualizar: {error}</p>}
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
                    {Number(d.fee) > 0 && <> · ganha {kz(d.fee)}</>}
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
          head={['Colportor', 'Oferecidas', 'Entregues', 'Recusadas', 'Sem resposta', 'Devolvidas', 'Em curso', 'Ganhou', 'Avaliação']}>
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
              <td className="whitespace-nowrap px-3 py-2 text-amber-600 dark:text-amber-400">{ratings.get(c.id) ? ratingText(ratings.get(c.id).avg, ratings.get(c.id).count) : <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}
        </DataTable>
        <p className="text-xs text-muted-foreground">
          {DELIVERY_OFFER_STATUS.expired.label}: o prazo para aceitar acabou. Devolvidas: o colportor desistiu, a equipa retirou-lha, ou a encomenda foi dada como entregue antes de ter os livros.
          Os ganhos entram na conta corrente de cada um como «Portes de entrega».
        </p>
      </section>
    </div>
  );
}
