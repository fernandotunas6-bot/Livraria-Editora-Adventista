/**
 * Comunidade: leitura pela vista pública `community_posts_public` (sem email nem id da conta) e
 * escrita nas tabelas, sempre em nome de quem tem sessão (o RLS e os triggers fixam o autor).
 * Migração: supabase/migrations/20261106190000_comunidade.sql.
 */
import { supabase } from '@/lib/supabaseClient';

export const PAGE_SIZE = 20;
const POST_FIELDS = 'id, parent_id, book_id, book_title, body, quote, quote_page, links, likes_count, created, updated, author_name, mine';

/** A tabela ainda não existe (migração por aplicar): o site mostra "em breve" em vez de um erro. */
export function isMissingTable(error) {
  const code = String(error?.code || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|Could not find the table/i.test(String(error?.message || ''));
}

function raise(error) {
  if (!error) return;
  const e = new Error(error.message || 'Erro na comunidade.');
  e.code = error.code;
  throw e;
}

/** Publicações (sem as respostas), mais recentes primeiro. `before` é a data da última já mostrada. */
export async function loadPosts({ bookId = null, before = null, limit = PAGE_SIZE } = {}) {
  let q = supabase.from('community_posts_public').select(POST_FIELDS).is('parent_id', null);
  if (bookId) q = q.eq('book_id', bookId);
  if (before) q = q.lt('created', before);
  const { data, error } = await q.order('created', { ascending: false }).limit(limit);
  raise(error);
  return data || [];
}

/** Respostas das publicações indicadas, da mais antiga para a mais recente. */
export async function loadReplies(parentIds) {
  const ids = [...new Set((parentIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('community_posts_public').select(POST_FIELDS)
    .in('parent_id', ids).order('created', { ascending: true }).limit(500);
  raise(error);
  return data || [];
}

/** Uma publicação pela vista (depois de criar, para vir com o nome do autor). */
export async function loadPost(id) {
  const { data, error } = await supabase.from('community_posts_public').select(POST_FIELDS).eq('id', id).maybeSingle();
  raise(error);
  return data;
}

/** Ids das publicações de que quem lê gosta (só as suas: o RLS não deixa ver as dos outros). */
export async function loadMyLikes(postIds) {
  const ids = [...new Set((postIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('community_likes').select('post_id').in('post_id', ids);
  raise(error);
  return (data || []).map((r) => r.post_id);
}

export async function createPost(userId, data) {
  const { data: row, error } = await supabase.from('community_posts')
    .insert({ ...data, user_id: userId }).select('id').single();
  raise(error);
  return loadPost(row.id);
}

export async function setLike(postId, userId, liked) {
  const { error } = liked
    ? await supabase.from('community_likes').insert({ post_id: postId, user_id: userId })
    : await supabase.from('community_likes').delete().eq('post_id', postId).eq('user_id', userId);
  // Gostar duas vezes (dois separadores abertos) não é erro.
  if (error && error.code !== '23505') raise(error);
}

/** Denuncia uma vez; uma segunda denúncia da mesma pessoa conta como já feita. */
export async function reportPost(postId, userId, reason = '') {
  const { error } = await supabase.from('community_reports')
    .insert({ post_id: postId, user_id: userId, reason: String(reason || '').slice(0, 300) });
  if (error && error.code !== '23505') raise(error);
}

export async function deletePost(id) {
  const { error } = await supabase.from('community_posts').delete().eq('id', id);
  raise(error);
}

// ── Equipa ───────────────────────────────────────────────────────────────

/** Publicações denunciadas ou ocultas, para o painel (a equipa lê a tabela pelo RLS). */
export async function loadModerationQueue() {
  const { data, error } = await supabase.from('community_posts')
    .select('id, parent_id, book_id, body, quote, links, reports_count, hidden, moderation_note, created')
    .or('reports_count.gt.0,hidden.eq.true')
    .order('reports_count', { ascending: false }).order('created', { ascending: false }).limit(200);
  raise(error);
  const ids = (data || []).map((p) => p.id);
  let reasons = [];
  if (ids.length) {
    const r = await supabase.from('community_reports').select('post_id, reason, created').in('post_id', ids);
    raise(r.error);
    reasons = r.data || [];
  }
  return (data || []).map((p) => ({
    ...p,
    reasons: reasons.filter((r) => r.post_id === p.id && r.reason).map((r) => r.reason),
  }));
}

export async function setHidden(id, hidden) {
  const { error } = await supabase.from('community_posts').update({ hidden }).eq('id', id);
  raise(error);
}

/** Restabelecer: mostra outra vez e limpa as denúncias (senão a próxima voltava a ocultar). */
export async function restorePost(id) {
  const del = await supabase.from('community_reports').delete().eq('post_id', id);
  raise(del.error);
  await setHidden(id, false);
}

// ── Sites bloqueados (links maliciosos e de conteúdo adulto) ─────────────
// Migração 20261106220000_comunidade_links_seguros. Juntar um domínio oculta logo as
// publicações que o têm; a base de dados recusa-o nas próximas.

export const BLOCK_CATEGORIES = [
  { value: 'adulto', label: 'Conteúdo adulto' },
  { value: 'malicioso', label: 'Perigoso (burla, vírus)' },
  { value: 'encurtador', label: 'Encurtador de links' },
  { value: 'outro', label: 'Outro motivo' },
];

export async function loadBlockedDomains() {
  const { data, error } = await supabase.from('community_blocked_domains')
    .select('domain, category, source, note, created')
    .order('created', { ascending: false }).limit(1000);
  raise(error);
  return data || [];
}

export async function addBlockedDomain(domain, category = 'outro', note = '') {
  const { error } = await supabase.from('community_blocked_domains')
    .insert({ domain: String(domain || '').trim(), category, note: String(note || '').slice(0, 200) });
  if (error?.code === '23505') throw new Error('Esse site já está bloqueado.');
  if (error?.code === '23514') throw new Error('Escreva só o nome do site, por exemplo exemplo.com.');
  raise(error);
}

export async function removeBlockedDomain(domain) {
  const { error } = await supabase.from('community_blocked_domains').delete().eq('domain', domain);
  raise(error);
}
