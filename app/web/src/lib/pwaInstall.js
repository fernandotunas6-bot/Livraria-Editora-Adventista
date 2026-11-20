// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Instalar a app (PWA): quem pode, como, e o pedido de instalação do navegador.
//
// Cada sistema instala de maneira diferente:
//  · Android (Chrome, Edge, Samsung Internet…): o navegador manda o evento `beforeinstallprompt`;
//    guardamo-lo e o botão «Instalar» abre a janela do próprio sistema.
//  · iPhone e iPad: não há evento nem forma de abrir a janela. Instala-se à mão, no Safari (ou,
//    desde o iOS 16.4, no Chrome e no Edge): Partilhar → «Adicionar ao ecrã principal». O botão
//    mostra esses passos. Dentro do WhatsApp, Facebook ou Instagram não dá: é preciso abrir no Safari.
//  · Outros telemóveis sem o evento (Firefox no Android, por exemplo): o menu do navegador tem
//    «Instalar» ou «Adicionar ao ecrã principal»; o botão diz onde.
//
// O evento chega muitas vezes antes de o aviso de instalação ser carregado (vem a pedido): por
// isso é apanhado logo no arranque (main.jsx → capturarPedidoDeInstalacao) e guardado aqui.

import { eAppNativa } from '@/lib/nativeApp';

/**
 * A app está aberta como app instalada (ecrã inteiro, sem a barra do navegador)? Dentro do app da
 * App Store (lib/nativeApp.js) também: aí não há nada para instalar.
 */
export function abertaComoApp(win = globalThis.window) {
  if (!win) return false;
  if (eAppNativa(win)) return true;
  try {
    if (win.navigator?.standalone === true) return true; // iOS
    return !!win.matchMedia?.('(display-mode: standalone)')?.matches
      || !!win.matchMedia?.('(display-mode: fullscreen)')?.matches
      || !!win.matchMedia?.('(display-mode: minimal-ui)')?.matches;
  } catch {
    return false;
  }
}

/** iPhone, iPod ou iPad (o iPadOS diz-se «Macintosh», mas tem ecrã táctil). */
export function eIos(ua = '', toques = 0) {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && toques > 1);
}

/** Navegador dentro de outra app (WhatsApp, Facebook, Instagram…): daí não se instala nada. */
export function eNavegadorDeApp(ua = '') {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Line\/|Snapchat|TikTok|musical_ly|MicroMessenger/i.test(ua);
}

/** Telemóvel ou tablet. */
export function eMovel(ua = '', toques = 0) {
  return eIos(ua, toques) || /Android|Mobile|Silk|KFAPWI/i.test(ua);
}

/**
 * Como se instala neste aparelho:
 *  · 'instalada'  — já está a correr como app (nada a mostrar);
 *  · 'pedido'     — o navegador deu o pedido de instalação: o botão abre a janela do sistema;
 *  · 'ios'        — iPhone/iPad: passos à mão (Partilhar → Adicionar ao ecrã principal);
 *  · 'ios-app'    — iPhone/iPad dentro do WhatsApp, Facebook…: primeiro abrir no Safari;
 *  · 'manual'     — outro telemóvel sem pedido: «Instalar» no menu do navegador;
 *  · 'nenhuma'    — computador sem pedido (nada a mostrar).
 */
export function modoDeInstalacao({ ua = '', toques = 0, instalada = false, temPedido = false } = {}) {
  if (instalada) return 'instalada';
  if (temPedido) return 'pedido';
  if (eIos(ua, toques)) return eNavegadorDeApp(ua) ? 'ios-app' : 'ios';
  if (eMovel(ua, toques)) return 'manual';
  return 'nenhuma';
}

// ---------- O pedido de instalação do navegador ----------

let pedido = null;
let instaladaAgora = false;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => { try { f(); } catch { /* um ouvinte não estraga os outros */ } });

/** Liga-se uma vez, no arranque: guarda o `beforeinstallprompt` e sabe quando a app foi instalada. */
export function capturarPedidoDeInstalacao(win = globalThis.window) {
  if (!win?.addEventListener || win.__pedidoDeInstalacao) return;
  win.__pedidoDeInstalacao = true;
  win.addEventListener('beforeinstallprompt', (e) => {
    // Sem isto, o Chrome mostra a sua própria barra, na hora errada.
    e.preventDefault();
    pedido = e;
    avisar();
  });
  win.addEventListener('appinstalled', () => {
    pedido = null;
    instaladaAgora = true;
    avisar();
  });
}

/** O estado para o React: muda quando chega o pedido ou quando a app é instalada. */
export function subscreverInstalacao(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export const temPedidoDeInstalacao = () => !!pedido;
export const foiInstaladaAgora = () => instaladaAgora;

/** Abre a janela de instalação do sistema. Devolve 'accepted', 'dismissed' ou null (sem pedido). */
export async function pedirInstalacao() {
  const p = pedido;
  if (!p) return null;
  try {
    await p.prompt();
    const { outcome } = await p.userChoice;
    // O pedido só se usa uma vez: aceite ou recusado, o navegador manda outro mais tarde.
    pedido = null;
    if (outcome === 'accepted') instaladaAgora = true;
    avisar();
    return outcome;
  } catch {
    pedido = null;
    avisar();
    return null;
  }
}

/** Só para os testes. */
export function _reporInstalacao() { pedido = null; instaladaAgora = false; ouvintes.clear(); }
