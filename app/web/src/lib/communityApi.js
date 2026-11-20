// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Comunidade: leitura pelas funções públicas (`community_list`, `community_list_replies`,
 * `community_thread`, `community_reader`, `community_sidebar`, `community_current_club`), sem
 * email nem id da conta, e escrita nas tabelas, sempre em nome de quem tem sessão (o RLS e os
 * triggers fixam o autor). Migrações: 20261106190000_comunidade, 20261106220000_comunidade_links_seguros
 * e 20261107060000_comunidade_premium.
 */
import { supabase } from '@/lib/supabaseClient';

export const PAGE_SIZE = 20;

/** A tabela ainda não existe (migração por aplicar): o site mostra "em breve" em vez de um erro. */
export function isMissingTable(error) {
  const code = String(error?.code || '');
  return code === '42P01' || code === '42883' || code === 'PGRST205' || code === 'PGRST202'
    || /does not exist|Could not find the (table|function)/i.test(String(error?.message || ''));
}

function raise(error) {
  if (!error) return;
  const e = new Error(error.message || 'Erro na comunidade.');
  e.code = error.code;
  throw e;
}

/**
 * Publicações (sem as respostas), com filtros e ordenação. Em "recentes" a página seguinte
 * pede-se com `before` (a data da última mostrada); nas outras ordens, com `offset`.
 */
export async function listPosts({ topic = '', kind = '', sort = 'recentes', bookId = null, query = '', before = null, offset = 0, limit = PAGE_SIZE } = {}) {
  const { data, error } = await supabase.rpc('community_list', {
    p_topic: topic || null,
    p_kind: kind || null,
    p_sort: sort || 'recentes',
    p_book_id: bookId || null,
    p_query: query || null,
    p_before: before || null,
    p_offset: offset || 0,
    p_limit: limit,
  });
  raise(error);
  return data || [];
}

/** Compatível com a primeira versão: o feed por livro. */
export const loadPosts = ({ bookId = null, before = null, limit = PAGE_SIZE } = {}) => listPosts({ bookId, before, limit });

/** Quantas respostas o cartão do feed mostra: a oficial e as duas mais recentes (PostCard). */
export const FEED_REPLIES_PER_POST = 2;

/**
 * Respostas das publicações indicadas (a oficial primeiro em cada uma). Com `perParent`, só as
 * oficiais e as N mais recentes de cada (migração 20261107170000): o feed não descarrega
 * conversas inteiras para mostrar duas respostas. Se a base ainda não tiver o parâmetro
 * (publicação a meio), pede como antes.
 */
export async function loadReplies(parentIds, { perParent = null } = {}) {
  const ids = [...new Set((parentIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const args = perParent ? { p_parent_ids: ids, p_per_parent: perParent } : { p_parent_ids: ids };
  let { data, error } = await supabase.rpc('community_list_replies', args);
  if (error && perParent && isMissingTable(error)) {
    ({ data, error } = await supabase.rpc('community_list_replies', { p_parent_ids: ids }));
  }
  raise(error);
  return data || [];
}

/** Uma publicação com todas as respostas: `{ post, replies }`, ou `null` se não existe ou está oculta. */
export async function loadThread(id) {
  const { data, error } = await supabase.rpc('community_thread', { p_id: id });
  raise(error);
  const rows = data || [];
  const post = rows.find((r) => !r.parent_id) || null;
  return post ? { post, replies: rows.filter((r) => r.parent_id) } : null;
}

/** Uma publicação ou resposta (depois de criar, para vir com o nome do autor). */
export async function loadPost(id) {
  const { data, error } = await supabase.rpc('community_thread', { p_id: id });
  raise(error);
  return (data || []).find((r) => r.id === id) || null;
}

/** Perfil público de um leitor, ou `null`. */
export async function loadReader(key) {
  const { data, error } = await supabase.rpc('community_reader', { p_key: key });
  raise(error);
  return (data || [])[0] || null;
}

export async function loadReaderPosts(key, before = null) {
  const { data, error } = await supabase.rpc('community_reader_posts', { p_key: key, p_before: before || null, p_limit: PAGE_SIZE });
  raise(error);
  return data || [];
}

/** Coluna lateral: números, temas com publicações recentes e livros mais falados. */
export async function loadSidebar() {
  const { data, error } = await supabase.rpc('community_sidebar');
  raise(error);
  return data || { members: 0, posts_week: 0, posts_total: 0, topics: [], books: [] };
}

export async function loadCurrentClub() {
  const { data, error } = await supabase.rpc('community_current_club');
  raise(error);
  return (data || [])[0] || null;
}

/** Temas activos (a equipa lê também os desligados, pelo RLS). */
export async function loadTopics() {
  const { data, error } = await supabase.from('community_topics')
    .select('slug, name, description, icon, sort_order, active')
    .order('sort_order', { ascending: true }).order('name', { ascending: true });
  raise(error);
  return data || [];
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

// ── Equipa: fixar, resposta oficial, temas e clube ───────────────────────

export async function setPinned(id, pinned) {
  const { error } = await supabase.from('community_posts').update({ pinned_at: pinned ? new Date().toISOString() : null }).eq('id', id);
  raise(error);
}

export async function setOfficial(id, official) {
  const { error } = await supabase.from('community_posts').update({ is_official: !!official }).eq('id', id);
  raise(error);
}

export async function saveTopic(topic, isNew = false) {
  const row = {
    name: String(topic.name || '').trim(),
    description: String(topic.description || '').trim().slice(0, 200),
    icon: topic.icon || 'book-open',
    sort_order: Number(topic.sort_order) || 0,
    active: topic.active !== false,
  };
  const q = isNew
    ? supabase.from('community_topics').insert({ ...row, slug: topic.slug })
    : supabase.from('community_topics').update(row).eq('slug', topic.slug);
  const { error } = await q;
  if (error?.code === '23505') throw new Error('Já existe um tema com esse endereço.');
  if (error?.code === '23514') throw new Error('Verifique o nome (2 a 60 letras) e o endereço (só letras, números e hífens).');
  raise(error);
}

export async function deleteTopic(slug) {
  const { error } = await supabase.from('community_topics').delete().eq('slug', slug);
  raise(error);
}

export async function loadClubs() {
  const { data, error } = await supabase.from('community_book_clubs')
    .select('id, book_id, month, title, intro, active, created')
    .order('month', { ascending: false }).limit(36);
  raise(error);
  return data || [];
}

export async function saveClub(club) {
  const row = {
    book_id: club.book_id,
    month: club.month,
    title: String(club.title || '').trim().slice(0, 120),
    intro: String(club.intro || '').trim().slice(0, 1000),
    active: club.active !== false,
  };
  const q = club.id
    ? supabase.from('community_book_clubs').update(row).eq('id', club.id)
    : supabase.from('community_book_clubs').insert(row);
  const { error } = await q;
  if (error?.code === '23505') throw new Error('Já há um clube para esse mês.');
  raise(error);
}

export async function deleteClub(id) {
  const { error } = await supabase.from('community_book_clubs').delete().eq('id', id);
  raise(error);
}

/** Publicações recentes para a equipa (incluindo ocultas), com pesquisa no texto. */
export async function loadStaffPosts(query = '') {
  let q = supabase.from('community_posts')
    .select('id, parent_id, body, topic, kind, hidden, pinned_at, reports_count, likes_count, replies_count, created')
    .is('parent_id', null)
    .order('created', { ascending: false }).limit(100);
  const text = String(query || '').trim();
  if (text) q = q.ilike('body', `%${text.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
  const { data, error } = await q;
  raise(error);
  return data || [];
}

// ── Avisos (sino do cabeçalho) ───────────────────────────────────────────

/** Avisos do próprio (o RLS só devolve os seus), mais recentes primeiro. */
export async function loadNotifications(limit = 20) {
  const { data, error } = await supabase.from('customer_notifications')
    .select('id, kind, title, body, href, read_at, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  raise(error);
  return data || [];
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('customer_mark_all_notifications_read');
  raise(error);
}

export async function markNotificationRead(id) {
  const { error } = await supabase.rpc('customer_mark_notification_read', { p_notification_id: id });
  raise(error);
}

export async function loadCommunityNotify(userId) {
  const { data, error } = await supabase.from('profiles').select('community_notify').eq('id', userId).maybeSingle();
  raise(error);
  return data?.community_notify !== false;
}

export async function setCommunityNotify(userId, on) {
  const { error } = await supabase.from('profiles').update({ community_notify: !!on }).eq('id', userId);
  raise(error);
}

/** Títulos e capas dos livros dos clubes (para a lista do painel). */
export async function loadBookTitles(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await supabase.from('stock_books').select('id, title').in('id', list);
  raise(error);
  return Object.fromEntries((data || []).map((b) => [b.id, b.title]));
}
