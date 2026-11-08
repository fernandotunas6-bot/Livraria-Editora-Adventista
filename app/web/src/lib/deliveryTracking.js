/**
 * Trajeto da encomenda com GPS (migração trajeto_gps): as contas e as frases dos dois lados.
 *
 *  - Quem entrega (colportor ou equipa) partilha a posição enquanto a encomenda vai a caminho. O
 *    telemóvel manda de 10 em 10 segundos quando anda pelo menos 25 m, ou de 30 em 30 segundos
 *    parado (`shouldSendPosition`): a bateria e os dados móveis de quem entrega também contam.
 *  - Quem recebe vê a posição, a distância e o tempo estimado, e afina o ponto de entrega.
 *
 * A vista que o cliente recebe é montada na Edge Function (supabase/functions/app/deliveryTracking.ts).
 */
import { supabase, APP_API_URL } from '@/lib/supabaseClient';
import { distanciaKm, formatarDistancia } from '@/lib/localizacao';

export const ON_THE_WAY = ['shipped', 'in_transit', 'out_for_delivery'];
export const SEND_EVERY_MS = 10_000;
export const SEND_MOVE_M = 25;
export const SEND_IDLE_MS = 30_000;
/** Centro de Luanda: onde o mapa abre quando ainda não há ponto nenhum. */
export const LUANDA = { lat: -8.8383, lng: 13.2344 };

const metresBetween = (a, b) => {
  const km = distanciaKm({ latitude: a?.lat, longitude: a?.lng }, { latitude: b?.lat, longitude: b?.lng });
  return km === null ? null : km * 1000;
};

/** Mandar esta posição agora? `last`: `{ lat, lng, at }` da última enviada. */
export function shouldSendPosition(last, next, now = Date.now()) {
  if (!next || !Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (!last) return true;
  const elapsed = now - last.at;
  if (elapsed < SEND_EVERY_MS) return false;
  const moved = metresBetween(last, next);
  return (moved !== null && moved >= SEND_MOVE_M) || elapsed >= SEND_IDLE_MS;
}

/** A melhor leitura: a mais precisa (ou a primeira). */
export function betterFix(current, candidate) {
  if (!candidate) return current || null;
  if (!current) return candidate;
  const a = Number.isFinite(current.accuracy) ? current.accuracy : Infinity;
  const b = Number.isFinite(candidate.accuracy) ? candidate.accuracy : Infinity;
  return b <= a ? candidate : current;
}

/** "±8 m", "±1,2 km"; nada sem valor. */
export function accuracyLabel(metres) {
  const n = Number(metres);
  if (metres === null || metres === undefined || metres === '' || !Number.isFinite(n) || n < 0) return '';
  return n < 1000 ? `±${Math.max(1, Math.round(n))} m` : `±${(n / 1000).toFixed(1).replace('.', ',')} km`;
}

/** "cerca de 7 min", "cerca de 1 h 10 min". */
export function etaLabel(minutes) {
  const n = Number(minutes);
  if (minutes === null || minutes === undefined || !Number.isFinite(n) || n <= 0) return '';
  if (n < 60) return `cerca de ${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `cerca de ${h} h ${m} min` : `cerca de ${h} h`;
}

/** "agora mesmo", "há 40 s", "há 3 min", "há 2 h". */
export function ageLabel(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 15) return 'agora mesmo';
  if (n < 60) return `há ${Math.round(n)} s`;
  if (n < 3600) return `há ${Math.round(n / 60)} min`;
  return `há ${Math.round(n / 3600)} h`;
}

/** Distância para ler ("320 m", "1,7 km"). */
export const distanceLabel = (km) => formatarDistancia(km) || '';

/** Ligações para navegar até ao ponto (Google Maps e Waze abrem a navegação no telemóvel). */
export function navigationLinks(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

/** A frase de estado para quem recebe, a partir da vista de /track/live. */
export function liveSummary(view) {
  if (!view) return '';
  const c = view.courier;
  if (!view.on_the_way) return 'Ainda não saiu para entrega. Quando sair, vê aqui quem a leva, a caminho.';
  if (!c) return 'A encomenda vai a caminho. Quem a leva aparece no mapa quando partilhar a localização.';
  // Só o nome: "colportor/colportora" pedia saber o género de quem entrega, e o cliente não precisa.
  if (c.stale) return `Última posição de ${c.name} ${ageLabel(c.age_s)} — pode estar sem rede.`;
  const parts = [`${c.name} vai a caminho`];
  if (view.distance_km !== null && view.distance_km !== undefined) parts.push(`a ${distanceLabel(view.distance_km)}`);
  if (view.eta_min) parts.push(etaLabel(view.eta_min));
  return parts.join(' · ');
}

// --- Pedidos ------------------------------------------------------------------------------

async function post(path, body) {
  const res = await fetch(`${APP_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível actualizar o mapa.');
  return data;
}

/** Quem recebe: o trajeto ao vivo (número da encomenda e email, como no rastreio). */
export const loadLiveTracking = (orderNumber, email) => post('/track/live', { orderNumber, email });

/** Quem recebe: afinar o ponto de entrega. */
export const saveDestination = (orderNumber, email, point) => post('/track/destination', {
  orderNumber, email, lat: point.lat, lng: point.lng, accuracy: point.accuracy ?? null,
});

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message || 'Não foi possível.');
  return data;
};

/** Quem entrega: o ponto do cliente, a morada e a partilha. */
export const loadRouteInfo = (orderId) => rpc('delivery_route_info', { p_order_id: orderId });

/** Quem entrega: mandar a posição. */
export const sharePosition = (orderId, fix) => rpc('delivery_share_position', {
  p_order_id: orderId, p_lat: fix.lat, p_lng: fix.lng,
  p_accuracy: Number.isFinite(fix.accuracy) ? fix.accuracy : null,
  p_heading: Number.isFinite(fix.heading) ? fix.heading : null,
  p_speed: Number.isFinite(fix.speed) ? fix.speed : null,
});

/** Quem entrega: parar de partilhar. */
export const stopSharing = (orderId) => rpc('delivery_stop_sharing', { p_order_id: orderId });
