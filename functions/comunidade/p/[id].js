// Cloudflare Pages Function: /comunidade/p/:id com as etiquetas de partilha da publicação
// (título, texto, capa do livro), para o WhatsApp e as redes mostrarem a pré-visualização.
// O resto da página é o mesmo index.html da aplicação: quem abre no navegador vê o React.
//
// Se a publicação não existir, estiver oculta ou o Supabase não responder a tempo, devolve a
// página normal: nunca uma página partida por causa da pré-visualização.
//
// A configuração (endereço do Supabase, chave pública e cabeçalhos de segurança) é gerada
// pelo scripts/seo-catalogo.mjs no pós-build e não vai para o git.
import config from '../../../scripts/gerado/pages-config.mjs';
import { renderSharePage } from '../../../scripts/seo-paginas.mjs';
import { isPostId, postShareMeta } from '../../../scripts/partilha-comunidade.mjs';

const TIMEOUT_MS = 2500;

async function loadPost(id) {
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/community_thread`, {
    method: 'POST',
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${config.supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows.find((r) => r && !r.parent_id && r.id === id) || null : null;
}

function respond(html, status = 200) {
  const headers = new Headers(config.headers || {});
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-cache');
  return new Response(html, { status, headers });
}

export async function onRequestGet({ request, params, next }) {
  const page = await next();
  if (!page.ok || !(page.headers.get('Content-Type') || '').includes('text/html')) return page;
  const html = await page.text();
  const id = String(params.id || '');
  if (!isPostId(id)) return respond(html);
  try {
    const post = await loadPost(id);
    if (!post) return respond(html);
    return respond(renderSharePage(html, postShareMeta(post, new URL(request.url).origin)));
  } catch {
    return respond(html);
  }
}
