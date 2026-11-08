import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Quem entrega: o ponto do cliente, navegar, e partilhar a posição (migração trajeto_gps).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let info = null;
const api = {
  loadRouteInfo: vi.fn(async () => info),
  sharePosition: vi.fn(async () => ({ skipped: false })),
  stopSharing: vi.fn(async () => ({ stopped: true })),
};
vi.mock('@/lib/deliveryTracking', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {}, APP_API_URL: 'http://api.invalid' }));
vi.mock('@/components/maps/DeliveryMap', () => ({ default: () => <div data-mapa-falso /> }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: CourierShare } = await import('./CourierShare');

let root;
let host;
let emit = null;
const geo = { watchPosition: vi.fn((ok) => { emit = ok; return 7; }), clearWatch: vi.fn() };
async function mount(status) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<CourierShare orderId="o1" deliveryStatus={status} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const button = (text) => [...host.querySelectorAll('button, a')].find((b) => b.textContent.includes(text));
const click = (el) => act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockClear());
  geo.watchPosition.mockClear();
  geo.clearWatch.mockClear();
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  info = { destination: { lat: -8.9, lng: 13.37, accuracy: 9 }, address: 'Rua 1', sharing: null };
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('CourierShare', () => {
  it('antes de sair: o ponto do cliente e navegar, sem partilha', async () => {
    await mount('confirmed');
    expect(host.textContent).toContain('Ponto do cliente ±9 m');
    expect(button('Navegar (Google Maps)').getAttribute('href')).toContain('destination=-8.9,13.37');
    expect(button('Waze')).toBeTruthy();
    expect(button('Partilhar a minha localização')).toBeFalsy();
    expect(host.textContent).toContain('Quando marcar que saiu para entrega');
  });

  it('a caminho: partilhar manda a posição do GPS; parar avisa o servidor', async () => {
    await mount('out_for_delivery');
    await click(button('Partilhar a minha localização'));
    expect(geo.watchPosition).toHaveBeenCalled();
    expect(geo.watchPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
    await act(async () => { emit({ coords: { latitude: -8.885, longitude: 13.37, accuracy: 8, heading: null, speed: null } }); await new Promise((r) => setTimeout(r, 0)); });
    expect(api.sharePosition).toHaveBeenCalledWith('o1', { lat: -8.885, lng: 13.37, accuracy: 8, heading: null, speed: null });
    expect(host.textContent).toContain('O cliente vê-o no mapa');
    expect(host.textContent).toContain('a 1,7 km');
    await click(button('Parar de partilhar'));
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
    expect(api.stopSharing).toHaveBeenCalledWith('o1');
  });

  it('sem a migração, não mostra nada', async () => {
    api.loadRouteInfo.mockRejectedValueOnce(new Error('Could not find the function public.delivery_route_info'));
    await mount('out_for_delivery');
    expect(host.textContent).toBe('');
  });
});
