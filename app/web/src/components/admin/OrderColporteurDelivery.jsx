import React, { useCallback, useEffect, useState } from 'react';
import { Handshake, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSignal } from '@/hooks/useSignal';
import { useToast } from '@/hooks/use-toast';
import { Pill } from '@/components/admin/igreja/registryUi';
import { DELIVERY_OFFER_STATUS, handoverDelivery, loadOrderDeliveries, takeBackDelivery } from '@/lib/colporteurApi';
import { kz } from '@/lib/colporteurCommission';

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const LEVEL = { gps: 'mais perto por GPS', municipio: 'mesmo município', provincia: 'mesma província' };

/**
 * Entrega por colportor de uma encomenda (migração entregas_por_colportor): a quem foi oferecida,
 * quem aceitou, de onde saem os livros, e as acções da equipa — marcar os livros como entregues ao
 * colportor (quando ele os levanta na loja) ou retirar-lhe a entrega.
 */
export default function OrderColporteurDelivery({ order, onChanged }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [takeBack, setTakeBack] = useState(null);

  const load = useCallback(async () => {
    try { setData(await loadOrderDeliveries(order.id)); } catch { setData({ route: '', deliveries: [] }); }
  }, [order.id]);
  useEffect(() => { load(); }, [load, order.delivery_status, order.payment_status]);
  // O colportor aceitou, recusou ou avançou: aparece aqui sem recarregar.
  useSignal('painel', ['entregas'], () => { load(); });

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
      setTakeBack(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    } finally {
      setBusy('');
    }
  };

  if (!data) return null;
  const list = data.deliveries || [];
  const active = list.find((d) => ['offered', 'accepted'].includes(d.status));
  const summary = data.route === 'loja'
    ? 'A equipa faz esta entrega.'
    : active?.status === 'accepted'
      ? `Entrega com ${active.colporteur.name} (${active.colporteur.code}).`
      : active?.status === 'offered'
        ? `Oferecida a ${active.colporteur.name} (${active.colporteur.code}), à espera até ${when(active.expires_at)}.`
        : order.payment_status === 'paid' ? 'Ainda sem colportor.' : 'Vai a um colportor quando estiver paga.';

  return (
    <section aria-label="Entrega por colportor" className="rounded-lg border border-border p-3 space-y-2 text-sm">
      <p className="font-semibold">Entrega por colportor</p>
      <p className="text-muted-foreground">{summary}</p>

      {active?.status === 'accepted' && (
        <p className="text-xs text-muted-foreground">
          {active.source === 'stock' ? 'Entrega com os livros que tem à consignação.'
            : active.picked_up_at ? `Livros entregues ao colportor a ${when(active.picked_up_at)}.`
              : 'Levanta os livros na loja: prepare-os e marque quando lhos entregar.'}
          {' '}Telefone: {active.colporteur.phone}.{Number(active.fee) > 0 ? ` Ganha ${kz(active.fee)}.` : ''}
        </p>
      )}

      {active && (
        takeBack?.id === active.id ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
            e.preventDefault();
            run('r', () => takeBackDelivery(active.id, takeBack.reason.trim()), 'Entrega retirada ao colportor: a equipa entrega');
          }}>
            <Input className="h-8 max-w-xs" placeholder="Motivo (vai para o colportor)" value={takeBack.reason} maxLength={280}
              onChange={(e) => setTakeBack({ ...takeBack, reason: e.target.value })} required minLength={5} />
            <Button type="submit" size="sm" variant="destructive" className="h-8" disabled={!!busy}>Retirar</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setTakeBack(null)}>Cancelar</Button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.status === 'accepted' && active.source === 'loja' && !active.picked_up_at && (
              <Button size="sm" className="h-8 text-xs" disabled={!!busy}
                onClick={() => run('h', () => handoverDelivery(active.id), 'Livros entregues ao colportor; o cliente foi avisado')}>
                {busy === 'h' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Handshake className="mr-1 h-3.5 w-3.5" />}
                Entregue ao colportor
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={!!busy} onClick={() => setTakeBack({ id: active.id, reason: '' })}>
              <Undo2 className="mr-1 h-3.5 w-3.5" />Retirar ao colportor
            </Button>
          </div>
        )
      )}

      {list.length > 0 && (
        <ul className="divide-y divide-border">
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
              <span>
                {d.colporteur.name} ({d.colporteur.code})
                <span className="text-muted-foreground"> · {LEVEL[d.match_level] || ''}{d.distance_km != null ? `, ${Number(d.distance_km).toLocaleString('pt-AO')} km` : ''} · {when(d.offered_at)}</span>
                {d.reason && <span className="block text-muted-foreground">{d.reason}</span>}
              </span>
              <Pill tone={(DELIVERY_OFFER_STATUS[d.status] || {}).tone || 'muted'}>{(DELIVERY_OFFER_STATUS[d.status] || {}).label || d.status}</Pill>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
