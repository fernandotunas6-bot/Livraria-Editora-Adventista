// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Quem entrega, dentro do app iOS: o iPhone lê o GPS e manda a posição com o ecrã apagado
// (lib/trajetoNativo.js). A página só ouve e mostra.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const api = {
  loadRouteInfo: vi.fn(async () => ({ destination: { lat: -8.9, lng: 13.37, accuracy: 9 }, address: 'Rua 1', sharing: null })),
  sharePosition: vi.fn(async () => ({ skipped: false })),
  stopSharing: vi.fn(async () => ({ stopped: true })),
};
vi.mock('@/lib/deliveryTracking', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('@/components/maps/DeliveryMap', () => ({ default: () => <div data-mapa-falso /> }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

let ouvintes = null;
let estado = { activa: false };
const largar = vi.fn();
const nativo = {
  trajetoNativoDisponivel: vi.fn(async () => true),
  estadoDoTrajetoNativo: vi.fn(async () => estado),
  iniciarTrajetoNativo: vi.fn(async (_id, o) => { ouvintes = o; return largar; }),
  ouvirTrajetoNativo: vi.fn(async (o) => { ouvintes = o; return largar; }),
  pararTrajetoNativo: vi.fn(async () => {}),
};
vi.mock('@/lib/trajetoNativo', () => nativo);

const { default: CourierShare } = await import('./CourierShare');

let root;
let host;
const geo = { watchPosition: vi.fn(() => 7), clearWatch: vi.fn() };
const espera = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<CourierShare orderId="o1" deliveryStatus="out_for_delivery" />));
  await espera();
  await espera();
}
const button = (text) => [...host.querySelectorAll('button, a')].find((b) => b.textContent.includes(text));
const click = async (el) => { await act(async () => { el.click(); }); await espera(); };

beforeEach(() => {
  vi.clearAllMocks();
  ouvintes = null;
  estado = { activa: false };
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
});
afterEach(() => { act(() => root?.unmount()); host?.remove(); });

describe('CourierShare no app iOS', () => {
  it('antes de partilhar, diz o que acontece à localização (a divulgação que as lojas pedem)', async () => {
    await mount();
    expect(host.querySelector('[data-aviso-localizacao]').textContent).toContain('mesmo com o ecrã apagado');
    await click(button('Partilhar a minha localização'));
    expect(host.querySelector('[data-aviso-localizacao]')).toBeNull();
  });

  it('partilhar entrega o GPS ao iPhone; a página mostra as leituras e os envios', async () => {
    await mount();
    await click(button('Partilhar a minha localização'));
    expect(nativo.iniciarTrajetoNativo).toHaveBeenCalledWith('o1', expect.any(Object));
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(api.sharePosition).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Pode apagar o ecrã ou mudar de app');

    await act(async () => { ouvintes.leitura({ lat: -8.885, lng: 13.37, accuracy: 8 }); ouvintes.enviado({ quando: Date.now() }); });
    expect(host.textContent).toContain('O cliente vê-o no mapa');
    expect(host.textContent).toContain('a 1,7 km');

    await click(button('Parar de partilhar'));
    expect(nativo.pararTrajetoNativo).toHaveBeenCalled();
    expect(api.stopSharing).toHaveBeenCalledWith('o1');
    expect(largar).toHaveBeenCalled();
  });

  it('o iPhone diz que terminou (entregue): a página pára sem avisar outra vez o servidor', async () => {
    await mount();
    await click(button('Partilhar a minha localização'));
    await act(async () => { ouvintes.terminou({ mensagem: 'A encomenda já não está a caminho: a partilha terminou.' }); });
    expect(button('Partilhar a minha localização')).toBeTruthy();
    expect(api.stopSharing).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'A partilha terminou' }));
  });

  it('voltar à página com a partilha a correr: continua a mostrá-la', async () => {
    estado = { activa: true, encomenda: 'o1', enviadoEm: Date.now() };
    await mount();
    expect(nativo.ouvirTrajetoNativo).toHaveBeenCalled();
    expect(button('Parar de partilhar')).toBeTruthy();
  });

  it('no Android, o sinal de que continua é a notificação', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    try {
      await mount();
      await click(button('Partilhar a minha localização'));
      expect(host.textContent).toContain('a notificação «A partilhar a localização» fica na barra');
      expect(host.textContent).not.toContain('indicador azul');
    } finally {
      delete window.Capacitor;
    }
  });

  it('sair da página não pára a partilha do iPhone, só deixa de ouvir', async () => {
    await mount();
    await click(button('Partilhar a minha localização'));
    act(() => root.unmount());
    root = null;
    expect(largar).toHaveBeenCalled();
    expect(nativo.pararTrajetoNativo).not.toHaveBeenCalled();
  });
});
