import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Navigation, Radio, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { distanciaKm, mensagemDeErro } from '@/lib/localizacao';
import {
  ON_THE_WAY, accuracyLabel, ageLabel, distanceLabel, etaLabel, loadRouteInfo, navigationLinks, sharePosition,
  shouldSendPosition, stopSharing,
} from '@/lib/deliveryTracking';
import {
  estadoDoTrajetoNativo, iniciarTrajetoNativo, ouvirTrajetoNativo, pararTrajetoNativo, trajetoNativoDisponivel,
} from '@/lib/trajetoNativo';
import { eAppAndroid } from '@/lib/nativeApp';

/** Enquanto o telemóvel partilha sozinho: como se sabe que continua (o sinal de cada sistema). */
const SINAL_DA_PARTILHA = {
  android: 'a notificação «A partilhar a localização» fica na barra',
  ios: 'indicador azul no topo',
};

const DeliveryMap = lazy(() => import('@/components/maps/DeliveryMap'));

// Minutos até chegar: a mesma conta que a Edge Function (deliveryTracking.ts), para os dois lados
// dizerem o mesmo tempo.
const etaFromKm = (km) => (km === null ? null : Math.max(1, Math.round(((km * 1.35) / 20) * 60)));

/**
 * Trajeto da encomenda, para quem entrega (migração trajeto_gps): o colportor com a entrega
 * aceite, ou alguém da equipa com "Gerir encomendas".
 *
 * Mostra o ponto do cliente (com a precisão), a distância e as ligações para navegar (Google
 * Maps, Waze). Enquanto a encomenda vai a caminho, partilha a posição com o cliente: o GPS do
 * telemóvel manda-a de 10 em 10 segundos quando anda, e o ecrã fica ligado (Wake Lock) para a
 * partilha não parar. Fechar a página pára de mandar; o cliente vê "última posição há X min".
 *
 * Dentro dos apps (lib/trajetoNativo.js) é o telemóvel que lê o GPS e manda a posição: continua
 * com o ecrã apagado, noutra página ou noutra app, até à entrega ou a «Parar de partilhar».
 */
export default function CourierShare({ orderId, deliveryStatus, compact = false }) {
  const { toast } = useToast();
  const [info, setInfo] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [fix, setFix] = useState(null);
  const [sentAt, setSentAt] = useState(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [, setTick] = useState(0);
  const watchRef = useRef(null);
  const lastSent = useRef(null);
  const sendingRef = useRef(false);
  const lockRef = useRef(null);
  // Nos apps: o telemóvel partilha sozinho; aqui só se ouve o que ele vai fazendo.
  const [noApp, setNoApp] = useState(false);
  const ouvirRef = useRef(null);

  const onTheWay = ON_THE_WAY.includes(deliveryStatus);

  const load = useCallback(async () => {
    try {
      setInfo(await loadRouteInfo(orderId));
    } catch (err) {
      // Sem a migração trajeto_gps (a função ainda não existe): não se mostra nada.
      if (/could not find the function|schema cache|does not exist/i.test(err.message)) setMissing(true);
      else setError(err.message);
    }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);

  const releaseLock = () => {
    lockRef.current?.release?.().catch?.(() => {});
    lockRef.current = null;
  };
  const keepScreenOn = async () => {
    try {
      lockRef.current = await navigator.wakeLock?.request?.('screen');
    } catch {
      // Sem Wake Lock (iPhone antigo, poupança de energia): a partilha corre enquanto o ecrã estiver ligado.
    }
  };

  const stop = useCallback(async (tell = true) => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    watchRef.current = null;
    releaseLock();
    ouvirRef.current?.();
    ouvirRef.current = null;
    pararTrajetoNativo();
    setSharing(false);
    if (tell) {
      try { await stopSharing(orderId); } catch { /* fica parada do lado de cá */ }
    }
  }, [orderId]);

  // Sair da página pára o GPS (sem avisar o servidor: o cliente vê "última posição há X min").
  // No app não: o telemóvel continua a partilhar, e aqui só se deixa de ouvir.
  useEffect(() => () => {
    if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
    releaseLock();
    ouvirRef.current?.();
    ouvirRef.current = null;
  }, []);

  // O que o telemóvel conta: as leituras do GPS, os envios, os erros e o fim da partilha.
  const ouvintesNativos = useCallback(() => ({
    leitura: ({ lat, lng, accuracy }) => setFix({ lat, lng, accuracy, heading: null, speed: null }),
    enviado: ({ quando }) => { setSentAt(Number(quando) || Date.now()); setError(''); },
    erro: ({ mensagem }) => setError(mensagem || 'A posição não seguiu.'),
    terminou: ({ mensagem }) => {
      ouvirRef.current?.();
      ouvirRef.current = null;
      setSharing(false);
      toast({ title: 'A partilha terminou', description: mensagem || undefined });
    },
  }), [toast]);

  // No app: a partilha pode já correr desde antes (saiu-se da página e voltou-se).
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!await trajetoNativoDisponivel() || !vivo) return;
      setNoApp(true);
      const estado = await estadoDoTrajetoNativo();
      if (!vivo || !estado.activa || estado.encomenda !== String(orderId)) return;
      setSharing(true);
      if (estado.enviadoEm) setSentAt(Number(estado.enviadoEm));
      const parar = await ouvirTrajetoNativo(ouvintesNativos());
      if (vivo) ouvirRef.current = parar; else parar();
    })().catch(() => {});
    return () => { vivo = false; };
  }, [orderId, ouvintesNativos]);

  // A encomenda foi entregue ou cancelada: parar.
  useEffect(() => {
    if (sharing && !onTheWay) stop(false);
  }, [sharing, onTheWay, stop]);

  // Voltar à página: o Wake Lock cai quando o ecrã se apaga, e pede-se outra vez.
  useEffect(() => {
    if (!sharing) return undefined;
    const again = () => { if (document.visibilityState === 'visible' && !lockRef.current) keepScreenOn(); };
    document.addEventListener('visibilitychange', again);
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => { document.removeEventListener('visibilitychange', again); clearInterval(id); };
  }, [sharing]);

  const send = async (next) => {
    if (sendingRef.current || !shouldSendPosition(lastSent.current, next)) return;
    sendingRef.current = true;
    try {
      await sharePosition(orderId, next);
      lastSent.current = { lat: next.lat, lng: next.lng, at: Date.now() };
      setSentAt(Date.now());
      setError('');
    } catch (err) {
      setError(err.message);
      if (/terminou|não está a caminho|Só quem entrega/i.test(err.message)) {
        stop(false);
        toast({ title: 'A partilha terminou', description: err.message });
      }
    } finally {
      sendingRef.current = false;
    }
  };

  const startNativo = async () => {
    setError('');
    setSharing(true);
    try {
      ouvirRef.current = await iniciarTrajetoNativo(orderId, ouvintesNativos());
    } catch (err) {
      setSharing(false);
      toast({ variant: 'destructive', title: 'Não foi possível partilhar', description: err.message });
    }
  };

  const start = () => {
    if (noApp) {
      startNativo();
      return;
    }
    if (!navigator.geolocation) {
      toast({ variant: 'destructive', title: 'Este aparelho não dá a localização.' });
      return;
    }
    setError('');
    setSharing(true);
    lastSent.current = null;
    keepScreenOn();
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = {
          lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy,
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          speed: Number.isFinite(coords.speed) ? coords.speed : null,
        };
        setFix(next);
        send(next);
      },
      (e) => {
        setError(mensagemDeErro(e?.code));
        if (Number(e?.code) === 1) stop(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
  };

  const destination = info?.destination || null;
  const links = navigationLinks(destination);
  const me = fix || (info?.sharing?.mine && !info.sharing.stopped_at ? { lat: info.sharing.lat, lng: info.sharing.lng } : null);
  const km = me && destination ? distanciaKm({ latitude: me.lat, longitude: me.lng }, { latitude: destination.lat, longitude: destination.lng }) : null;
  const trail = (info?.sharing?.mine && Array.isArray(info.sharing.trail) ? info.sharing.trail : [])
    .map((p) => [Number(p.lat), Number(p.lng)]).filter((p) => p.every(Number.isFinite));
  if (missing) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-partilha-entrega>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Navigation className="h-4 w-4 text-primary" aria-hidden="true" /> Trajeto até ao cliente
        </p>
        {sharing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
            <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse" aria-hidden="true" /> A partilhar
          </span>
        )}
      </div>

      {!compact && (
        <Suspense fallback={<div className="h-[220px] rounded-xl border bg-muted" />}>
          <DeliveryMap destination={destination} me={me} trail={trail} height={220} label="Mapa com o ponto do cliente e a minha posição" />
        </Suspense>
      )}

      <p className="text-xs text-muted-foreground">
        {destination
          ? <>Ponto do cliente{destination.accuracy ? ` ${accuracyLabel(destination.accuracy)}` : ''}{km !== null ? ` · a ${distanceLabel(km)}, ${etaLabel(etaFromKm(km))}` : ''}.</>
          : 'O cliente não marcou o ponto no mapa: use a morada, a referência e o telefone.'}
      </p>
      {links && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={links.google} target="_blank" rel="noreferrer"><MapPin className="mr-1.5 h-4 w-4" aria-hidden="true" />Navegar (Google Maps)</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={links.waze} target="_blank" rel="noreferrer"><Navigation className="mr-1.5 h-4 w-4" aria-hidden="true" />Waze</a>
          </Button>
        </div>
      )}

      {onTheWay ? (
        sharing ? (
          <div className="space-y-1">
            <p className="text-xs text-foreground" aria-live="polite">
              {fix
                ? <>O cliente vê-o no mapa · GPS {accuracyLabel(fix.accuracy)}{sentAt ? ` · enviado ${ageLabel((Date.now() - sentAt) / 1000)}` : ''}.</>
                : <><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />À espera do GPS…</>}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {noApp
                ? `Pode apagar o ecrã ou mudar de app: o trajeto continua a seguir até à entrega (${SINAL_DA_PARTILHA[eAppAndroid() ? 'android' : 'ios']}).`
                : 'Deixe esta página aberta durante a entrega: fechar pára a partilha.'}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => stop(true)}>
              <Square className="mr-1.5 h-4 w-4" aria-hidden="true" /> Parar de partilhar
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Nos apps a partilha continua com o ecrã apagado: diz-se antes de o telemóvel pedir a
                localização (a «divulgação clara» que a Google Play pede, e a Apple também lê). */}
            {noApp && (
              <p className="text-[11px] text-muted-foreground" data-aviso-localizacao>
                Ao partilhar, a app envia a sua localização ao cliente desta encomenda de alguns em alguns segundos,
                mesmo com o ecrã apagado ou noutra app, até à entrega ou até carregar em «Parar de partilhar».
              </p>
            )}
            <Button type="button" size="sm" onClick={start} data-partilhar>
              <Radio className="mr-1.5 h-4 w-4" aria-hidden="true" /> Partilhar a minha localização com o cliente
            </Button>
          </div>
        )
      ) : (
        <p className="text-[11px] text-muted-foreground">Quando marcar que saiu para entrega, pode partilhar a sua localização com o cliente.</p>
      )}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
