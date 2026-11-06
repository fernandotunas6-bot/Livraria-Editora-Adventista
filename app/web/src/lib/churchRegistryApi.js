/**
 * Registo da Igreja (campos, distritos, igrejas, pastores) — leitura e escrita directas na base
 * de dados, com as regras RLS de `20261106200000_registo_igreja.sql`. As operações que mexem em
 * várias tabelas de uma vez (transferir pastor, fundir, importar) são funções da base de dados,
 * numa só transacção.
 */
import { supabase } from '@/lib/supabaseClient';
import { csvSafeText } from '@/lib/orderExport';

const MIGRATION_MISSING = 'O registo da Igreja ainda não está na base de dados (migração 20261106200000_registo_igreja por aplicar).';

/** Mensagem legível para os erros mais comuns do Postgres. */
export function registryError(error) {
  const msg = error?.message || String(error || '');
  const code = error?.code || '';
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(msg)) return MIGRATION_MISSING;
  if (code === 'PGRST202' || /could not find the function/i.test(msg)) return MIGRATION_MISSING;
  if (code === '23505' || /duplicate key/i.test(msg)) {
    if (/church_districts_key/.test(msg)) return 'Já existe um distrito com esse nome nesse campo e província.';
    if (/churches_cn_key/.test(msg)) return 'Já existe uma igreja com esse número neste campo.';
    if (/church_fields_name_key/.test(msg)) return 'Já existe um campo com esse nome.';
    if (/pastor_assignments_um_titular/.test(msg)) return 'Esse distrito já tem pastor titular. Use "Transferir".';
    if (/pastors_profile_id_key/.test(msg)) return 'Essa conta já está ligada a outro pastor.';
    return 'Já existe um registo igual.';
  }
  if (code === '23503' || /foreign key/i.test(msg)) return 'Não se pode apagar: tem igrejas, pastores ou campos ligados. Desactive em vez de apagar.';
  if (code === '42501' || /row-level security|Sem permissão/i.test(msg)) return 'Sem permissão para esta operação (Registo da Igreja).';
  if (code === '23514' || /check constraint/i.test(msg)) {
    if (/phone/.test(msg)) return 'Telefone inválido: só algarismos (ex.: 923456789).';
    if (/email/.test(msg)) return 'Email inválido.';
    return msg.includes('município') ? msg : 'Algum campo tem um valor inválido.';
  }
  return msg || 'Operação falhou.';
}

async function all(table, select = '*', order = 'name') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).order(order).range(from, from + 999);
    if (error) throw new Error(registryError(error));
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Tudo de uma vez: são centenas de linhas, e as ligações fazem-se no browser. */
export async function loadRegistry() {
  const [fields, districts, churches, pastors, assignments, provinces, municipalities] = await Promise.all([
    all('church_fields'),
    all('church_districts'),
    all('churches'),
    all('pastors'),
    all('pastor_assignments', '*', 'start_date'),
    all('angola_provinces', 'id, name, sort_order', 'sort_order'),
    all('angola_municipalities', 'id, name, province, sort_order', 'name'),
  ]);
  return { fields, districts, churches, pastors, assignments, provinces, municipalities };
}

const TABLES = { field: 'church_fields', district: 'church_districts', church: 'churches', pastor: 'pastors' };

/** Grava um registo (cria sem `id`, actualiza com `id`). Campos vazios de ligação ficam null. */
export async function saveRecord(kind, record) {
  const table = TABLES[kind];
  if (!table) throw new Error('Tipo de registo desconhecido.');
  const { id, created, updated, ...rest } = record;
  const body = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, /_id$/.test(k) && v === '' ? null : v]));
  const query = id
    ? supabase.from(table).update(body).eq('id', id).select().maybeSingle()
    : supabase.from(table).insert(body).select().single();
  const { data, error } = await query;
  if (error) throw new Error(registryError(error));
  if (!data) throw new Error('Registo não encontrado ou sem permissão.');
  return data;
}

export async function deleteRecord(kind, id) {
  const { error } = await supabase.from(TABLES[kind]).delete().eq('id', id);
  if (error) throw new Error(registryError(error));
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(registryError(error));
  return data;
}

export const assignPastor = ({ districtId, pastorId, kind = 'titular', start, notes = '' }) =>
  rpc('church_assign_pastor', { p_district: districtId, p_pastor: pastorId || null, p_kind: kind, p_start: start || null, p_notes: notes });
export const endAssignment = (assignmentId, end) => rpc('church_end_assignment', { p_assignment: assignmentId, p_end: end || null });
export const mergeDistricts = (keepId, removeId) => rpc('church_merge_districts', { p_keep: keepId, p_remove: removeId });
export const mergePastors = (keepId, removeId) => rpc('church_merge_pastors', { p_keep: keepId, p_remove: removeId });
export const importRegistry = (plan) => rpc('church_registry_import', { p_plan: plan });

/** Descarrega uma tabela em CSV (abre no Excel), com as células protegidas contra fórmulas. */
export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = csvSafeText(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Índices para as tabelas do painel: nomes por id, atribuições em curso, contagens.
 * Código puro (testado em churchRegistryApi.test.js).
 */
export function indexRegistry(reg) {
  const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]));
  const fields = byId(reg.fields);
  const districts = byId(reg.districts);
  const pastors = byId(reg.pastors);
  const provinces = byId(reg.provinces);
  const municipalities = byId(reg.municipalities);
  const current = (reg.assignments || []).filter((a) => !a.end_date);
  const titularOf = new Map();
  const associatesOf = new Map();
  const districtsOfPastor = new Map();
  for (const a of current) {
    if (a.kind === 'titular') titularOf.set(a.district_id, a);
    else associatesOf.set(a.district_id, [...(associatesOf.get(a.district_id) || []), a]);
    districtsOfPastor.set(a.pastor_id, [...(districtsOfPastor.get(a.pastor_id) || []), a]);
  }
  const churchesOf = new Map();
  for (const c of reg.churches || []) {
    if (c.district_id) churchesOf.set(c.district_id, (churchesOf.get(c.district_id) || 0) + 1);
  }
  const historyOf = (pastorId) => (reg.assignments || []).filter((a) => a.pastor_id === pastorId)
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  return {
    fields, districts, pastors, provinces, municipalities, titularOf, associatesOf, districtsOfPastor, churchesOf, historyOf,
    fieldName: (id) => fields.get(id)?.name || '',
    districtName: (id) => districts.get(id)?.name || '',
    provinceName: (id) => provinces.get(id)?.name || '',
    municipalityName: (id) => municipalities.get(id)?.name || '',
    pastorLabel: (id) => { const p = pastors.get(id); return p ? `${p.title ? p.title + ' ' : ''}${p.name}` : ''; },
  };
}

/** Pesquisa simples: todas as palavras têm de aparecer (sem acentos). */
export function matchesQuery(text, query) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hay = norm(text);
  return norm(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
