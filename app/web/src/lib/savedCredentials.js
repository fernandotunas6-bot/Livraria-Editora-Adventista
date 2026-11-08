/**
 * Entrar sozinho ao abrir a app, com a palavra-passe que o navegador guardou.
 *
 * No Chrome, no Edge, no Samsung Internet e na app instalada no Android, o site pode falar com o
 * gestor de palavras-passe do navegador (Credential Management API):
 *
 * - depois de entrar, pedir-lhe que guarde o email e a palavra-passe (`store`). É o
 *   "Guardar palavra-passe?" do Chrome, que numa página que não muda de endereço ao entrar nem
 *   sempre aparecia sozinho;
 * - ao abrir a app sem sessão, pedir em silêncio a conta guardada (`mediation: 'silent'`) e
 *   entrar com ela, sem a pessoa escrever nada. O navegador só a entrega se houver uma só conta
 *   guardada para o site e a pessoa não tiver saído; caso contrário responde vazio, sem mostrar
 *   nada;
 * - ao sair, pedir-lhe que não volte a entrar sozinho (`preventSilentAccess`) até a pessoa
 *   entrar outra vez por vontade própria.
 *
 * O Safari e o Firefox não têm esta API: lá ficam o preenchimento do teclado (os campos têm
 * `autocomplete="username"` e `current-password`) e a sessão guardada. Tudo aqui é um extra:
 * nenhuma falha pode impedir a entrada normal, por isso nada daqui lança erros.
 */

import { SIGN_OUT_KEY, readSignOut } from '@/lib/authSession';

/** Neste arranque da app já se tentou entrar sozinho (uma vez por sessão do navegador). */
export const SILENT_TRIED_KEY = 'livraria_entrada_automatica';

// Páginas onde nunca se entra sozinho: na recuperação de palavra-passe a pessoa está a mudar a
// palavra-passe (a guardada pode ser a antiga) e no cancelamento de subscrição veio de um email.
const NO_SILENT_PATHS = ['/reset-password', '/forgot-password', '/unsubscribe', '/cancelar-subscricao'];

export function passwordCredentialsSupported(win = globalThis.window) {
  return !!(
    win
    && win.isSecureContext !== false
    && typeof win.PasswordCredential === 'function'
    && typeof win.navigator?.credentials?.get === 'function'
  );
}

/** Pede ao navegador que guarde (ou actualize) a conta. Devolve `true` se o pedido seguiu. */
export async function storePasswordCredential({ email, password, name } = {}, win = globalThis.window) {
  if (!passwordCredentialsSupported(win) || !email || !password) return false;
  try {
    const credential = new win.PasswordCredential({ id: email, password, name: name || email });
    await win.navigator.credentials.store(credential);
    return true;
  } catch {
    return false;
  }
}

/** A conta guardada, sem mostrar nada à pessoa; `null` se o navegador não a der. */
export async function getSilentPasswordCredential(win = globalThis.window) {
  if (!passwordCredentialsSupported(win)) return null;
  try {
    const credential = await win.navigator.credentials.get({ password: true, mediation: 'silent' });
    if (!credential || credential.type !== 'password' || !credential.id || !credential.password) return null;
    return { email: String(credential.id), password: String(credential.password), name: String(credential.name || '') };
  } catch {
    return null;
  }
}

/** Depois de sair: o navegador deixa de entrar sozinho até a pessoa voltar a entrar. */
export async function preventSilentSignIn(win = globalThis.window) {
  try {
    if (typeof win?.navigator?.credentials?.preventSilentAccess !== 'function') return false;
    await win.navigator.credentials.preventSilentAccess();
    return true;
  } catch {
    return false;
  }
}

/**
 * Tenta-se entrar sozinho agora?
 *
 * Só ao abrir a app, sem sessão, uma vez por arranque, e nunca:
 * - antes de se saber se há sessão (`ready`) ou com sessão;
 * - depois de a pessoa ter carregado em "Sair", nem depois de o servidor ter terminado a sessão
 *   (terminar em todos os aparelhos, palavra-passe mudada, conta suspensa) — a marca `saida`
 *   (`lib/authSession.js`) só se apaga quando a pessoa volta a entrar;
 * - no meio da recuperação de palavra-passe.
 */
export function shouldTrySilentSignIn({ ready, isAuthed, pathname = '/', triedThisLaunch, signOut, recovery = false, supported = true }) {
  if (!supported || !ready || isAuthed || triedThisLaunch || recovery) return false;
  if (readSignOut(signOut)) return false;
  return !NO_SILENT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Lê o que `shouldTrySilentSignIn` precisa do armazenamento, sem rebentar sem ele. */
export function silentSignInState(win = globalThis.window) {
  let triedThisLaunch = true;
  let signOut = null;
  try {
    triedThisLaunch = win.sessionStorage.getItem(SILENT_TRIED_KEY) === '1';
  } catch {
    // sem armazenamento não há como saber se já se tentou: não tentar (evita repetir a cada página)
  }
  try {
    signOut = win.localStorage.getItem(SIGN_OUT_KEY);
  } catch {
    signOut = null;
  }
  return { triedThisLaunch, signOut };
}

export function markSilentSignInTried(win = globalThis.window) {
  try {
    win.sessionStorage.setItem(SILENT_TRIED_KEY, '1');
  } catch {
    // armazenamento indisponível
  }
}

/**
 * Pede ao navegador que não apague os dados do site quando o telemóvel fica sem espaço — entre
 * eles a sessão. Só na app instalada: lá o Chrome e o Safari aceitam sem perguntar nada; num
 * separador normal, o Firefox mostraria uma pergunta que não faz sentido a quem só veio comprar.
 */
export async function keepSiteDataOnDevice(win = globalThis.window) {
  try {
    const standalone = win.matchMedia?.('(display-mode: standalone)')?.matches || win.navigator?.standalone === true;
    const storage = win.navigator?.storage;
    if (!standalone || typeof storage?.persist !== 'function') return false;
    if (typeof storage.persisted === 'function' && await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
