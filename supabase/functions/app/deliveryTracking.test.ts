// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from "vitest";
import {
  HIDE_AFTER_MS, STALE_AFTER_MS, canSetDestination, destinationOf, etaMinutes, firstName, inAngola, kmBetween,
  liveTrackingView, parseDestination,
} from "./deliveryTracking.ts";

const NOW = Date.parse("2026-11-08T15:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ORDER = {
  id: "o1", shipping_method: "delivery", status: "shipped", delivery_status: "out_for_delivery",
  delivery_gps_lat: -8.9, delivery_gps_lng: 13.37, delivery_gps_accuracy: 9.5, delivery_gps_updated_at: ago(3600_000),
};
const POS = {
  order_id: "o1", courier_name: "Ana Maria Colportora", courier_kind: "colportor", lat: -8.885, lng: 13.37,
  accuracy_m: 8, heading: 180, updated_at: ago(20_000), stopped_at: null,
  trail: [{ lat: -8.88, lng: 13.37 }, { lat: -8.885, lng: 13.37 }, { lat: null, lng: 1 }],
};

describe("trajeto com GPS — o que quem recebe vê", () => {
  it("a caminho: quem entrega (só o primeiro nome), o caminho, a distância e o tempo estimado", () => {
    const v = liveTrackingView(ORDER, POS, NOW);
    expect(v.on_the_way).toBe(true);
    expect(v.courier).toMatchObject({ name: "Ana", kind: "colportor", lat: -8.885, accuracy: 8, age_s: 20, stale: false });
    expect(v.trail).toEqual([[-8.88, 13.37], [-8.885, 13.37]]);
    expect(v.distance_km).toBeCloseTo(1.67, 1);
    expect(v.eta_min).toBe(7);
    expect(v.destination).toMatchObject({ lat: -8.9, lng: 13.37, accuracy: 9.5 });
  });

  it("sem notícias há mais de 5 min: mostra a última posição, sem tempo estimado; há mais de 1 h: nada", () => {
    const parada = liveTrackingView(ORDER, { ...POS, updated_at: ago(STALE_AFTER_MS + 1000) }, NOW);
    expect(parada.courier?.stale).toBe(true);
    expect(parada.eta_min).toBeNull();
    expect(liveTrackingView(ORDER, { ...POS, updated_at: ago(HIDE_AFTER_MS + 1000) }, NOW).courier).toBeNull();
  });

  it("antes de sair, depois de entregue, com a partilha parada ou num levantamento: não há quem entrega", () => {
    expect(liveTrackingView({ ...ORDER, delivery_status: "preparing" }, POS, NOW).courier).toBeNull();
    expect(liveTrackingView({ ...ORDER, delivery_status: "delivered" }, POS, NOW).courier).toBeNull();
    expect(liveTrackingView(ORDER, { ...POS, stopped_at: ago(1000) }, NOW).courier).toBeNull();
    expect(liveTrackingView({ ...ORDER, shipping_method: "pickup" }, POS, NOW).on_the_way).toBe(false);
    expect(liveTrackingView(ORDER, null, NOW)).toMatchObject({ courier: null, trail: [], distance_km: null, eta_min: null });
  });

  it("o ponto de entrega: 0,0 das encomendas antigas não conta; afina-se até ser entregue", () => {
    expect(destinationOf({ delivery_gps_lat: 0, delivery_gps_lng: 0 })).toBeNull();
    expect(destinationOf({ delivery_gps_lat: "-8.9", delivery_gps_lng: "13.37" })).toMatchObject({ lat: -8.9, lng: 13.37, accuracy: null });
    expect(canSetDestination(ORDER)).toBe(true);
    expect(canSetDestination({ ...ORDER, delivery_status: "delivered" })).toBe(false);
    expect(canSetDestination({ ...ORDER, status: "cancelled" })).toBe(false);
    expect(canSetDestination({ ...ORDER, shipping_method: "pickup" })).toBe(false);
    expect(canSetDestination({ ...ORDER, shipping_method: "digital" })).toBe(false);
  });

  it("parseDestination: números em Angola, com a precisão arredondada", () => {
    expect(parseDestination({ lat: "-8.9012", lng: 13.3734, accuracy: 9.54 })).toEqual({ lat: -8.9012, lng: 13.3734, accuracy: 9.5 });
    expect(parseDestination({ lat: 38.72, lng: -9.14 })).toMatch(/fora de Angola/);
    expect(parseDestination({ lat: "", lng: 13 })).toMatch(/Indique o ponto/);
    expect(parseDestination({ lat: -8.9, lng: 13.37, accuracy: -3 })).toEqual({ lat: -8.9, lng: 13.37, accuracy: null });
  });

  it("contas de apoio", () => {
    expect(inAngola(-8.9, 13.37)).toBe(true);
    expect(inAngola(0, 0)).toBe(false);
    expect(kmBetween({ lat: -8.9, lng: 13.37 }, { lat: -8.9, lng: 13.37 })).toBe(0);
    expect(kmBetween(null, { lat: 1, lng: 1 })).toBeNull();
    expect(etaMinutes(0)).toBe(1);
    expect(etaMinutes(10)).toBe(41);
    expect(etaMinutes(null)).toBeNull();
    expect(firstName("  Bento  Colportor ")).toBe("Bento");
  });
});
