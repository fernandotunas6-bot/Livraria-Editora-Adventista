import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Quem recebe: o trajeto ao vivo e o ponto de entrega afinado (migração trajeto_gps).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let view = null;
const api = {
  loadLiveTracking: vi.fn(async () => view),
  saveDestination: vi.fn(async (n, e, p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, updated_at: '2026-11-08T15:00:00Z' })),
};
vi.mock('@/lib/deliveryTracking', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {}, APP_API_URL: 'http://api.invalid' }));
let mapProps = null;
vi.mock('@/components/maps/DeliveryMap', () => ({ default: (props) => { mapProps = props; return <div data-mapa-falso />; } }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const { default: LiveTracking } = await import('./LiveTracking');

let root;
let host;
const ORDER = { order_number: 'LA-1', shipping_method: 'delivery', delivery_status: 'out_for_delivery', can_set_destination: true, delivery_gps: { lat: -8.9, lng: 13.37, accuracy: 30 } };
async function mount(order = ORDER, onSaved = () => {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<LiveTracking order={order} orderNumber="LA-1" email="maria@exemplo.ao" onSaved={onSaved} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const button = (text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const click = (el) => act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  mapProps = null;
  Object.values(api).forEach((f) => f.mockClear());
  view = {
    on_the_way: true, can_set_destination: true, destination: { lat: -8.9, lng: 13.37, accuracy: 30 },
    courier: { name: 'Ana', kind: 'colportor', lat: -8.885, lng: 13.37, accuracy: 8, age_s: 20, stale: false },
    trail: [[-8.88, 13.37], [-8.885, 13.37]], distance_km: 1.67, eta_min: 7,
  };
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('LiveTracking', () => {
  it('mostra quem vem, a distância, o tempo e "Ao vivo"; o mapa recebe os dois pontos e o caminho', async () => {
    await mount();
    expect(api.loadLiveTracking).toHaveBeenCalledWith('LA-1', 'maria@exemplo.ao');
    expect(host.textContent).toContain('Ana vai a caminho · a 1,7 km · cerca de 7 min');
    expect(host.textContent).toContain('Ao vivo');
    expect(mapProps.courier.name).toBe('Ana');
    expect(mapProps.trail).toHaveLength(2);
    expect(mapProps.editable).toBe(false);
  });

  it('afinar o ponto: arrastar no mapa e guardar', async () => {
    const onSaved = vi.fn();
    await mount(ORDER, onSaved);
    await click(button('Afinar o ponto'));
    expect(mapProps.editable).toBe(true);
    await act(async () => mapProps.onDestinationChange({ lat: -8.9013, lng: 13.3741 }));
    expect(host.textContent).toContain('Ponto marcado no mapa.');
    await click(button('Guardar o ponto'));
    expect(api.saveDestination).toHaveBeenCalledWith('LA-1', 'maria@exemplo.ao', { lat: -8.9013, lng: 13.3741, accuracy: null });
    expect(onSaved).toHaveBeenCalled();
    expect(mapProps.editable).toBe(false);
  });

  it('entregue: não se afina; sem quem entrega ainda, diz quando aparece', async () => {
    view = { ...view, courier: null, distance_km: null, eta_min: null, can_set_destination: false };
    await mount({ ...ORDER, can_set_destination: false });
    expect(button('Afinar o ponto')).toBeFalsy();
    expect(host.textContent).toContain('aparece no mapa quando partilhar a localização');
  });
});
