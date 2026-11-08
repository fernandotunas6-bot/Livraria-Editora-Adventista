/* global __APP_VERSION__ */
// A versão que está a correr e a que está publicada (scripts/app-version.mjs).
//
// No telemóvel, a app fica dias em segundo plano e volta sempre à versão que carregou: o HTML só
// é pedido de novo quando abre do zero. Para dizer "há uma versão nova", a app compara a sua
// versão com a de /version.json — ao abrir, ao voltar ao ecrã e de 30 em 30 minutos com a app à
// vista. Em desenvolvimento não há version.json e nada disto corre.

/** A versão deste build; `dev` em desenvolvimento e nos testes. */
export const CURRENT_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';

const VERSION_RE = /^\d{4}\.\d{2}\.\d{2}-[0-9a-z]{4,7}$/;

/** Primeira verificação depois de abrir: deixa a página acabar de carregar primeiro. */
export const FIRST_CHECK_MS = 15_000;
/** Com a app à vista, de quanto em quanto tempo se verifica. */
export const CHECK_INTERVAL_MS = 30 * 60_000;
/** Voltar à app várias vezes seguidas não faz um pedido de cada vez. */
export const MIN_CHECK_GAP_MS = 60_000;

/** Quem decide se há uma versão nova: a publicada é diferente da que corre (também depois de
 *  uma publicação desfeita — a que corre já não é a do site). */
export function isNewerVersion(published, current = CURRENT_VERSION) {
  if (!current || current === 'dev') return false;
  return typeof published === 'string' && VERSION_RE.test(published) && published !== current;
}

/** A versão publicada, ou `null` (sem rede, ficheiro em falta ou estranho). */
export async function fetchPublishedVersion(fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl('/version.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res?.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/** Já se verificou há pouco? */
export function shouldCheckNow(now, lastCheckAt) {
  return !(lastCheckAt > 0 && now - lastCheckAt < MIN_CHECK_GAP_MS);
}

/** Marca para depois de recarregar: "a app foi actualizada" (só nesta sessão do navegador). */
export const UPDATED_KEY = 'livraria:actualizou-de';

/**
 * Actualiza: pede ao service worker que veja se também mudou e recarrega. O HTML vem sempre da
 * rede (sw.js), por isso o recarregamento traz os ficheiros da versão nova.
 */
export async function applyUpdate(win = globalThis.window) {
  try {
    win.sessionStorage.setItem(UPDATED_KEY, CURRENT_VERSION);
  } catch {
    // sem armazenamento: actualiza na mesma, só não diz que actualizou
  }
  try {
    const reg = await win.navigator?.serviceWorker?.getRegistration?.();
    if (reg?.update) await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    // sem service worker, o recarregamento chega
  }
  win.location.reload();
}

/** Depois de actualizar: de que versão vinha (e apaga a marca), ou `''`. */
export function takeUpdatedFrom(win = globalThis.window) {
  try {
    const from = win.sessionStorage.getItem(UPDATED_KEY) || '';
    if (from) win.sessionStorage.removeItem(UPDATED_KEY);
    return from && from !== CURRENT_VERSION ? from : '';
  } catch {
    return '';
  }
}
