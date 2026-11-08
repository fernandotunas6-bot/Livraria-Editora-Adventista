import pb from '@/lib/dataClient';

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
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function requestPushPermission() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function subscribeToPush(vapidPublicKey, { appUpdates } = {}) {
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
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  if (!await reg.pushManager.getSubscription()) return false;
  await subscribeToPush(vapidPublicKey, { appUpdates: !!enabled });
  return true;
}

export async function showLocalNotification({ title, body, url = '/' }) {
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
