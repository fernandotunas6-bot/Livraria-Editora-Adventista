// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, Navigation, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErro } from '@/lib/localizacao';
import {
  ON_THE_WAY, accuracyLabel, ageLabel, betterFix, liveSummary, loadLiveTracking, saveDestination,
} from '@/lib/deliveryTracking';

const DeliveryMap = lazy(() => import('@/components/maps/DeliveryMap'));

const POLL_MS = 15_000;
// A localização do telemóvel melhora nos primeiros segundos: espera-se até 20 s ou até ±20 m.
const LOCATE_FOR_MS = 20_000;
const GOOD_ENOUGH_M = 20;

/**
 * Trajeto da encomenda, para quem recebe (migração trajeto_gps).
 *
 * Mostra o ponto de entrega e, enquanto a encomenda vai a caminho, quem a leva, o caminho que já
 * fez, a distância e o tempo estimado — actualizado de 15 em 15 segundos com a página à vista.
 * Até ser entregue, o cliente afina o ponto: com a localização do telemóvel (espera pela leitura
 * mais precisa) ou arrastando-o no mapa até à porta.
 */
export default function LiveTracking({ order, orderNumber, email, onSaved }) {
  const { toast } = useToast();
  const [view, setView] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const watchRef = useRef(null);
  const timerRef = useRef(null);

  const onTheWay = ON_THE_WAY.includes(order?.delivery_status);
  const destination = view?.destination || order?.delivery_gps || null;
  const canSet = view ? view.can_set_destination : !!order?.can_set_destination;

  const refresh = useCallback(async () => {
    try {
      setView(await loadLiveTracking(orderNumber, email));
    } catch {
      // Fica o que estava: na próxima volta tenta outra vez.
    }
  }, [orderNumber, email]);

  // Uma vez ao abrir; de 15 em 15 s enquanto vai a caminho e a página está à vista.
  useEffect(() => {
    refresh();
    if (!onTheWay) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') refresh(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [refresh, onTheWay]);

  const stopLocating = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    clearTimeout(timerRef.current);
    setLocating(false);
  }, []);
  useEffect(() => stopLocating, [stopLocating]);

  const locate = () => {
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Este aparelho não dá a localização.', description: 'Arraste o ponto no mapa até à sua porta.' });
      return;
    }
    stopLocating();
    setLocating(true);
    let best = null;
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        best = betterFix(best, { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        setDraft(best);
        if (best.accuracy <= GOOD_ENOUGH_M) stopLocating();
      },
      (e) => {
        stopLocating();
        toast({ variant: 'destructive', title: 'Sem localização', description: mensagemDeErro(e?.code) });
      },
      { enableHighAccuracy: true, timeout: LOCATE_FOR_MS, maximumAge: 0 },
    );
    timerRef.current = setTimeout(stopLocating, LOCATE_FOR_MS);
  };

  const startEditing = () => {
    setDraft(destination ? { lat: destination.lat, lng: destination.lng, accuracy: destination.accuracy ?? null } : null);
    setEditing(true);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await saveDestination(orderNumber, email, draft);
      toast({ title: 'Ponto de entrega guardado', description: 'Quem entrega vê-o no mapa.' });
      setEditing(false);
      stopLocating();
      onSaved?.(saved);
      await refresh();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível guardar o ponto', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const courier = view?.courier || null;
  const shownDestination = editing ? draft : destination;
  const summary = liveSummary(view);

  return (
    <section className="bg-card border rounded-2xl p-5 space-y-3" aria-labelledby="trajeto-titulo" data-trajeto>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="trajeto-titulo" className="text-lg font-semibold flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary" aria-hidden="true" /> Trajeto da entrega
        </h3>
        {courier && !courier.stale && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" aria-hidden="true" /> Ao vivo
          </span>
        )}
      </div>

      {summary && <p className="text-sm text-foreground" aria-live="polite" data-trajeto-estado>{summary}</p>}
      {courier && !courier.stale && (
        <p className="text-xs text-muted-foreground">
          Posição {ageLabel(courier.age_s)}{courier.accuracy ? ` · ${accuracyLabel(courier.accuracy)}` : ''}. O tempo é uma estimativa pela distância.
        </p>
      )}

      <Suspense fallback={<div className="h-[260px] rounded-xl border bg-muted" />}>
        <DeliveryMap
          destination={shownDestination}
          courier={courier}
          trail={view?.trail || []}
          editable={editing}
          onDestinationChange={(p) => setDraft({ lat: p.lat, lng: p.lng, accuracy: null })}
          label="Mapa com o ponto de entrega e quem entrega"
        />
      </Suspense>

      {editing ? (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3" data-afinar-ponto>
          <p className="text-sm text-foreground">
            Arraste a casinha (ou toque no mapa) até à porta onde quer receber, ou use a localização do telemóvel junto à porta.
          </p>
          {draft && (
            <p className="text-xs text-muted-foreground">
              {Number.isFinite(draft.accuracy) ? `Localização do telemóvel ${accuracyLabel(draft.accuracy)}.` : 'Ponto marcado no mapa.'}
              {Number.isFinite(draft.accuracy) && draft.accuracy > 100 ? ' Ainda pouco precisa: arraste a casinha até ao sítio certo.' : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={locate} disabled={locating}>
              {locating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Crosshair className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {locating ? 'A procurar a localização…' : 'Usar a minha localização'}
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={!draft || saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              Guardar o ponto
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); stopLocating(); }}>
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" /> Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
            {destination
              ? <>Ponto de entrega marcado{destination.accuracy ? ` (${accuracyLabel(destination.accuracy)})` : ''}{destination.updated_at ? `, ${new Date(destination.updated_at).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.</>
              : 'Sem ponto no mapa: quem entrega usa a morada. Marque-o para o encontrarem mais depressa.'}
          </p>
          {canSet && (
            <Button type="button" size="sm" variant="outline" onClick={startEditing} data-afinar>
              <Crosshair className="mr-1.5 h-4 w-4" aria-hidden="true" /> {destination ? 'Afinar o ponto' : 'Marcar o ponto'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
