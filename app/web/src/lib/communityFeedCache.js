// O que o feed da comunidade já tinha carregado, por filtros, enquanto o site está aberto.
//
// Ao voltar de uma publicação para o feed, a página montava de novo, pedia tudo outra vez e
// começava no topo: quem estava na vigésima publicação perdia o lugar. Com isto o feed volta
// logo com as mesmas publicações (e o `useScrollMemory` repõe a posição), como numa loja
// em que se abre um produto e se volta à lista.
//
// Fica só em memória (não sobrevive a recarregar a página) e expira ao fim de 10 minutos, para
// não mostrar uma conversa velha a quem deixou o separador aberto.

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 12;
const cache = new Map();

/** Chave dos filtros do feed: as mesmas que o pedido ao servidor. */
export function feedKey({ bookId = null, topic = '', kind = '', sort = 'recentes', query = '' } = {}) {
  return JSON.stringify([bookId || '', topic || '', kind || '', sort || 'recentes', query || '']);
}

/** O que estava carregado para estes filtros, ou `null` (nunca carregado ou já velho). */
export function readFeed(key, now = Date.now()) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function writeFeed(key, value, now = Date.now()) {
  cache.delete(key);
  cache.set(key, { ...value, at: now });
  // As mais antigas saem primeiro (o Map guarda a ordem de inserção).
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/** Depois de publicar ou apagar, os outros filtros podem estar desactualizados. */
export function clearFeeds() {
  cache.clear();
}
