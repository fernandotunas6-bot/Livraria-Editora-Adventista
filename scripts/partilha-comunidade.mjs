// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Partilha das publicações da comunidade (/comunidade/p/:id): o que o WhatsApp, o Facebook e o
// X lêem quando alguém cola o link. Funções puras, usadas pela Pages Function
// (functions/comunidade/p/[id].js) e pelo pós-build (seo-catalogo.mjs); testadas em
// partilha-comunidade.test.mjs.

import { plainSummary } from './seo-paginas.mjs';
import { postKind } from '../app/web/src/lib/communityStyle.js';

/** Ids gerados pela base de dados (`gen_record_id`): 15 letras e números. */
export const isPostId = (value) => /^[a-z0-9]{6,32}$/i.test(String(value || ''));

/**
 * Imagem absoluta e segura: https, ou um caminho do próprio site (/images/capas/…) completado
 * com a origem. Um `javascript:`, `data:` ou `//outro-site` nunca chega às etiquetas.
 */
function shareImage(url, origin) {
  const value = String(url || '').trim();
  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) return value;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(value)) return `${origin}${value}`;
  return '';
}

/**
 * Etiquetas de uma publicação (a linha de raiz devolvida por `community_thread`). Nunca usa o
 * email nem o id da conta: só o nome público, o texto e o livro.
 */
export function postShareMeta(post, origin) {
  const base = String(origin).replace(/\/$/, '');
  const kind = postKind(post.kind).label;
  const author = String(post.author_name || 'Um leitor').trim() || 'Um leitor';
  const book = String(post.book_title || '').trim();
  const title = book ? `${kind} de ${author} sobre «${book}»` : `${kind} de ${author}`;
  const quote = String(post.quote || '').trim();
  const body = String(post.body || '').trim();
  const text = quote && post.kind === 'citacao' ? `“${quote}” — ${body}` : body;
  const description = plainSummary(text, 180) || 'Uma conversa na Comunidade de Leitores da Livraria Adventista.';
  return {
    title: `${title} — Comunidade`,
    description,
    image: shareImage(post.book_cover, base),
    imageAlt: book ? `Capa de ${book}` : '',
    url: `${base}/comunidade/p/${post.id}`,
    type: 'article',
  };
}

/**
 * Cabeçalhos de um bloco do `_headers` do Cloudflare Pages (por omissão `/*`). As respostas
 * das Functions não recebem o `_headers`, por isso a Function aplica-os ela própria: sem isto,
 * a página da publicação saía sem CSP nem HSTS.
 */
export function headersFor(text, pattern = '/*') {
  const out = {};
  let inside = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { inside = raw.trim() === pattern; continue; }
    if (!inside) continue;
    const i = raw.indexOf(':');
    if (i > 0) out[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
  }
  return out;
}

/** Só a página das publicações passa pela Function; o resto do site continua estático. */
export const ROUTES = { version: 1, include: ['/comunidade/p/*'], exclude: [] };
