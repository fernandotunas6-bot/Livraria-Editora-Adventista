import pb from '@/lib/dataClient';
import { eAppAndroid, eAppNativa, pluginAparelho, pluginPush, plataformaNativa } from '@/lib/nativeApp';

/**
 * "Novidades da app" neste aparelho (perfil → Notificações no aparelho). Por omissão, sim: as
 * novidades só chegam quando a equipa as anuncia (painel → Versões da app). Desligar não mexe
 * nos avisos das encomendas nem da comunidade.
 */
export const APP_UPDATES_KEY = 'livraria:push-novidades';

export function appUpdatesWanted() {
  try {
    return localStorage.getItem(APP_UPDATES_KEY) !== '0';
  } catch {
    return true;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported() {
  if (eAppNativa()) return true;
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * A loja tem push e este aparelho pode recebê-lo? No site é o Web Push (precisa da chave VAPID);
 * nos apps é o APNs (iPhone) ou o Firebase (Android), que o servidor configura à parte
 * (supabase/functions/app/apns.ts e fcm.ts).
 */
export const pushDisponivel = (settings) => !!settings?.push_enabled && (eAppNativa() || !!settings?.vapid_public_key);

// ---------- Apps: notificações do APNs e do Firebase (lib/nativeApp.js, docs/APPS.md) ----------
//
// O WebView do app não tem Web Push. O plugin PushNotifications pede a permissão ao telemóvel,
// regista o aparelho (no APNs ou no Firebase) e dá o token, que vai para /push/native/subscribe: o
// servidor guarda-o com os outros aparelhos e envia pelos mesmos avisos.

/** O último token deste aparelho (para o desligar e para o voltar a associar à conta). */
const APNS_TOKEN_KEY = 'livraria:push-apns-token';
const lerToken = () => { try { return localStorage.getItem(APNS_TOKEN_KEY) || ''; } catch { return ''; } };
const guardarToken = (t) => { try { if (t) localStorage.setItem(APNS_TOKEN_KEY, t); else localStorage.removeItem(APNS_TOKEN_KEY); } catch { /* sem armazenamento */ } };

/**
 * No Android as notificações vêm pelo Firebase, que só existe se o build levou o
 * google-services.json: sem ele, pedir o registo derrubava o app. O app diz se o tem.
 */
async function firebaseNoApp() {
  if (!eAppAndroid()) return true;
  const aparelho = await pluginAparelho();
  try {
    return !!(await aparelho?.pushConfigurado())?.configurado;
  } catch {
    return false;
  }
}

/** 'granted', 'denied' ou 'prompt' (ainda não perguntado) no app; null fora dele ou sem push. */
export async function permissaoDoPushNativo() {
  const push = await pluginPush();
  if (!push || !await firebaseNoApp()) return null;
  try {
    const { receive } = await push.checkPermissions();
    return receive === 'granted' || receive === 'denied' ? receive : 'prompt';
  } catch {
    return null;
  }
}

async function pedirPermissaoNativa() {
  const push = await pluginPush();
  if (!push || !await firebaseNoApp()) return 'unsupported';
  const atual = await permissaoDoPushNativo();
  if (atual === 'granted' || atual === 'denied') return atual;
  const { receive } = await push.requestPermissions();
  return receive === 'granted' ? 'granted' : 'denied';
}

/** Regista o aparelho (no APNs ou no Firebase) e devolve o token (ou lança, ao fim de 20 segundos sem resposta). */
async function registarAparelho(push) {
  const handles = [];
  try {
    const token = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('O iPhone não respondeu ao registo das notificações.')), 20_000);
      Promise.all([
        push.addListener('registration', ({ value }) => { clearTimeout(t); resolve(value); }),
        push.addListener('registrationError', ({ error }) => { clearTimeout(t); reject(new Error(error || 'O registo das notificações falhou.')); }),
      ]).then((hs) => { handles.push(...hs); return push.register(); }).catch((err) => { clearTimeout(t); reject(err); });
    });
    return String(token || '');
  } finally {
    handles.forEach((h) => h.remove?.());
  }
}

/** O aparelho fica a receber, associado à conta que tem sessão (ou a nenhuma). */
async function subscreverNoApp({ appUpdates } = {}) {
  const push = await pluginPush();
  if (!push) return null;
  if (await pedirPermissaoNativa() !== 'granted') return null;
  const token = await registarAparelho(push);
  if (!token) return null;
  guardarToken(token);
  // Android: o canal dos avisos (o servidor manda para ele; sem ele o Android usa um genérico).
  if (eAppAndroid()) {
    await push.createChannel?.({ id: 'livraria', name: 'Avisos da livraria', description: 'Encomendas, comunidade e novidades', importance: 4 }).catch?.(() => {});
  }
  await pb.send('/push/native/subscribe', {
    method: 'POST',
    body: {
      token,
      platform: plataformaNativa(),
      user_agent: navigator.userAgent,
      app_updates: typeof appUpdates === 'boolean' ? appUpdates : appUpdatesWanted(),
    },
  });
  return { token };
}

/**
 * No arranque do app e a cada entrada ou saída de conta: com a permissão já dada, regista outra
 * vez (o token pode mudar) e diz ao servidor de quem é agora o aparelho. Sem permissão, nada.
 */
export async function sincronizarPushNativo() {
  if (await permissaoDoPushNativo() !== 'granted') return false;
  try {
    return !!await subscreverNoApp();
  } catch {
    return false;
  }
}

/** Desliga as notificações neste iPhone: o servidor esquece o aparelho. */
export async function desligarPushNativo() {
  const push = await pluginPush();
  const token = lerToken();
  if (token) await pb.send('/push/native/unsubscribe', { method: 'POST', body: { token, platform: plataformaNativa() } });
  guardarToken('');
  try { await push?.unregister(); } catch { /* já desligado */ }
}

export async function requestPushPermission() {
  if (eAppNativa()) return pedirPermissaoNativa();
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function subscribeToPush(vapidPublicKey, { appUpdates } = {}) {
  if (eAppNativa()) return subscreverNoApp({ appUpdates });
  if (!vapidPublicKey || !isPushSupported()) return null;
  const permission = await requestPushPermission();
  if (permission !== 'granted') return null;

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = sub.toJSON();
  const body = {
    endpoint: sub.endpoint,
    keys: json.keys,
    user_agent: navigator.userAgent,
    user: pb.authStore.model?.id || '',
    app_updates: typeof appUpdates === 'boolean' ? appUpdates : appUpdatesWanted(),
  };

  // `pb.send` leva o token da sessão já renovado (o guardado pode ter expirado com a app em
  // segundo plano) e diz se o servidor recusou, em vez de dar a subscrição por feita.
  await pb.send('/push/subscribe', { method: 'POST', body });

  return sub;
}

/** Liga ou desliga as novidades da app neste aparelho (só se já tiver notificações). */
export async function setAppUpdatesPush(vapidPublicKey, enabled) {
  try {
    localStorage.setItem(APP_UPDATES_KEY, enabled ? '1' : '0');
  } catch {
    // sem armazenamento: o servidor fica a saber na mesma
  }
  if (eAppNativa()) {
    if (await permissaoDoPushNativo() !== 'granted') return false;
    return !!await subscreverNoApp({ appUpdates: !!enabled });
  }
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  if (!await reg.pushManager.getSubscription()) return false;
  await subscribeToPush(vapidPublicKey, { appUpdates: !!enabled });
  return true;
}

export async function showLocalNotification({ title, body, url = '/' }) {
  // No app não há notificações locais: quem chama oferece as do APNs ou do Firebase.
  if (eAppNativa()) return false;
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      data: { url },
      tag: 'livraria-order',
    });
    return true;
  } catch {
    try {
      new Notification(title, { body, icon: '/icons/icon-192.svg' });
      return true;
    } catch {
      return false;
    }
  }
}
