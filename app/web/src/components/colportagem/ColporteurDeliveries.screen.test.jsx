import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// O primeiro render (Radix no jsdom) pode passar dos 5 s numa máquina carregada.
vi.setConfig({ testTimeout: 30000 });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
// O jsdom não tem canvas: um contexto 2D que não desenha chega para a tela de assinatura abrir.
HTMLCanvasElement.prototype.getContext = function getContext() {
  const noop = () => {};
  return { setTransform: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fillRect: noop, drawImage: noop,
    putImageData: noop, getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }) };
};

const api = vi.hoisted(() => ({
  loadMyDeliveries: vi.fn(), respondDelivery: vi.fn(), deliveryStep: vi.fn(), setMyLocation: vi.fn(), setAcceptsDeliveries: vi.fn(),
  loadOrderDeliveries: vi.fn(), handoverDelivery: vi.fn(), takeBackDelivery: vi.fn(),
}));
vi.mock('@/lib/colporteurApi', async (importOriginal) => ({ ...(await importOriginal()), ...api }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'perfil-1' } }) }));
const signals = vi.hoisted(() => ({ byTopic: {} }));
vi.mock('@/hooks/useSignal', () => ({
  useSignal: (topic, events, cb) => { signals.byTopic[topic] = { events, fire: cb }; return false; },
}));

const { default: ColporteurDeliveries, locationIsOld } = await import('./ColporteurDeliveries');
const { default: OrderColporteurDelivery } = await import('@/components/admin/OrderColporteurDelivery');
const { kz } = await import('@/lib/colporteurCommission');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
async function mount(node) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(node));
  await act(async () => {});
  return host;
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); });
const button = (scope, text) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

const MINE = {
  accepts_deliveries: true, latitude: null, longitude: null, location_updated_at: null,
  deliveries: [
    { id: 'o1', status: 'offered', order_number: 'ENC-1', place: 'Zango, Viana, Luanda', distance_km: 2.1, fee: 1500, has_stock: true,
      expires_at: new Date(Date.now() + 45 * 60000).toISOString(), items: [{ title: 'Livro A', qty: 2 }] },
    { id: 'a1', status: 'accepted', source: 'loja', picked_up_at: null, order_number: 'ENC-2', place: 'Viana', fee: 1500,
      delivery_status: 'confirmed', items: [{ title: 'Livro B', qty: 1 }],
      customer: { name: 'Maria Cliente', phone: '923000000', address: 'Rua 1, Zango', gps: { lat: -8.9, lng: 13.37 } } },
    { id: 'h1', status: 'delivered', order_number: 'ENC-0', place: 'Viana', fee: 1500 },
  ],
};

describe('área do colportor: entregas', () => {
  it('oferta: onde, quanto ganha, o tempo que falta, e aceitar', async () => {
    api.loadMyDeliveries.mockResolvedValue(MINE);
    api.respondDelivery.mockResolvedValue({ status: 'accepted' });
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('ENC-1 · Zango, Viana, Luanda');
    expect(el.textContent).toContain(`Ganha ${kz(1500)} por esta entrega`);
    expect(el.textContent).toContain('Tem estes livros consigo');
    expect(el.textContent).toMatch(/faltam (44|45) min/);
    await act(async () => button(el, 'Aceitar').click());
    expect(api.respondDelivery).toHaveBeenCalledWith('o1', true);
  });

  it('aceite com os livros da loja: dados do cliente, e não sai sem os livros', async () => {
    api.loadMyDeliveries.mockResolvedValue(MINE);
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('Maria Cliente');
    expect(el.querySelector('a[href="tel:923000000"]')).toBeTruthy();
    expect(el.querySelector('a[href="https://www.google.com/maps?q=-8.9,13.37"]')).toBeTruthy();
    expect(el.textContent).toContain('Levante os livros na loja');
    expect(button(el, 'Saiu para entrega').disabled).toBe(true);
    expect(button(el, 'Entregue').disabled).toBe(true);
  });

  it('com os livros entregues pela equipa, a entrega pede nome e assinatura', async () => {
    api.loadMyDeliveries.mockResolvedValue({ ...MINE, deliveries: [{ ...MINE.deliveries[1], picked_up_at: new Date().toISOString() }] });
    const el = await mount(<ColporteurDeliveries />);
    expect(button(el, 'Saiu para entrega').disabled).toBe(false);
    await act(async () => button(el, 'Entregue').click());
    expect(el.querySelector('canvas')).toBeTruthy();
    expect(el.textContent).toContain('Quem recebe assina como está no Bilhete');
    await act(async () => button(el, 'Confirmar a entrega').click());
    expect(api.deliveryStep).not.toHaveBeenCalled(); // sem assinatura não segue
  });

  it('a loja de levantamento: na oferta e depois de aceitar, com morada, horário e mapa', async () => {
    const pickup_store = { name: 'Loja Lubango', address: 'Rua da Sé', hours: '8h-17h', phone: '923444555', whatsapp: '', maps_url: 'https://maps.example/lubango' };
    api.loadMyDeliveries.mockResolvedValue({ ...MINE, deliveries: [
      { ...MINE.deliveries[0], has_stock: false, pickup_store },
      { ...MINE.deliveries[1], pickup_store },
    ] });
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('Os livros levantam-se nesta loja:');
    expect(el.textContent).toContain('Levante os livros nesta loja:');
    expect(el.textContent.match(/Loja Lubango/g)).toHaveLength(2);
    expect(el.textContent).toContain('Rua da Sé');
    expect(el.textContent).toContain('8h-17h');
    expect(el.querySelector('a[href="tel:923444555"]')).toBeTruthy();
    expect(el.querySelector('a[href="https://maps.example/lubango"]')).toBeTruthy();
  });

  it('uma ligação de mapa perigosa não aparece', async () => {
    api.loadMyDeliveries.mockResolvedValue({ ...MINE, deliveries: [
      { ...MINE.deliveries[1], pickup_store: { name: 'Loja', address: 'Rua', maps_url: 'javascript:alert(1)' } },
    ] });
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('Loja');
    expect(el.textContent).not.toContain('Ver no mapa');
  });

  it('localização com mais de 30 dias: pede para a actualizar', async () => {
    const velha = new Date(Date.now() - 40 * 86400000).toISOString();
    api.loadMyDeliveries.mockResolvedValue({ ...MINE, latitude: -8.9, longitude: 13.3, location_updated_at: velha, deliveries: [] });
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('Tem mais de 30 dias');
    const agora = Date.parse('2026-11-08T12:00:00Z');
    expect(locationIsOld('2026-10-20T12:00:00Z', agora)).toBe(false);
    expect(locationIsOld('2026-10-01T12:00:00Z', agora)).toBe(true);
    expect(locationIsOld(null, agora)).toBe(false);
  });

  it('no histórico, diz porque é que a entrega fechou', async () => {
    api.loadMyDeliveries.mockResolvedValue({ ...MINE, deliveries: [
      { id: 'h2', status: 'cancelled', order_number: 'ENC-7', place: 'Viana', fee: 1500, reason: 'A encomenda deixou de estar paga.' },
    ] });
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('A encomenda deixou de estar paga.');
    expect(el.textContent).not.toContain(`+${kz(1500)}`);
  });

  it('sem localização, explica e oferece registá-la; histórico com o ganho', async () => {
    api.loadMyDeliveries.mockResolvedValue(MINE);
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).toContain('Sem localização');
    expect(button(el, 'Registar a minha localização')).toBeTruthy();
    expect(el.textContent).toContain(`+${kz(1500)}`);
  });
});

describe('área do colportor: actualizar sozinha', () => {
  it('um sinal na conta dele traz a oferta nova', async () => {
    api.loadMyDeliveries.mockResolvedValueOnce({ ...MINE, deliveries: [] }).mockResolvedValueOnce(MINE);
    const el = await mount(<ColporteurDeliveries />);
    expect(el.textContent).not.toContain('ENC-1');
    expect(signals.byTopic['conta:perfil-1'].events).toEqual(['entregas']);
    await act(async () => signals.byTopic['conta:perfil-1'].fire());
    expect(el.textContent).toContain('ENC-1 · Zango, Viana, Luanda');
  });

  it('uma falha a actualizar não apaga o ecrã nem a assinatura a meio', async () => {
    const aceite = { ...MINE.deliveries[1], picked_up_at: new Date().toISOString() };
    api.loadMyDeliveries.mockResolvedValueOnce({ ...MINE, deliveries: [aceite] }).mockRejectedValueOnce(new Error('Sem rede'));
    const el = await mount(<ColporteurDeliveries />);
    await act(async () => button(el, 'Entregue').click());
    const canvas = el.querySelector('canvas');
    expect(canvas).toBeTruthy();
    await act(async () => signals.byTopic['conta:perfil-1'].fire());
    expect(el.querySelector('canvas')).toBe(canvas);
    expect(el.textContent).toContain('Maria Cliente');
  });

  it('sem dados nenhuns, mostra o erro', async () => {
    api.loadMyDeliveries.mockRejectedValue(new Error('Sem acesso.'));
    const el = await mount(<ColporteurDeliveries />);
    expect(el.querySelector('[role="alert"]').textContent).toBe('Sem acesso.');
  });
});

describe('painel: entrega por colportor da encomenda', () => {
  const colportor = { id: 'k1', name: 'Bento', code: 'CPT-0002', phone: '923111222' };
  it('aceite com os livros da loja: a equipa marca "Entregue ao colportor"', async () => {
    api.loadOrderDeliveries.mockResolvedValue({ route: 'colportor', deliveries: [
      { id: 'd1', status: 'accepted', source: 'loja', picked_up_at: null, fee: 1500, match_level: 'municipio', offered_at: new Date().toISOString(), colporteur: colportor },
    ] });
    api.handoverDelivery.mockResolvedValue({});
    const el = await mount(<OrderColporteurDelivery order={{ id: 'x', payment_status: 'paid', delivery_status: 'confirmed' }} />);
    expect(el.textContent).toContain('Entrega com Bento (CPT-0002)');
    expect(el.textContent).toContain('Levanta os livros na loja');
    await act(async () => button(el, 'Entregue ao colportor').click());
    expect(api.handoverDelivery).toHaveBeenCalledWith('d1');
  });

  it('um sinal de entregas actualiza o painel da encomenda', async () => {
    api.loadOrderDeliveries.mockResolvedValue({ route: 'colportor', deliveries: [] });
    await mount(<OrderColporteurDelivery order={{ id: 'z', payment_status: 'paid' }} />);
    expect(signals.byTopic.painel.events).toEqual(['entregas']);
    await act(async () => signals.byTopic.painel.fire());
    expect(api.loadOrderDeliveries).toHaveBeenCalledTimes(2);
  });

  it('ninguém aceitou: a equipa entrega', async () => {
    api.loadOrderDeliveries.mockResolvedValue({ route: 'loja', deliveries: [
      { id: 'd2', status: 'declined', fee: 0, match_level: 'gps', distance_km: 3.2, offered_at: new Date().toISOString(), colporteur: colportor },
    ] });
    const el = await mount(<OrderColporteurDelivery order={{ id: 'y', payment_status: 'paid' }} />);
    expect(el.textContent).toContain('A equipa faz esta entrega.');
    expect(el.textContent).toContain('Recusada');
  });
});
