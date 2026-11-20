// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import pb from '@/lib/dataClient';
import { supabase } from '@/lib/supabaseClient';

/** Funções que uma equipa pode ter, pela ordem do fluxo de uma encomenda. */
export const DUTIES = [
  { value: 'new_order', label: 'Receber encomendas novas', hint: 'É avisada de cada encomenda nova e tem de a assumir.' },
  { value: 'payment', label: 'Pagamentos', hint: 'Confirma transferências e referências; avisada de pagamentos por confirmar.' },
  { value: 'preparation', label: 'Preparação', hint: 'Separa e embala; avisada de encomendas pagas e paradas.' },
  { value: 'pickup', label: 'Levantamentos na loja', hint: 'Avisada de encomendas prontas que ninguém levantou.' },
  { value: 'delivery', label: 'Entregas', hint: 'Expedição e entregas; avisada de atrasos e prazos ultrapassados.' },
  { value: 'support', label: 'Atendimento', hint: 'Pedidos de ajuda do chat e do formulário, e problemas de clientes.' },
  { value: 'urgent', label: 'Urgências', hint: 'Recebe o que é crítico ou que ninguém assumiu a tempo.' },
];
export const DUTY_LABELS = Object.fromEntries(DUTIES.map((d) => [d.value, d.label]));

export const WEEK_DAYS = [
  [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom'],
];

function throwOnError(error, fallback = 'Não foi possível guardar.') {
  if (!error) return;
  const msg = String(error.message || '');
  if (/staff_teams_name_key/.test(msg)) throw new Error('Já existe uma equipa com esse nome.');
  if (/row-level security|permission denied/i.test(msg)) throw new Error('Sem permissão: só quem gere utilizadores configura as equipas.');
  throw new Error(msg || fallback);
}

const TEAM_FIELDS = 'id, name, store_id, duties, escalation_minutes, notify_email, notify_whatsapp, notify_push, active, created_at';
const MEMBER_FIELDS = 'team_id, profile_id, is_lead';
const OPS_FIELDS = 'open_hour, close_hour, open_days, auto_close_days';

export async function loadTeams() {
  const [teams, members, staff, stores, ops] = await Promise.all([
    supabase.from('staff_teams').select(TEAM_FIELDS).order('name'),
    supabase.from('staff_team_members').select(MEMBER_FIELDS),
    supabase.from('profiles').select('id, name, email, phone, role, permissions').in('role', ['admin', 'manager']).order('name'),
    supabase.from('physical_stores').select('id, name, active').order('sort_order'),
    supabase.from('staff_ops_settings').select(OPS_FIELDS).eq('id', 1).maybeSingle(),
  ]);
  for (const r of [teams, members, staff, stores, ops]) throwOnError(r.error, 'Não foi possível carregar as equipas.');
  return {
    teams: teams.data || [],
    members: members.data || [],
    staff: (staff.data || []).filter((p) => p.role === 'admin' || p.permissions?.manage_orders === true || p.permissions?.manage_orders === 'true'),
    stores: stores.data || [],
    hours: ops.data || { open_hour: 8, close_hour: 18, open_days: [1, 2, 3, 4, 5, 6], auto_close_days: 7 },
  };
}

export async function saveTeam(team) {
  const row = {
    name: String(team.name || '').trim(),
    store_id: team.store_id || null,
    duties: team.duties || [],
    escalation_minutes: Number(team.escalation_minutes) || 30,
    notify_email: !!team.notify_email,
    notify_whatsapp: !!team.notify_whatsapp,
    notify_push: !!team.notify_push,
    active: team.active !== false,
  };
  if (row.name.length < 2) throw new Error('Dê um nome à equipa (pelo menos 2 letras).');
  if (!row.duties.length) throw new Error('Escolha pelo menos uma função para a equipa.');
  const query = team.id
    ? supabase.from('staff_teams').update(row).eq('id', team.id).select(TEAM_FIELDS).single()
    : supabase.from('staff_teams').insert(row).select(TEAM_FIELDS).single();
  const { data, error } = await query;
  throwOnError(error);
  return data;
}

export async function deleteTeam(teamId) {
  const { error } = await supabase.from('staff_teams').delete().eq('id', teamId);
  throwOnError(error);
}

/** Substitui os membros de uma equipa (quem sai, quem entra, quem é responsável). */
export async function setTeamMembers(teamId, members) {
  const { data: current, error } = await supabase.from('staff_team_members').select(MEMBER_FIELDS).eq('team_id', teamId);
  throwOnError(error);
  const wanted = new Map(members.map((m) => [m.profile_id, !!m.is_lead]));
  const removed = (current || []).filter((m) => !wanted.has(m.profile_id)).map((m) => m.profile_id);
  if (removed.length) {
    const r = await supabase.from('staff_team_members').delete().eq('team_id', teamId).in('profile_id', removed);
    throwOnError(r.error);
  }
  if (wanted.size) {
    const r = await supabase.from('staff_team_members').upsert(
      [...wanted].map(([profileId, isLead]) => ({ team_id: teamId, profile_id: profileId, is_lead: isLead })),
      { onConflict: 'team_id,profile_id' },
    );
    throwOnError(r.error);
  }
}

export async function saveOpsHours({ open_hour, close_hour, open_days, auto_close_days }) {
  const open = Number(open_hour);
  const close = Number(close_hour);
  const autoClose = Number(auto_close_days ?? 7);
  if (!(open >= 0 && close <= 24 && open < close)) throw new Error('A hora de abertura tem de ser antes da de fecho.');
  if (!open_days?.length) throw new Error('Escolha pelo menos um dia de funcionamento.');
  if (!(autoClose === 0 || (autoClose >= 3 && autoClose <= 60))) throw new Error('O fecho automático é 0 (desligado) ou entre 3 e 60 dias.');
  const { data, error } = await supabase.from('staff_ops_settings')
    .update({ open_hour: open, close_hour: close, open_days, auto_close_days: autoClose, updated_at: new Date().toISOString() })
    .eq('id', 1).select(OPS_FIELDS);
  throwOnError(error);
  if (!data?.length) throw new Error('Sem permissão: só quem gere utilizadores muda o horário.');
}

export const loadRouting = () => pb.send('/admin/ops/routing', { method: 'GET' });
export const sendTeamTest = (teamId) => pb.send('/admin/ops/test', { method: 'POST', body: { team_id: teamId } });

/** "Fico eu com esta encomenda." */
export async function acknowledgeOrder(orderId) {
  const { data, error } = await supabase.rpc('order_acknowledge', { p_order_id: orderId });
  if (error) throw new Error(error.message || 'Não foi possível assumir a encomenda.');
  return data;
}

/** "Estou a tratar deste alerta" — pára a escalada. */
export async function acknowledgeAlert(orderId, kind) {
  const { error } = await supabase.rpc('order_alert_acknowledge', { p_order_id: orderId, p_kind: kind });
  if (error) throw new Error(error.message || 'Não foi possível assumir o alerta.');
}

const ALERT_FIELDS = 'id, kind, title, body, order_id, thread_id, severity, read_at, created_at';

/** Avisos por ler que pedem acção (encomendas novas e tudo o que é alto ou crítico). */
export async function listActionAlerts() {
  const { data, error } = await supabase.from('staff_notifications')
    .select(ALERT_FIELDS)
    .is('read_at', null)
    .or('kind.eq.new_order,severity.eq.high,severity.eq.critical')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    // Antes da migração não há `severity`: só as encomendas novas.
    if (/severity/.test(error.message || '')) {
      const legacy = await supabase.from('staff_notifications').select('id, kind, title, body, order_id, thread_id, read_at, created_at')
        .is('read_at', null).eq('kind', 'new_order').order('created_at', { ascending: false }).limit(20);
      if (legacy.error) throw new Error(legacy.error.message);
      return legacy.data || [];
    }
    throw new Error(error.message);
  }
  return data || [];
}

export async function dismissAlert(notificationId) {
  const { error } = await supabase.rpc('staff_mark_notification_read', { p_notification_id: notificationId });
  if (error) throw new Error(error.message);
}

export const loadSupportReport = (days = 7) => pb.send(`/admin/support/report?days=${days}`, { method: 'GET' });
export const suggestSupportReply = (threadId) => pb.send('/admin/support/suggest-reply', { method: 'POST', body: { thread_id: threadId } });
