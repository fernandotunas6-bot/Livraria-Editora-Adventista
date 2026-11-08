// Cargos da equipa (migração 20261108130000_cargos_e_ver_relatorios): Caixa, Atendimento,
// Gerente de loja… Um gestor com cargo tem as permissões do cargo; mudar o cargo muda logo toda a
// gente que o tem. Quem pode o quê decide a base de dados (só administradores escrevem); aqui só
// se pede e se mostra.
import { supabase } from '@/lib/supabaseClient';
import { DEFAULT_PERMISSIONS, PERMISSIONS } from '@/lib/permissions';

/** Antes da migração: a tabela ou a função ainda não existem. */
export const isStaffRolesMissing = (error) => {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /42P01|PGRST20[25]|staff_roles|staff_role_assign/.test(text) && /does not exist|not find|schema cache|não existe/i.test(text);
};

const fail = (error) => {
  throw new Error(error?.message || 'Não foi possível guardar o cargo.');
};

/** Só as chaves conhecidas, verdadeiro ou falso — como a base de dados as guarda. */
export const cleanRolePermissions = (permissions = {}) =>
  Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, permissions?.[k] === true]));

/** Os nomes das permissões ligadas de um cargo, pela ordem do registo. */
export const rolePermissionLabels = (permissions = {}) =>
  Object.entries(PERMISSIONS).filter(([k]) => permissions?.[k] === true).map(([, p]) => p.label);

/** Os cargos, pela ordem. `{ roles, missing }`: `missing` antes da migração. */
export async function listStaffRoles() {
  const { data, error } = await supabase
    .from('staff_roles')
    .select('id, name, description, permissions, position')
    .order('position', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    if (isStaffRolesMissing(error)) return { roles: [], missing: true };
    throw new Error(error.message);
  }
  return { roles: (data || []).map((r) => ({ ...r, permissions: { ...DEFAULT_PERMISSIONS, ...(r.permissions || {}) } })), missing: false };
}

/** O cargo de cada pessoa da equipa: { [id da conta]: id do cargo }. */
export async function loadTeamRoles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, staff_role_id')
    .in('role', ['admin', 'manager']);
  if (error) {
    if (/staff_role_id/.test(error.message || '')) return {};
    throw new Error(error.message);
  }
  return Object.fromEntries((data || []).filter((p) => p.staff_role_id).map((p) => [p.id, p.staff_role_id]));
}

export async function saveStaffRole({ id, name, description = '', permissions = {}, position = 0 }) {
  const row = { name: String(name || '').trim(), description: String(description || '').trim(), permissions: cleanRolePermissions(permissions), position };
  if (row.name.length < 2) throw new Error('Dê um nome ao cargo (pelo menos 2 letras).');
  const query = id
    ? supabase.from('staff_roles').update(row).eq('id', id).select('id').single()
    : supabase.from('staff_roles').insert(row).select('id').single();
  const { data, error } = await query;
  if (error) {
    if (/duplicate key|staff_roles_name_key/.test(error.message || '')) throw new Error('Já existe um cargo com esse nome.');
    fail(error);
  }
  return data;
}

export async function deleteStaffRole(id) {
  const { error } = await supabase.from('staff_roles').delete().eq('id', id);
  if (error) fail(error);
}

/** Atribui (ou tira, com `roleId` nulo) o cargo de um gestor. */
export async function assignStaffRole(profileId, roleId) {
  const { error } = await supabase.rpc('staff_role_assign', { p_profile: profileId, p_role: roleId || null });
  if (error) fail(error);
}
