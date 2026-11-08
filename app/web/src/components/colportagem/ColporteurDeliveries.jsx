import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, MapPin, MessageCircle, Navigation, Package, Phone, Truck, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import SignaturePad from '@/components/SignaturePad';
import { Pill } from '@/components/admin/igreja/registryUi';
import { kz } from '@/lib/colporteurCommission';
import CourierShare from '@/components/delivery/CourierShare';
import {
  DELIVERY_OFFER_STATUS, deliveryStep, loadMyDeliveries, respondDelivery, setAcceptsDeliveries, setMyLocation,
} from '@/lib/colporteurApi';

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits.startsWith('244') ? digits : `244${digits.replace(/^0/, '')}`}` : '';
};

/** Quanto falta para o prazo da oferta, em palavras. */
export function timeLeft(expiresAt, now = Date.now()) {
  const ms = Date.parse(expiresAt || '') - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'prazo esgotado';
  const min = Math.round(ms / 60000);
  if (min < 60) return `faltam ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `faltam ${h} h ${min % 60} min` : `até ${when(expiresAt)}`;
}

function Items({ items }) {
  return (
    <ul className="text-sm space-y-0.5">
      {(items || []).map((it, i) => (
        <li key={i}>{it.qty}× {it.title}{it.variant ? ` (${it.variant})` : ''}{it.code ? <span className="ml-1 font-mono text-xs text-muted-foreground">{it.code}</span> : null}</li>
      ))}
    </ul>
  );
}

/**
 * Entregas do colportor (migração entregas_por_colportor): a encomenda paga vai ao colportor mais
 * próximo do cliente — por GPS quando os dois têm localização, senão pelo município e pela
 * província. Aqui ele regista onde está, aceita ou recusa dentro do prazo, vê os dados do cliente
 * só depois de aceitar, e marca a saída e a entrega, com a assinatura de quem recebe.
 */
export default function ColporteurDeliveries({ onChanged }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [locating, setLocating] = useState(false);
  const [deliverForm, setDeliverForm] = useState(null);
  const [releaseForm, setReleaseForm] = useState(null);
  const signatureRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await loadMyDeliveries());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try {
      const res = await fn();
      if (ok) toast({ title: typeof ok === 'function' ? ok(res) : ok });
      setDeliverForm(null);
      setReleaseForm(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Este aparelho não dá a localização.' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        run('local', () => setMyLocation(coords.latitude, coords.longitude), 'Localização registada');
      },
      () => {
        setLocating(false);
        toast({ variant: 'destructive', title: 'Sem acesso à localização', description: 'Autorize a localização no navegador e tente outra vez.' });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> A carregar as entregas…</p>;

  const list = data.deliveries || [];
  const offered = list.filter((d) => d.status === 'offered');
  const accepted = list.filter((d) => d.status === 'accepted');
  const past = list.filter((d) => !['offered', 'accepted'].includes(d.status));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border p-3 space-y-3" aria-label="Disponibilidade e localização">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">Aceito fazer entregas</span>
            <span className="block text-xs text-muted-foreground">Encomendas pagas perto de si. Fica com os portes da encomenda.</span>
          </span>
          <Switch checked={!!data.accepts_deliveries} disabled={busy === 'aceita'}
            onCheckedChange={(v) => run('aceita', () => setAcceptsDeliveries(v), v ? 'Passa a receber entregas' : 'Deixa de receber entregas')} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            <MapPin className="mr-1 inline h-4 w-4" aria-hidden="true" />
            {data.latitude != null
              ? `Localização registada a ${when(data.location_updated_at)}. Recebe as entregas mais perto daqui.`
              : 'Sem localização: recebe só as entregas do seu município e da sua província.'}
          </span>
          <Button size="sm" variant="outline" onClick={locate} disabled={locating || busy === 'local'}>
            {locating || busy === 'local' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Navigation className="mr-1.5 h-4 w-4" />}
            {data.latitude != null ? 'Actualizar' : 'Registar a minha localização'}
          </Button>
        </div>
      </section>

      {offered.length > 0 && (
        <section aria-label="Entregas oferecidas" className="space-y-2">
          <h3 className="font-semibold">Para aceitar</h3>
          {offered.map((d) => (
            <article key={d.id} className="rounded-xl border-2 border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{d.order_number} · {d.place}</p>
                <Pill tone="amber">{timeLeft(d.expires_at)}</Pill>
              </div>
              <p className="text-sm text-muted-foreground">
                {d.distance_km != null ? `A ${Number(d.distance_km).toLocaleString('pt-AO')} km de si. ` : ''}
                {Number(d.fee) > 0 ? `Ganha ${kz(d.fee)} de portes. ` : 'Envio grátis para o cliente: sem portes. '}
                {d.has_stock ? 'Tem estes livros consigo.' : 'Os livros levantam-se na loja.'}
              </p>
              <Items items={d.items} />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" disabled={!!busy} onClick={() => run(`a-${d.id}`, () => respondDelivery(d.id, true), (r) => (r?.status === 'expired' ? 'O prazo já tinha acabado' : 'Entrega aceite'))}>
                  {busy === `a-${d.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Aceitar
                </Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(`r-${d.id}`, () => respondDelivery(d.id, false), 'Recusada: passa a outro colportor')}>
                  <X className="mr-1.5 h-4 w-4" />Recusar
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}

      {accepted.length > 0 && (
        <section aria-label="As minhas entregas" className="space-y-2">
          <h3 className="font-semibold">Para entregar</h3>
          {accepted.map((d) => {
            const c = d.customer || {};
            const waitingStore = d.source === 'loja' && !d.picked_up_at;
            const out = d.delivery_status === 'out_for_delivery';
            return (
              <article key={d.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{d.order_number}</p>
                  <Pill tone={out ? 'blue' : 'muted'}>{out ? 'Saiu para entrega' : waitingStore ? 'Levantar na loja' : 'Pronta para sair'}</Pill>
                </div>
                <div className="text-sm space-y-0.5">
                  <p className="font-medium">{c.name}</p>
                  {c.phone && (
                    <p className="flex flex-wrap gap-3">
                      <a className="text-primary inline-flex items-center gap-1" href={`tel:${c.phone}`}><Phone className="h-3.5 w-3.5" />{c.phone}</a>
                      {waLink(c.phone) && <a className="text-primary inline-flex items-center gap-1" href={waLink(c.phone)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a>}
                    </p>
                  )}
                  <p>{c.address || [c.street, c.locality, c.municipality, c.province].filter(Boolean).join(', ')}</p>
                  {c.reference && <p className="text-muted-foreground">Referência: {c.reference}</p>}
                  {c.relative_name && <p className="text-muted-foreground">Contacto próximo: {c.relative_name} {c.relative_phone}</p>}
                  {c.notes && <p className="text-muted-foreground italic">Nota: {c.notes}</p>}
                  {c.gps && !d.order_id && (
                    <a className="text-primary inline-flex items-center gap-1" href={`https://www.google.com/maps?q=${c.gps.lat},${c.gps.lng}`} target="_blank" rel="noreferrer">
                      <MapPin className="h-3.5 w-3.5" />Abrir a localização do cliente no mapa
                    </a>
                  )}
                </div>
                {/* O mapa até ao cliente e a partilha da posição (migração trajeto_gps). */}
                {d.order_id && <CourierShare orderId={d.order_id} deliveryStatus={d.delivery_status} />}
                <Items items={d.items} />
                <p className="text-xs text-muted-foreground">
                  {d.source === 'stock' ? 'Entrega com os livros que tem consigo: saem da sua conta à consignação quando marcar "Entregue".'
                    : d.picked_up_at ? `A equipa entregou-lhe os livros a ${when(d.picked_up_at)}.`
                      : 'Levante os livros na loja: a equipa marca quando lhos entregar, e só depois pode sair.'}
                  {Number(d.fee) > 0 ? ` Portes para si: ${kz(d.fee)}.` : ''}
                </p>

                {deliverForm?.id === d.id ? (
                  <form className="rounded-lg bg-muted/40 p-3 space-y-3" onSubmit={(e) => {
                    e.preventDefault();
                    const signature = signatureRef.current?.getDataURL();
                    if (deliverForm.name.trim().length < 2) { toast({ variant: 'destructive', title: 'Escreva o nome de quem recebeu.' }); return; }
                    if (!signature) { toast({ variant: 'destructive', title: 'Falta a assinatura de quem recebeu.' }); return; }
                    run(`e-${d.id}`, () => deliveryStep(d.id, 'delivered', { recipientName: deliverForm.name.trim(), recipientId: deliverForm.bi.trim(), signature }), 'Entrega registada. Obrigado!');
                  }}>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`rec-${d.id}`} className="text-xs">Nome de quem recebe</Label>
                        <Input id={`rec-${d.id}`} value={deliverForm.name} maxLength={120} onChange={(e) => setDeliverForm({ ...deliverForm, name: e.target.value })} required />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`bi-${d.id}`} className="text-xs">N.º do Bilhete (opcional)</Label>
                        <Input id={`bi-${d.id}`} value={deliverForm.bi} maxLength={60} onChange={(e) => setDeliverForm({ ...deliverForm, bi: e.target.value })} />
                      </div>
                    </div>
                    <SignaturePad ref={signatureRef} label="Assinatura de quem recebe"
                      hint="Quem recebe assina como está no Bilhete de Identidade, com o dedo ou caneta." />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" disabled={!!busy}>
                        {busy === `e-${d.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Confirmar a entrega
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDeliverForm(null)}>Cancelar</Button>
                    </div>
                  </form>
                ) : releaseForm?.id === d.id ? (
                  <form className="rounded-lg bg-muted/40 p-3 space-y-2" onSubmit={(e) => {
                    e.preventDefault();
                    run(`d-${d.id}`, () => deliveryStep(d.id, 'release', { reason: releaseForm.reason.trim() }), 'Entrega devolvida: passa a outro colportor ou à equipa');
                  }}>
                    <Label htmlFor={`mot-${d.id}`} className="text-xs">Porque não pode entregar?</Label>
                    <Input id={`mot-${d.id}`} value={releaseForm.reason} maxLength={300} onChange={(e) => setReleaseForm({ ...releaseForm, reason: e.target.value })} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" variant="destructive" disabled={!!busy}>Devolver a entrega</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setReleaseForm(null)}>Cancelar</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {!out && (
                      <Button size="sm" variant="outline" disabled={!!busy || waitingStore}
                        onClick={() => run(`s-${d.id}`, () => deliveryStep(d.id, 'out_for_delivery'), 'O cliente foi avisado de que saiu')}>
                        <Truck className="mr-1.5 h-4 w-4" />Saiu para entrega
                      </Button>
                    )}
                    <Button size="sm" disabled={!!busy || waitingStore} onClick={() => setDeliverForm({ id: d.id, name: c.name || '', bi: '' })}>
                      <Package className="mr-1.5 h-4 w-4" />Entregue
                    </Button>
                    {!d.picked_up_at && (
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setReleaseForm({ id: d.id, reason: '' })}>
                        <Undo2 className="mr-1.5 h-4 w-4" />Não posso entregar
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {offered.length === 0 && accepted.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Sem entregas de momento. Quando uma encomenda paga perto de si precisar de entrega, recebe um aviso aqui, por WhatsApp e no telemóvel.
        </p>
      )}

      {past.length > 0 && (
        <section aria-label="Entregas anteriores">
          <h3 className="font-semibold mb-1">Últimos 30 dias</h3>
          <ul className="divide-y divide-border text-sm">
            {past.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{d.order_number} · {d.place}</span>
                <span className="flex items-center gap-2">
                  {d.status === 'delivered' && Number(d.fee) > 0 && <span className="tabular-nums text-emerald-700 dark:text-emerald-400">+{kz(d.fee)}</span>}
                  <Pill tone={(DELIVERY_OFFER_STATUS[d.status] || DELIVERY_OFFER_STATUS.cancelled).tone}>{(DELIVERY_OFFER_STATUS[d.status] || {}).label || d.status}</Pill>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
