// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Regras do texto das publicações da comunidade: os mesmos limites que a base de dados
 * (`community_posts`, migração 20261106190000_comunidade), para o erro aparecer antes de enviar.
 */
import { MAX_LINKS, extractLinks, linkProblem, safeHref } from './communityLinks';

export const MAX_BODY = 2000;
export const MAX_QUOTE = 500;
export const MAX_QUOTE_PAGE = 40;

/** Texto limpo: sem espaços nas pontas e no máximo uma linha em branco seguida. */
export function cleanBody(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Dados prontos a gravar, ou `{ error }`. Os links vêm do texto e da lista escrita à parte,
 * juntos e sem repetir, até `MAX_LINKS`.
 */
export function preparePost({ body, quote = '', quotePage = '', links = [], bookId = null, parentId = null }) {
  const text = cleanBody(body);
  if (!text) return { error: 'Escreva alguma coisa antes de publicar.' };
  if (text.length > MAX_BODY) return { error: `O texto tem ${text.length} caracteres; o máximo é ${MAX_BODY}.` };
  const q = String(quote ?? '').trim();
  if (q.length > MAX_QUOTE) return { error: `A citação tem ${q.length} caracteres; o máximo é ${MAX_QUOTE}.` };
  const page = String(quotePage ?? '').trim();
  if (page.length > MAX_QUOTE_PAGE) return { error: 'A página da citação é demasiado comprida.' };
  const extra = Array.isArray(links) ? links.map((l) => String(l ?? '').trim()).filter(Boolean) : [];
  if (extra.some((l) => !safeHref(l))) {
    return { error: 'Há um link inválido: use um endereço que comece por http:// ou https://.' };
  }
  // Os endereços do texto e da citação também viram links: as mesmas regras para todos.
  const written = [...(String(text).match(/https?:\/\/[^\s<>"']+/gi) || []), ...(q.match(/https?:\/\/[^\s<>"']+/gi) || [])]
    .map((raw) => raw.replace(/[.,;:!?)\]]+$/, ''));
  const problem = [...written, ...extra].map(linkProblem).find(Boolean);
  if (problem) return { error: problem };
  const all = [...new Set([...extractLinks(text, Infinity), ...extra.map(safeHref)])];
  if (new Set([...all, ...extractLinks(q, Infinity)]).size > MAX_LINKS) return { error: `No máximo ${MAX_LINKS} links por publicação.` };
  return {
    data: {
      body: text,
      quote: q,
      quote_page: q ? page : '',
      links: all,
      book_id: bookId || null,
      parent_id: parentId || null,
    },
  };
}

/** Iniciais para o círculo do autor ("Maria João" → "MJ"). */
export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'L';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias", ou a data. */
export function relativeTime(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return `há ${d} dia${d > 1 ? 's' : ''}`; }
  return new Date(t).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
}
