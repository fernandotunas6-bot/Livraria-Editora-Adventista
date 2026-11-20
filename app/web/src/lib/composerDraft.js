// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Rascunhos do compositor da comunidade, guardados no próprio telemóvel.
//
// No telemóvel escreve-se aos poucos: uma chamada, o ecrã que bloqueia, um toque fora da folha,
// e o texto perdia-se (ficava só no estado do React). Agora fica no `localStorage`, por conta e
// por sítio onde se escreve (o feed geral, a discussão de um livro, a resposta a uma
// publicação), durante uma semana. Sai quando a publicação é enviada ou quando a pessoa o apaga.

const PREFIX = 'livraria:rascunho:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Chave do rascunho: sem conta não se guarda nada (não se mistura o de duas pessoas). */
export function draftStorageKey(userKey, context = 'feed') {
  return userKey ? `${PREFIX}${userKey}:${context || 'feed'}` : '';
}

export function isEmptyDraft(draft) {
  if (!draft) return true;
  return !String(draft.body || '').trim() && !String(draft.quote || '').trim() && !(draft.links || []).length;
}

/** O rascunho guardado, ou `null` (nenhum, velho, ou o armazenamento está bloqueado). */
export function readDraft(key, now = Date.now()) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' || now - (draft.at || 0) > MAX_AGE_MS || isEmptyDraft(draft)) {
      localStorage.removeItem(key);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** Guarda (ou apaga, se estiver vazio). Nunca lança. */
export function saveDraft(key, draft, now = Date.now()) {
  if (!key) return;
  try {
    if (isEmptyDraft(draft)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ ...draft, at: now }));
  } catch {
    // armazenamento cheio ou bloqueado: perde-se só a conveniência
  }
}

export function clearDraft(key) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // idem
  }
}

/**
 * Contador de caracteres: só aparece perto do limite (a partir de 80 %), e passa a aviso nos
 * últimos 5 %. Abaixo disso é ruído num ecrã pequeno.
 */
export function counterState(length, max) {
  if (!max || length < max * 0.8) return 'hidden';
  return length >= max * 0.95 ? 'warn' : 'show';
}
