// Pesquisas recentes, neste aparelho: ao tocar na lupa, o que se procurou da última vez fica à
// mão em vez de se escrever outra vez num teclado pequeno (como nas lojas grandes). Só neste
// navegador (localStorage), as últimas oito, e apagam-se com "Limpar".

const KEY = 'livraria:pesquisas-recentes';
export const MAX_RECENT_SEARCHES = 8;

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');

export function getRecentSearches(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string' && norm(t)).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

/** Junta ao topo (sem repetir, sem distinguir maiúsculas) e devolve a lista nova. */
export function addRecentSearch(term, storage = globalThis.localStorage) {
  const t = norm(term).slice(0, 80);
  if (t.length < 2) return getRecentSearches(storage);
  const list = [t, ...getRecentSearches(storage).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
  try {
    storage?.setItem(KEY, JSON.stringify(list));
  } catch {
    // sem armazenamento: fica só nesta visita
  }
  return list;
}

export function clearRecentSearches(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    // idem
  }
}
