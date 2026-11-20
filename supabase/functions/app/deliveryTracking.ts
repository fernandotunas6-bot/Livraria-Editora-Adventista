// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Trajeto da encomenda com GPS (migração trajeto_gps): o que quem recebe vê de quem entrega.
 *
 * Como nas entregas com estafeta (Glovo, Uber Eats, Bolt Food, Yango): a posição de quem entrega
 * só se mostra enquanto a encomenda vai a caminho e com notícias recentes; o nome é só o
 * primeiro; o tempo é uma estimativa pela distância, dita como tal.
 *
 * Sem nada de Deno nem de Supabase: testado no `npm test` (deliveryTracking.test.ts).
 */

type Row = Record<string, any>;

/** Passos em que a encomenda vai a caminho do cliente. */
export const ON_THE_WAY = ["shipped", "in_transit", "out_for_delivery"];
/** Sem notícias há mais de 5 minutos: mostra-se "última posição há X min". */
export const STALE_AFTER_MS = 5 * 60_000;
/** Sem notícias há mais de 1 hora: deixa de se mostrar (o telemóvel de quem entrega desligou). */
export const HIDE_AFTER_MS = 60 * 60_000;
/** Velocidade média numa cidade angolana, de mota ou de carro, e o desvio das ruas. */
export const CITY_SPEED_KMH = 20;
export const ROAD_FACTOR = 1.35;

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Angola, com folga (a mesma conta que private.in_angola). */
export function inAngola(lat: unknown, lng: unknown): boolean {
  const a = num(lat);
  const b = num(lng);
  return a !== null && b !== null && a >= -18.6 && a <= -4.0 && b >= 11.3 && b <= 24.5;
}

/** Distância em linha recta, em km (Haversine). */
export function kmBetween(a: { lat: unknown; lng: unknown } | null, b: { lat: unknown; lng: unknown } | null): number | null {
  const aLat = num(a?.lat), aLng = num(a?.lng), bLat = num(b?.lat), bLng = num(b?.lng);
  if (aLat === null || aLng === null || bLat === null || bLng === null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutos até chegar, pela distância em linha recta e pelas ruas (estimativa; pelo menos 1). */
export function etaMinutes(km: number | null): number | null {
  if (km === null || !Number.isFinite(km) || km < 0) return null;
  return Math.max(1, Math.round((km * ROAD_FACTOR / CITY_SPEED_KMH) * 60));
}

/** O ponto de entrega do cliente, ou nada (0,0 era o valor por omissão das encomendas antigas). */
export function destinationOf(order: Row | null | undefined) {
  const lat = num(order?.delivery_gps_lat);
  const lng = num(order?.delivery_gps_lng);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
  return {
    lat, lng,
    accuracy: num(order?.delivery_gps_accuracy),
    updated_at: order?.delivery_gps_updated_at || null,
  };
}

const isCancelled = (o: Row) => o?.status === "cancelled" || o?.delivery_status === "cancelled";
const hasDelivery = (o: Row) => ["delivery", "express"].includes(String(o?.shipping_method || ""));

/** O cliente ainda pode afinar o ponto de entrega? */
export function canSetDestination(order: Row | null | undefined): boolean {
  return !!order && hasDelivery(order) && !isCancelled(order) && order.delivery_status !== "delivered";
}

/** Só o primeiro nome de quem entrega: quem recebe precisa de saber quem vem, não mais. */
export const firstName = (name: unknown) => String(name || "").trim().split(/\s+/)[0] || "";

/**
 * O que a página de rastreio mostra do trajeto: o ponto de entrega, quem entrega (se vai a caminho
 * e há notícias recentes), o caminho já feito, a distância e o tempo estimado.
 */
/** Quem entrega, como o cliente o vê. */
export type CourierView = {
  name: string;
  kind: "colportor" | "equipa";
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  updated_at: unknown;
  age_s: number;
  stale: boolean;
};

export function liveTrackingView(order: Row, position: Row | null, now = Date.now()) {
  const destination = destinationOf(order);
  const onTheWay = hasDelivery(order) && !isCancelled(order) && ON_THE_WAY.includes(String(order?.delivery_status || ""));
  let courier: CourierView | null = null;
  let trail: [number, number][] = [];
  if (onTheWay && position && !position.stopped_at) {
    const updated = Date.parse(String(position.updated_at || ""));
    const age = Number.isFinite(updated) ? now - updated : Infinity;
    if (age <= HIDE_AFTER_MS && inAngola(position.lat, position.lng)) {
      courier = {
        name: firstName(position.courier_name) || "Estafeta",
        kind: position.courier_kind === "colportor" ? "colportor" : "equipa",
        lat: num(position.lat)!, lng: num(position.lng)!,
        accuracy: num(position.accuracy_m), heading: num(position.heading),
        updated_at: position.updated_at,
        age_s: Math.max(0, Math.round(age / 1000)),
        stale: age > STALE_AFTER_MS,
      };
      trail = (Array.isArray(position.trail) ? position.trail : [])
        .map((p: Row) => [num(p?.lat), num(p?.lng)] as [number | null, number | null])
        .filter((p): p is [number, number] => p[0] !== null && p[1] !== null)
        .slice(-200);
    }
  }
  const km = courier && destination ? kmBetween(courier, destination) : null;
  return {
    delivery_status: order?.delivery_status || "received",
    on_the_way: onTheWay,
    can_set_destination: canSetDestination(order),
    destination,
    courier,
    trail,
    distance_km: km === null ? null : Math.round(km * 100) / 100,
    eta_min: courier && !courier.stale ? etaMinutes(km) : null,
  };
}

/** O ponto que o cliente manda para afinar a entrega: números em Angola e a precisão em metros. */
export function parseDestination(body: Row | null | undefined): { lat: number; lng: number; accuracy: number | null } | string {
  const lat = num(body?.lat);
  const lng = num(body?.lng);
  if (lat === null || lng === null) return "Indique o ponto no mapa.";
  if (!inAngola(lat, lng)) return "Esse ponto fica fora de Angola. Marque o sítio onde quer receber.";
  const accuracy = num(body?.accuracy);
  return { lat, lng, accuracy: accuracy === null || accuracy < 0 ? null : Math.round(accuracy * 10) / 10 };
}
