import { supabase } from '@/lib/supabaseClient';

// Campos da migração 20261106090000 (pedidos numerados, assistente, notas, avaliação). Até ela
// chegar a produção, os pedidos com estes campos dão "column does not exist" e o atendimento usa
// os campos antigos — o site novo pode ser publicado antes ou depois da base de dados.
const THREAD_FIELDS = 'id, customer_id, order_id, subject, status, assigned_to, customer_last_read_at, staff_last_read_at, last_sender_id, last_message_at, created_at, updated_at, channel, ticket_number, category, priority, ai_summary, escalated_at, first_response_at, closed_at, csat_score, csat_comment, team_id, first_response_due_at, resolution_due_at';
const LEGACY_THREAD_FIELDS = 'id, customer_id, order_id, subject, status, assigned_to, customer_last_read_at, staff_last_read_at, last_sender_id, last_message_at, created_at, updated_at';
const MESSAGE_FIELDS = 'id, thread_id, sender_id, body, created_at, author_kind';
const LEGACY_MESSAGE_FIELDS = 'id, thread_id, sender_id, body, created_at';

let legacySchema = false;
const isMissingColumn = (error) => !!error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''));
const isMissingFunction = (error) => !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''));

const threadsQuery = (legacy) => (legacy
  ? supabase.from('support_threads').select(LEGACY_THREAD_FIELDS)
  : supabase.from('support_threads').select(THREAD_FIELDS));
const messagesQuery = (legacy) => (legacy
  ? supabase.from('support_messages').select(LEGACY_MESSAGE_FIELDS)
  : supabase.from('support_messages').select(MESSAGE_FIELDS));

/** Corre a consulta com os campos novos e, se a base de dados ainda não os tiver, com os antigos. */
async function withSchemaFallback(run) {
  if (!legacySchema) {
    const result = await run(false);
    if (!isMissingColumn(result.error)) return result;
    legacySchema = true;
  }
  return run(true);
}

export const supportSchemaIsLegacy = () => legacySchema;

/** Estados que a equipa filtra na própria consulta (a lista traz no máximo 100). */
const STAFF_STATUS_FILTERS = {
  active: ['open', 'pending'],
  open: ['open'],
  pending: ['pending'],
  bot: ['bot'],
  closed: ['closed'],
};
// As duas tabelas não têm as mesmas colunas: `href` só existe nas notificações do cliente
// (o destino da equipa decide-se no SupportCenter). Pedir `href` à staff_notifications dava
// 400, e como as consultas do atendimento correm juntas, a equipa ficava sem o separador
// inteiro (auditoria, 9.7). O teste supportApi.fields.test.js compara isto com as migrações.
export const CUSTOMER_NOTIFICATION_FIELDS = 'id, kind, title, body, href, order_id, thread_id, read_at, created_at';
export const STAFF_NOTIFICATION_FIELDS = 'id, kind, title, body, order_id, thread_id, read_at, created_at';

function throwOnError(error) {
  if (error) throw new Error(error.message || 'Não foi possível carregar o atendimento.');
}

export async function listSupportThreads({ staff, customerId, statusFilter = 'active' }) {
  const { data: threads, error } = await withSchemaFallback((legacy) => {
    let query = threadsQuery(legacy)
      .order('last_message_at', { ascending: false })
      .limit(100);
    if (!staff) query = query.eq('customer_id', customerId);
    else if (STAFF_STATUS_FILTERS[statusFilter]) query = query.in('status', STAFF_STATUS_FILTERS[statusFilter]);
    return query;
  });
  throwOnError(error);
  return hydrateThreads(threads, staff);
}

/** Uma conversa pelo id (a que está aberta e saiu do filtro, por exemplo depois de fechada). */
export async function getSupportThread(threadId, { staff }) {
  const { data, error } = await withSchemaFallback((legacy) => threadsQuery(legacy).eq('id', threadId).limit(1));
  throwOnError(error);
  const [thread] = await hydrateThreads(data, staff);
  return thread || null;
}

async function hydrateThreads(threads, staff) {
  if (!threads?.length) return [];

  const customerIds = [...new Set(threads.map((thread) => thread.customer_id).filter(Boolean))];
  const orderIds = [...new Set(threads.map((thread) => thread.order_id).filter(Boolean))];
  const [profilesResult, ordersResult] = await Promise.all([
    staff && customerIds.length
      ? supabase.from('profiles').select('id, name, email, customer_code').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from('orders')
        .select('id, order_number, status, payment_status, delivery_status, total, created')
        .in('id', orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwOnError(profilesResult.error);
  throwOnError(ordersResult.error);

  const profiles = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
  const orders = new Map((ordersResult.data || []).map((order) => [order.id, order]));
  return threads.map((thread) => ({
    ...thread,
    customer: profiles.get(thread.customer_id) || null,
    order: orders.get(thread.order_id) || null,
  }));
}

export async function listSupportMessages(threadId) {
  const { data, error } = await withSchemaFallback((legacy) => messagesQuery(legacy)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(200));
  throwOnError(error);
  return data || [];
}

/** Nota interna da equipa: o cliente nunca a vê (RLS). */
export async function addSupportNote(threadId, body) {
  const trimmed = String(body || '').trim();
  if (!threadId || !trimmed || trimmed.length > 4000) {
    throw new Error('A nota deve ter entre 1 e 4000 caracteres.');
  }
  const { error } = await supabase.rpc('support_add_note', { p_thread_id: threadId, p_body: trimmed });
  throwOnError(error);
}

/** Avaliação do atendimento pelo cliente (1 a 5), uma vez, depois de resolvido. */
export async function rateSupportThread(threadId, score, comment = '') {
  const { error } = await supabase.rpc('support_rate', {
    p_thread_id: threadId,
    p_score: Number(score),
    p_comment: String(comment || '').trim() || null,
  });
  throwOnError(error);
}

export async function sendSupportMessage(threadId, body) {
  const trimmed = String(body || '').trim();
  if (!threadId || !trimmed || trimmed.length > 4000) {
    throw new Error('A mensagem deve ter entre 1 e 4000 caracteres.');
  }
  // Sem pedir a linha de volta: a resposta ao insert passaria pelo RLS de leitura e pelos
  // campos novos; quem envia volta a carregar a conversa a seguir.
  const { error } = await supabase
    .from('support_messages')
    .insert({ thread_id: threadId, body: trimmed });
  throwOnError(error);
}

export async function createSupportThread({ subject, body, orderId = null }) {
  const { data, error } = await supabase.rpc('support_create_thread', {
    p_subject: String(subject || '').trim(),
    p_body: String(body || '').trim(),
    p_order_id: orderId || null,
  });
  throwOnError(error);
  return data;
}

export async function markSupportThreadRead(threadId) {
  const { error } = await supabase.rpc('support_mark_read', { p_thread_id: threadId });
  throwOnError(error);
}

export async function updateSupportThread({ threadId, status, assignedTo, priority = null, category = null }) {
  if (!legacySchema) {
    const { data, error } = await supabase.rpc('support_update_ticket', {
      p_thread_id: threadId,
      p_status: status,
      p_assigned_to: assignedTo || null,
      p_priority: priority,
      p_category: category,
    });
    if (!isMissingFunction(error)) {
      throwOnError(error);
      return data;
    }
  }
  const { data, error } = await supabase.rpc('support_update_thread', {
    p_thread_id: threadId,
    p_status: status,
    p_assigned_to: assignedTo || null,
  });
  throwOnError(error);
  return data;
}

export async function listCustomerNotifications() {
  const { data, error } = await supabase
    .from('customer_notifications')
    .select(CUSTOMER_NOTIFICATION_FIELDS)
    .order('created_at', { ascending: false })
    .limit(100);
  throwOnError(error);
  return data || [];
}

export async function listStaffNotifications() {
  const { data, error } = await supabase
    .from('staff_notifications')
    .select(STAFF_NOTIFICATION_FIELDS)
    .order('created_at', { ascending: false })
    .limit(100);
  throwOnError(error);
  return data || [];
}

export async function markCustomerNotificationRead(notificationId) {
  const { error } = await supabase.rpc('customer_mark_notification_read', {
    p_notification_id: notificationId,
  });
  throwOnError(error);
}

export async function markStaffNotificationRead(notificationId) {
  const { error } = await supabase.rpc('staff_mark_notification_read', {
    p_notification_id: notificationId,
  });
  throwOnError(error);
}

export async function listCustomerOrdersForSupport(customerId) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, created')
    .eq('customer_id', customerId)
    .order('created', { ascending: false })
    .limit(30);
  throwOnError(error);
  return data || [];
}

const TEAM_FIELDS = 'id, name, duties, active';

/** Equipas que tratam pedidos de ajuda (para escolher a equipa de um pedido). */
export async function listSupportTeams() {
  const { data, error } = await supabase.from('staff_teams').select(TEAM_FIELDS).eq('active', true).order('name');
  if (error) return [];
  return (data || []).filter((t) => (t.duties || []).includes('support') || (t.duties || []).includes('urgent'));
}

export async function setSupportTeam(threadId, teamId) {
  const { error } = await supabase.rpc('support_set_team', { p_thread_id: threadId, p_team_id: teamId || null });
  throwOnError(error);
}

/** Prazo de um pedido: 'late' (passou), 'soon' (menos de 2 h) ou ''. */
export function slaState(thread, now = Date.now()) {
  if (!thread?.ticket_number || !['open', 'pending'].includes(thread.status)) return { first: '', resolution: '' };
  const state = (iso, done) => {
    if (!iso || done) return '';
    const left = new Date(iso).getTime() - now;
    if (left < 0) return 'late';
    return left < 2 * 3600_000 ? 'soon' : 'ok';
  };
  return {
    first: state(thread.first_response_due_at, !!thread.first_response_at),
    // À espera do cliente ('pending'), o relógio da resolução está parado.
    resolution: thread.status === 'open' ? state(thread.resolution_due_at, false) : '',
  };
}

export async function listSupportAssignees() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, permissions')
    .in('role', ['admin', 'manager'])
    .order('name', { ascending: true })
    .limit(200);
  throwOnError(error);
  return (data || []).filter((profile) => (
    profile.role === 'admin' || profile.permissions?.manage_orders === true
  ));
}

/** Respostas da equipa ainda por ler (o ponto no botão do chat). */
export async function countUnreadSupportReplies() {
  const { count, error } = await supabase
    .from('customer_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'support')
    .is('read_at', null);
  if (error) return 0;
  return count || 0;
}

/** O cliente viu a conversa no chat: os avisos dessa conversa ficam lidos. */
export async function markThreadNotificationsRead(threadId) {
  if (!threadId) return;
  const { data, error } = await supabase
    .from('customer_notifications')
    .select('id')
    .eq('thread_id', threadId)
    .is('read_at', null)
    .limit(50);
  if (error || !data?.length) return;
  await Promise.all(data.map((n) => supabase.rpc('customer_mark_notification_read', { p_notification_id: n.id })));
}

const SAVED_REPLY_FIELDS = 'id, title, body';

export async function listSavedReplies() {
  const { data, error } = await supabase.from('support_saved_replies').select(SAVED_REPLY_FIELDS).order('title');
  if (error) return [];
  return data || [];
}

export async function saveSavedReply({ title, body }) {
  const row = { title: String(title || '').trim(), body: String(body || '').trim() };
  if (row.title.length < 2) throw new Error('Dê um título à resposta rápida.');
  if (row.body.length < 2) throw new Error('A resposta rápida está vazia.');
  const { error } = await supabase.from('support_saved_replies').insert(row);
  if (error) throw new Error(/saved_replies_title_key/.test(error.message) ? 'Já existe uma resposta rápida com esse título.' : error.message);
}

export async function deleteSavedReply(id) {
  const { error } = await supabase.from('support_saved_replies').delete().eq('id', id);
  throwOnError(error);
}

/** Preenche {nome}, {pedido} e {encomenda} de uma resposta rápida. */
export function fillSavedReply(body, thread) {
  const first = String(thread?.customer?.name || '').trim().split(/\s+/)[0];
  return String(body || '')
    .replaceAll('{nome}', first || 'cliente')
    .replaceAll('{pedido}', thread?.ticket_number ? `#${thread.ticket_number}` : '')
    .replaceAll('{encomenda}', thread?.order?.order_number || thread?.order_id || 'a sua encomenda')
    .replace(/[ \t]{2,}/g, ' ');
}
