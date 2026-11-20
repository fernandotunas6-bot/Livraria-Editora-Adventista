// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O que se escreveu na procura do painel (Ctrl+K)? Um número de encomenda, um código de produto,
// um email, um telefone ou texto solto. Conforme o que for, a procura põe à frente a acção certa
// ("Abrir produto LIV-063", "Encomendas de ana@…") em vez de só procurar secções pelo nome.
//
// E as secções abertas há pouco, por pessoa, para a procura vazia começar por elas — com a vista
// onde se estava ("colportagem:contas"), uma entrada por secção.

import { looksLikeProductCode, normalizeProductCode } from '@/lib/productTypes';

/** @returns {{ kind: 'empty'|'order'|'product'|'email'|'phone'|'text', value: string }} */
export function detectQuery(raw) {
  const q = String(raw || '').trim();
  if (!q) return { kind: 'empty', value: '' };
  if (looksLikeProductCode(q)) return { kind: 'product', value: normalizeProductCode(q) };
  // Números de encomenda: LA-1234, LA-T1000, #1234ABCD…
  if (/^(la-?[a-z]?\d{2,}|#[a-z0-9]{6,})$/i.test(q)) return { kind: 'order', value: q.replace(/^#/, '').toUpperCase() };
  if (/^[^\s@]+@[^\s@]*$/.test(q)) return { kind: 'email', value: q.toLowerCase() };
  const digits = q.replace(/[\s()+.-]/g, '');
  if (/^\d{9,15}$/.test(digits)) return { kind: 'phone', value: digits.slice(-9) };
  return { kind: 'text', value: q };
}

const MAX_RECENTS = 5;
const recentsKey = (userId) => `livraria:painel:recentes${userId ? `:${userId}` : ''}`;

export function readRecentSections(userId) {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(recentsKey(userId)) || '[]');
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string').slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

/** "colportagem:contas" → { section: 'colportagem', view: 'contas' }; "orders" → sem vista. */
export function parseRecent(entry) {
  const [section, view = null] = String(entry || '').split(':');
  return { section, view: view || null };
}

/** Junta a secção (e a vista) ao topo das recentes — uma entrada por secção — e devolve a lista nova. */
export function pushRecentSection(userId, id) {
  if (!id) return readRecentSections(userId);
  const { section } = parseRecent(id);
  const list = [id, ...readRecentSections(userId).filter((x) => parseRecent(x).section !== section)].slice(0, MAX_RECENTS);
  try {
    globalThis.localStorage?.setItem(recentsKey(userId), JSON.stringify(list));
  } catch {
    // sem armazenamento: as recentes ficam só nesta visita
  }
  return list;
}
