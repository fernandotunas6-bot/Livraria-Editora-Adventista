import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { accountTopic, subscribeSignal } from '@/lib/realtimeSignals';

// Os avisos do cliente (comunidade e atendimento), partilhados por todos os que os mostram: os
// sinos do cabeçalho (no topo da página inicial há dois, o da barra fina e o do cabeçalho), o
// separador "Notificações" do perfil, o distintivo da barra de baixo e o resumo da comunidade.
// Antes cada um tinha o seu temporizador e fazia o seu pedido; agora há um só, de minuto a
// minuto com a página à vista, e cada página nova reaproveita o que chegou há pouco.
//
// O módulo da comunidade só é descarregado no primeiro pedido: a barra de baixo está em todas
// as páginas e não deve puxar a comunidade inteira para a primeira carga do site.

const POLL_MS = 60_000;
// Ao montar (cada página monta o seu cabeçalho), só se pede de novo se o que há tiver mais do
// que isto; abrir o sino ou voltar à página pede sempre.
const FRESH_MS = 15_000;
const api = () => import('@/lib/communityApi');

let state = { owner: '', items: [], loading: false, at: 0, limit: 0 };
const listeners = new Set();
const subscribers = new Map();
let timer = 0;
let seq = 0;
// O canal da conta em tempo real: um aviso novo chega na hora, sem esperar pela consulta.
let signal = { owner: '', off: null };
let inflight = null;

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** Quem tem sessão e quantos avisos querem os que estão montados (o maior pedido serve a todos). */
function wanted() {
  let owner = '';
  let limit = 0;
  subscribers.forEach((s) => {
    if (!s.owner) return;
    owner = s.owner;
    limit = Math.max(limit, s.limit);
  });
  return { owner, limit };
}

const onVisible = () => {
  if (document.visibilityState === 'visible') refreshNotifications();
};

function sync() {
  const { owner } = wanted();
  // Entrou outra pessoa: nada da anterior fica, nem em memória. (Sem ninguém montado — entre
  // duas páginas, ou depois de sair da conta — o estado fica, mas só se mostra ao seu dono.)
  if (owner && state.owner && state.owner !== owner) set({ owner: '', items: [], at: 0, limit: 0, loading: false });
  if (owner && !timer && typeof window !== 'undefined') {
    timer = setInterval(onVisible, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
  } else if (!owner && timer) {
    clearInterval(timer);
    timer = 0;
    document.removeEventListener('visibilitychange', onVisible);
  }
  if (signal.owner !== owner) {
    signal.off?.();
    signal = { owner, off: owner ? subscribeSignal(accountTopic(owner), 'avisos', () => refreshNotifications()) : null };
  }
}

/** Pede os avisos (um só pedido de cada vez; o maior pedido serve todos os que esperam). */
export function refreshNotifications({ maxAge = 0 } = {}) {
  const { owner, limit } = wanted();
  if (!owner) return Promise.resolve();
  if (inflight && inflight.owner === owner && inflight.limit >= limit) return inflight.promise;
  if (maxAge && state.owner === owner && state.limit >= limit && Date.now() - state.at < maxAge) return Promise.resolve();
  const run = { owner, limit, id: ++seq };
  set({ loading: true });
  run.promise = (async () => {
    try {
      const { loadNotifications } = await api();
      const items = await loadNotifications(limit);
      if (run.id === seq && wanted().owner === owner) set({ owner, items, at: Date.now(), limit });
    } catch {
      // sem a tabela ou sem rede: fica o que havia
    } finally {
      if (inflight === run) inflight = null;
      if (run.id === seq) set({ loading: false });
    }
  })();
  inflight = run;
  return run.promise;
}

// Os que montam na mesma pintura (o sino, a barra, o perfil) juntam-se num só pedido: o pedido
// sai depois de todos se terem apresentado, com o maior limite.
let kicked = false;
function kick() {
  if (kicked) return;
  kicked = true;
  Promise.resolve().then(() => {
    kicked = false;
    refreshNotifications({ maxAge: FRESH_MS });
  });
}

async function markAll() {
  const now = new Date().toISOString();
  set({ items: state.items.map((n) => ({ ...n, read_at: n.read_at || now })) });
  try {
    const { markAllNotificationsRead } = await api();
    await markAllNotificationsRead();
  } catch {
    refreshNotifications();
  }
}

async function markOne(id) {
  const now = new Date().toISOString();
  set({ items: state.items.map((n) => (n.id === id ? { ...n, read_at: n.read_at || now } : n)) });
  try {
    const { markNotificationRead } = await api();
    await markNotificationRead(id);
  } catch {
    // fica por ler no próximo carregamento
  }
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const getSnapshot = () => state;

/** Só para os testes: volta ao estado inicial. */
export function resetNotificationsStore() {
  subscribers.clear();
  sync();
  inflight = null;
  state = { owner: '', items: [], loading: false, at: 0, limit: 0 };
}

const NONE = [];

/**
 * Avisos do cliente com sessão. `limit`: quantos mostra quem chama (o pedido é o maior de
 * todos os que estão montados). `unread` conta todos os carregados; `unreadCommunity` só os
 * da comunidade (o distintivo da barra de baixo).
 */
export function useNotifications({ enabled = true, limit = 20 } = {}) {
  const user = useAuth()?.user;
  const owner = enabled && user?.id ? String(user.id) : '';
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const token = {};
    subscribers.set(token, { owner, limit });
    sync();
    if (owner) kick();
    return () => {
      subscribers.delete(token);
      sync();
    };
  }, [owner, limit]);

  const mine = owner && snap.owner === owner ? snap.items : NONE;
  const items = mine.length > limit ? mine.slice(0, limit) : mine;
  const refresh = useCallback(() => refreshNotifications(), []);

  return {
    items,
    loading: !!owner && snap.loading,
    unread: mine.filter((n) => !n.read_at).length,
    unreadCommunity: mine.filter((n) => !n.read_at && n.kind === 'community').length,
    refresh,
    markAll,
    markOne,
  };
}
