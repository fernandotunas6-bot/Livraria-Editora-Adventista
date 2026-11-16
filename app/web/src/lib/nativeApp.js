// O site dentro do app iOS (app/ios, docs/APP_IOS.md).
//
// O app é uma casca Capacitor que abre o site publicado: o código é o mesmo, e é aqui que o site
// sabe que está dentro dele e usa o que só o app tem — notificações do APNs, a folha de partilha,
// o login no navegador do sistema, «Iniciar sessão com a Apple», as ligações que abrem no app.
//
// O Capacitor injecta `window.Capacitor` antes do site arrancar; num navegador normal não existe e
// nada daqui faz coisa nenhuma. Os plugins vêm por `import()` só quando se precisa deles, para o
// site normal não descarregar código do app.

/** O app usa este esquema para voltar do login no navegador do sistema (Info.plist). */
export const ESQUEMA_DO_APP = 'ao.livrariaadventista.app';
export const REGRESSO_DO_LOGIN = `${ESQUEMA_DO_APP}://auth/callback`;

/** Os endereços do site que o app abre por dentro (ligações universais e o próprio site). */
const HOSTS_DO_SITE = /^(www\.)?livrariaadventista\.(ao|com)$/i;

/** O site está a correr dentro do app (iOS ou, um dia, Android)? */
export function eAppNativa(win = globalThis.window) {
  try {
    return win?.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** 'ios', 'android' ou 'web'. */
export function plataformaNativa(win = globalThis.window) {
  if (!eAppNativa(win)) return 'web';
  try {
    return win.Capacitor.getPlatform?.() || 'web';
  } catch {
    return 'web';
  }
}

/** Dentro do app iOS: é aqui que valem as regras da App Store (compras digitais, login da Apple). */
export const eAppIos = (win = globalThis.window) => plataformaNativa(win) === 'ios';

/** O plugin pedido, ou null fora do app ou se não carregar. */
async function plugin(carregar, nome) {
  if (!eAppNativa()) return null;
  try {
    const modulo = await carregar();
    return modulo?.[nome] || null;
  } catch {
    return null;
  }
}

export const pluginApp = () => plugin(() => import('@capacitor/app'), 'App');
export const pluginBrowser = () => plugin(() => import('@capacitor/browser'), 'Browser');
export const pluginShare = () => plugin(() => import('@capacitor/share'), 'Share');
export const pluginPush = () => plugin(() => import('@capacitor/push-notifications'), 'PushNotifications');
export const pluginStatusBar = () => plugin(() => import('@capacitor/status-bar'), 'StatusBar');

/** Plugins que vivem no próprio app (app/ios/ios/App/App/*.swift), registados uma vez. */
const pluginsDoApp = new Map();
async function pluginDoApp(nome) {
  if (!eAppIos()) return null;
  if (pluginsDoApp.has(nome)) return pluginsDoApp.get(nome);
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const p = registerPlugin(nome);
    pluginsDoApp.set(nome, p);
    return p;
  } catch {
    return null;
  }
}

/** «Iniciar sessão com a Apple» (AppleSignInPlugin.swift). */
export const pluginAppleSignIn = () => pluginDoApp('AppleSignIn');
/** Login no navegador do sistema, para a Google (WebAuthPlugin.swift). */
export const pluginWebAuth = () => pluginDoApp('WebAuth');

/**
 * Para onde vai uma ligação que abriu o app: o caminho do site (`/track?x=1`) para uma ligação
 * universal do site, ou null para tudo o resto (o regresso do login trata-se à parte).
 */
export function caminhoDaLigacao(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  if (!HOSTS_DO_SITE.test(u.hostname)) return null;
  return `${u.pathname || '/'}${u.search}${u.hash}`;
}

/** A ligação é o regresso do login no navegador do sistema? */
export function eRegressoDoLogin(url) {
  const s = String(url || '');
  return s === REGRESSO_DO_LOGIN || s.startsWith(`${REGRESSO_DO_LOGIN}?`) || s.startsWith(`${REGRESSO_DO_LOGIN}#`);
}

/**
 * Abre um endereço na folha do Safari, por cima do app (PDFs, páginas de fora). Devolve false fora
 * do app ou se não abrir, e quem chamou faz como no site.
 */
export async function abrirNoNavegadorDoApp(url) {
  const browser = await pluginBrowser();
  if (!browser) return false;
  try {
    await browser.open({ url: String(url), presentationStyle: 'popover' });
    return true;
  } catch {
    return false;
  }
}

/**
 * O estilo da barra de estado (hora, bateria) para a página: 'DARK' é texto claro, sobre o azul
 * do topo da loja; 'LIGHT' é texto escuro, sobre a barra branca do painel. No PWA a barra é
 * sempre de texto claro (`black-translucent`), e no painel a hora quase não se via.
 */
export function estiloDaBarraDeEstado(pathname = '/', temaEscuro = false) {
  return String(pathname).startsWith('/admin') && !temaEscuro ? 'LIGHT' : 'DARK';
}

export async function aplicarBarraDeEstado(style) {
  const statusBar = await pluginStatusBar();
  if (!statusBar) return;
  try {
    await statusBar.setStyle({ style });
  } catch {
    // Sem barra de estado (iPad em ecrã dividido, por exemplo): nada a fazer.
  }
}
