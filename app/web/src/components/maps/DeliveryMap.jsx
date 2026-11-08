import React, { useEffect, useRef, useState } from 'react';
import { LUANDA } from '@/lib/deliveryTracking';

/**
 * Mapa da entrega (OpenStreetMap, com a biblioteca Leaflet): o ponto de entrega, quem entrega e o
 * caminho que já fez. Com `editable`, o ponto de entrega arrasta-se (ou toca-se no mapa) e
 * `onDestinationChange` recebe `{ lat, lng }`.
 *
 * O Leaflet só se carrega quando um mapa aparece: as outras páginas não pagam por ele. Sem rede
 * para os mosaicos, o mapa fica cinzento mas os pontos e a distância continuam, no texto à volta.
 */

let leaflet = null;
function loadLeaflet() {
  if (!leaflet) {
    leaflet = Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([mod]) => mod.default || mod)
      .catch((err) => { leaflet = null; throw err; });
  }
  return leaflet;
}

// Marcadores em HTML (divIcon): as imagens por omissão do Leaflet partem com o empacotador.
const HOME = `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0e7490;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:16px;line-height:1">🏠</span></div>`;
const COURIER = (stale) => `<div style="position:relative;width:26px;height:26px">${stale ? '' : '<span style="position:absolute;inset:-8px;border-radius:50%;background:rgba(37,99,235,.25);animation:mapa-pulso 1.8s ease-out infinite"></span>'}<span style="position:absolute;inset:0;border-radius:50%;background:${stale ? '#94a3b8' : '#2563eb'};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:13px">🛵</span></div>`;
const ME = '<div style="width:18px;height:18px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 0 0 2px rgba(22,163,74,.35)"></div>';

const valid = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
const ll = (p) => [Number(p.lat), Number(p.lng)];

export default function DeliveryMap({
  destination = null,
  courier = null,
  me = null,
  trail = [],
  editable = false,
  onDestinationChange,
  height = 260,
  label = 'Mapa da entrega',
}) {
  const box = useRef(null);
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fitKey = useRef('');
  const changeRef = useRef(onDestinationChange);
  changeRef.current = onDestinationChange;

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !box.current || ref.current) return;
      const map = L.map(box.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      map.setView([LUANDA.lat, LUANDA.lng], 12);
      ref.current = { L, map, layers: {} };
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      ref.current?.map.remove();
      ref.current = null;
    };
  }, []);

  // Tocar no mapa, no modo de afinar, põe lá o ponto.
  useEffect(() => {
    if (!ready) return undefined;
    const { map } = ref.current;
    if (!editable) return undefined;
    const onClick = (e) => changeRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [ready, editable]);

  useEffect(() => {
    if (!ready) return;
    const { L, map, layers } = ref.current;
    const put = (key, point, make) => {
      if (!valid(point)) {
        if (layers[key]) { layers[key].remove(); delete layers[key]; }
        return;
      }
      if (!layers[key]) layers[key] = make().addTo(map);
      else if (layers[key].setLatLng) layers[key].setLatLng(ll(point));
    };

    // O caminho já feito, por baixo dos pontos.
    const line = (trail || []).filter((p) => Array.isArray(p) && p.length === 2);
    if (line.length > 1) {
      if (!layers.trail) layers.trail = L.polyline(line, { color: '#2563eb', weight: 4, opacity: 0.7 }).addTo(map);
      else layers.trail.setLatLngs(line);
    } else if (layers.trail) { layers.trail.remove(); delete layers.trail; }

    // A precisão do ponto de entrega, como um círculo à volta dele.
    const acc = Number(destination?.accuracy);
    if (valid(destination) && Number.isFinite(acc) && acc > 15 && acc <= 2000) {
      if (!layers.accuracy) layers.accuracy = L.circle(ll(destination), { radius: acc, color: '#0e7490', weight: 1, fillOpacity: 0.08 }).addTo(map);
      else { layers.accuracy.setLatLng(ll(destination)); layers.accuracy.setRadius(acc); }
    } else if (layers.accuracy) { layers.accuracy.remove(); delete layers.accuracy; }

    put('destination', destination, () => {
      const m = L.marker(ll(destination), {
        icon: L.divIcon({ html: HOME, className: '', iconSize: [34, 34], iconAnchor: [17, 34] }),
        draggable: !!editable, keyboard: true, title: 'Ponto de entrega', alt: 'Ponto de entrega',
      });
      m.on('dragend', () => {
        const p = m.getLatLng();
        changeRef.current?.({ lat: p.lat, lng: p.lng });
      });
      return m;
    });
    if (layers.destination?.dragging) {
      if (editable) layers.destination.dragging.enable(); else layers.destination.dragging.disable();
    }
    put('courier', courier, () => L.marker(ll(courier), {
      icon: L.divIcon({ html: COURIER(!!courier?.stale), className: '', iconSize: [26, 26], iconAnchor: [13, 13] }),
      title: 'Quem entrega', alt: 'Quem entrega', zIndexOffset: 500,
    }));
    if (layers.courier && courier) layers.courier.setIcon(L.divIcon({ html: COURIER(!!courier.stale), className: '', iconSize: [26, 26], iconAnchor: [13, 13] }));
    put('me', me, () => L.marker(ll(me), {
      icon: L.divIcon({ html: ME, className: '', iconSize: [18, 18], iconAnchor: [9, 9] }), title: 'Eu', alt: 'A minha posição', zIndexOffset: 600,
    }));

    // Enquadrar quando aparecem pontos novos (não a cada actualização: quem afastou o mapa fica onde está).
    const points = [destination, courier, me].filter(valid).map(ll);
    const key = [valid(destination), valid(courier), valid(me)].join('');
    if (points.length && key !== fitKey.current) {
      fitKey.current = key;
      if (points.length === 1) map.setView(points[0], 16);
      else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 17 });
    }
  }, [ready, destination, courier, me, trail, editable]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted" style={{ height }}>
      <style>{'@keyframes mapa-pulso{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}'}</style>
      <div ref={box} className="h-full w-full" role="region" aria-label={label} data-mapa-entrega />
      {!ready && !failed && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">A abrir o mapa…</p>
      )}
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
          Não foi possível abrir o mapa. A distância e as ligações para navegar continuam aqui.
        </p>
      )}
    </div>
  );
}
