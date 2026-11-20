// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _reporInstalacao, abertaComoApp, capturarPedidoDeInstalacao, eIos, eNavegadorDeApp, modoDeInstalacao, pedirInstalacao,
  subscreverInstalacao, temPedidoDeInstalacao,
} from './pwaInstall';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_WHATSAPP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.20';
const IPHONE_FACEBOOK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

afterEach(() => _reporInstalacao());

describe('modoDeInstalacao', () => {
  it('iPhone no Safari: os passos (Partilhar → Adicionar ao ecrã principal)', () => {
    expect(modoDeInstalacao({ ua: IPHONE_SAFARI })).toBe('ios');
  });
  it('iPad (diz-se Macintosh, mas é táctil) também', () => {
    expect(eIos(IPAD, 5)).toBe(true);
    expect(modoDeInstalacao({ ua: IPAD, toques: 5 })).toBe('ios');
    expect(modoDeInstalacao({ ua: IPAD, toques: 0 })).toBe('nenhuma');
  });
  it('iPhone dentro do WhatsApp ou do Facebook: primeiro abrir no Safari', () => {
    expect(eNavegadorDeApp(IPHONE_WHATSAPP)).toBe(true);
    expect(modoDeInstalacao({ ua: IPHONE_WHATSAPP })).toBe('ios-app');
    expect(modoDeInstalacao({ ua: IPHONE_FACEBOOK })).toBe('ios-app');
  });
  it('com o pedido do navegador (Android): a janela do sistema', () => {
    expect(modoDeInstalacao({ ua: ANDROID_FIREFOX, temPedido: true })).toBe('pedido');
    expect(modoDeInstalacao({ ua: MAC, temPedido: true })).toBe('pedido');
  });
  it('outro telemóvel sem pedido: pelo menu do navegador; computador sem pedido: nada', () => {
    expect(modoDeInstalacao({ ua: ANDROID_FIREFOX })).toBe('manual');
    expect(modoDeInstalacao({ ua: MAC })).toBe('nenhuma');
  });
  it('já instalada: nada, em qualquer aparelho', () => {
    expect(modoDeInstalacao({ ua: IPHONE_SAFARI, instalada: true, temPedido: true })).toBe('instalada');
  });
});

describe('abertaComoApp', () => {
  it('no iPhone, navigator.standalone; nos outros, o display-mode', () => {
    expect(abertaComoApp({ navigator: { standalone: true } })).toBe(true);
    expect(abertaComoApp({ navigator: {}, matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }) })).toBe(true);
    expect(abertaComoApp({ navigator: {}, matchMedia: () => ({ matches: false }) })).toBe(false);
    // Dentro do app da App Store (lib/nativeApp.js) não há nada para instalar.
    expect(abertaComoApp({ navigator: {}, matchMedia: () => ({ matches: false }), Capacitor: { isNativePlatform: () => true } })).toBe(true);
  });
});

describe('o pedido de instalação', () => {
  it('é guardado (e o do Chrome não aparece por conta própria), usado uma vez e esquecido', async () => {
    const win = new EventTarget();
    capturarPedidoDeInstalacao(win);
    const avisos = vi.fn();
    subscreverInstalacao(avisos);
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = vi.fn(async () => {});
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    win.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(temPedidoDeInstalacao()).toBe(true);
    expect(avisos).toHaveBeenCalled();
    expect(await pedirInstalacao()).toBe('accepted');
    expect(e.prompt).toHaveBeenCalled();
    expect(temPedidoDeInstalacao()).toBe(false);
    expect(await pedirInstalacao()).toBeNull();
  });
});
