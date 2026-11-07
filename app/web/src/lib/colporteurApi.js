/**
 * Colportores — candidatura pública (Edge Function), painel (base de dados com RLS e funções
 * de 20261107101000_colportores.sql) e a área do próprio colportor.
 */
import { APP_API_URL, supabase } from '@/lib/supabaseClient';
import { registryError } from '@/lib/churchRegistryApi';

const MIGRATION = 'A colportagem ainda não está na base de dados (migração 20261107101000_colportores por aplicar).';
const EDGE = 'O servidor ainda não tem a candidatura de colportores (Edge Function por publicar).';

export function colporteurError(error) {
  const msg = error?.message || String(error || '');
  if (/colporteur|church_directory/.test(msg) && (error?.code === 'PGRST202' || error?.code === 'PGRST205' || /could not find/i.test(msg))) return MIGRATION;
  if (/colporteurs_telefone_em_aberto/.test(msg)) return 'Já existe uma ficha em aberto com esse telefone.';
  if (/colporteur_rules_uma_aberta|colporteur_overrides_uma_aberta/.test(msg)) return 'Já existe uma regra igual em vigor.';
  return registryError(error);
}

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(colporteurError(error));
  return data;
}

async function all(table, order = 'created', ascending = false) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).range(from, from + 999);
    if (error) throw new Error(colporteurError(error));
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// --- Candidatura (público) -------------------------------------------------------------------

/** Igrejas, pastores por distrito, províncias e municípios para o formulário. */
export async function loadApplicationDirectory() {
  const [dir, provinces, municipalities] = await Promise.all([
    rpc('church_directory'),
    supabase.from('angola_provinces').select('id, name, sort_order').order('sort_order'),
    supabase.from('angola_municipalities').select('id, name, province').order('name').range(0, 999),
  ]);
  return {
    churches: dir?.churches || [],
    pastors: dir?.pastors || [],
    open: dir?.open !== false,
    note: dir?.note || '',
    provinces: provinces.data || [],
    municipalities: municipalities.data || [],
  };
}

export async function submitApplication(form) {
  let res;
  try {
    res = await fetch(`${APP_API_URL}/colportores/candidatura`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
  } catch {
    throw new Error('Sem ligação. Verifique a internet e tente outra vez.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && /rota não encontrada/i.test(data.message || '')) throw new Error(EDGE);
  if (!res.ok) throw new Error(data.message || 'Não foi possível enviar a candidatura.');
  return data;
}

// --- Painel ------------------------------------------------------------------------------------

export async function loadColporteurAdmin() {
  const [colporteurs, events, rules, overrides, settingsRes] = await Promise.all([
    all('colporteurs'),
    all('colporteur_events'),
    all('colporteur_commission_rules', 'valid_from'),
    all('colporteur_commission_overrides', 'valid_from'),
    supabase.from('colporteur_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  if (settingsRes.error) throw new Error(colporteurError(settingsRes.error));
  return { colporteurs, events, rules, overrides, settings: settingsRes.data || { base_pct: 0 } };
}

/** Campos que a equipa edita directamente na ficha (o resto vai pelas funções). */
const EDITABLE = ['full_name', 'phone', 'email', 'church_id', 'church_other', 'province_id', 'municipality_id', 'territory',
  'requested_category', 'weekly_hours', 'is_student', 'school', 'recommended_by_pastor_id', 'recommended_by_name',
  'recommendation_ok', 'credit_limit', 'notes'];

export async function saveColporteur(row) {
  const body = Object.fromEntries(EDITABLE.filter((k) => k in row).map((k) => {
    const v = row[k];
    if (/_id$/.test(k) && v === '') return [k, null];
    if ((k === 'weekly_hours' || k === 'credit_limit') && (v === '' || v == null)) return [k, null];
    return [k, v];
  }));
  if (body.phone != null) body.phone = String(body.phone).replace(/\D/g, '').replace(/^244(?=9\d{8}$)/, '');
  const { error } = await supabase.from('colporteurs').update(body).eq('id', row.id);
  if (error) throw new Error(colporteurError(error));
}

export async function deleteCandidate(id) {
  const { data, error } = await supabase.from('colporteurs').delete().eq('id', id).select('id');
  if (error) throw new Error(colporteurError(error));
  if (!data?.length) throw new Error('Só se apagam candidaturas que nunca foram aprovadas.');
}

export const setColporteurStatus = (id, status, reason = '', start = null) =>
  rpc('colporteur_set_status', { p_id: id, p_status: status, p_reason: reason, p_start: start });
export const setColporteurCategory = (id, category, reason = '') =>
  rpc('colporteur_set_category', { p_id: id, p_category: category, p_reason: reason });
export const createInvite = (id) => rpc('colporteur_create_invite', { p_id: id });
export const unlinkAccount = (id, reason = '') => rpc('colporteur_unlink_account', { p_id: id, p_reason: reason });
export const setRule = ({ category = null, productType = null, saleMode = null, pct, from, notes = '' }) =>
  rpc('colporteur_set_rule', { p_category: category || null, p_product_type: productType || null, p_sale_mode: saleMode || null, p_pct: pct === '' || pct == null ? null : Number(pct), p_from: from || null, p_notes: notes });
export const setOverride = ({ colporteurId, productType = null, saleMode = null, pct, from, reason = '' }) =>
  rpc('colporteur_set_override', { p_colporteur: colporteurId, p_product_type: productType || null, p_sale_mode: saleMode || null, p_pct: pct === '' || pct == null ? null : Number(pct), p_from: from || null, p_reason: reason });
export const pctPreview = ({ colporteurId, productType, saleMode, date }) =>
  rpc('colporteur_pct_preview', { p_colporteur: colporteurId, p_product_type: productType || null, p_sale_mode: saleMode || null, p_on: date || null });

export async function saveColporteurSettings(settings) {
  const { id, updated, updated_by, ...body } = settings;
  const { error } = await supabase.from('colporteur_settings').update(body).eq('id', 1);
  if (error) throw new Error(colporteurError(error));
}

/** Link do convite e mensagem pronta para WhatsApp. */
export function inviteLink(token, origin = window.location.origin) {
  return `${origin}/colportor?convite=${encodeURIComponent(token)}`;
}
export function inviteWhatsApp(colporteur, token, origin) {
  const link = inviteLink(token, origin);
  const text = `Olá ${colporteur.full_name.split(' ')[0]}! A sua candidatura a colportor foi aprovada. O seu código é ${colporteur.code}. Para ver a sua área de colportor, abra este link e entre com a sua conta: ${link}`;
  return `https://wa.me/244${colporteur.phone}?text=${encodeURIComponent(text)}`;
}

/** Link de candidatura (com a igreja já escolhida, para os pastores partilharem). */
export function applicationLink(churchCn, origin = window.location.origin) {
  return `${origin}/colportor/candidatura${churchCn ? `?igreja=${encodeURIComponent(churchCn)}` : ''}`;
}

// --- O próprio colportor ------------------------------------------------------------------------

export const colporteurMe = () => rpc('colporteur_me');
export const claimInvite = (token) => rpc('colporteur_claim_invite', { p_token: token });

// --- Operações: guias, relatórios, conta corrente -------------------------------------------------

/** Produtos para as guias e os relatórios (preço de capa, stock, tipo). */
export async function loadBooksForColportage() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('stock_books')
      .select('id, title, book_code, price, stock, product_type, versions').order('title').range(from, from + 999);
    if (error) throw new Error(colporteurError(error));
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out.map((b) => ({ ...b, hasVariants: Array.isArray(b.versions) && b.versions.length > 0 }));
}

export async function loadOperations() {
  const [documents, reports, ledger, overview] = await Promise.all([
    all('colporteur_documents'),
    all('colporteur_reports', 'week_start'),
    all('colporteur_ledger', 'id', true),
    rpc('colporteur_overview', { p_colporteur: null }),
  ]);
  return { documents, reports, ledger, overview: overview || [] };
}

export const issueDocument = ({ colporteurId, kind, lines, notes = '' }) =>
  rpc('colporteur_issue_document', { p_colporteur: colporteurId, p_kind: kind, p_lines: lines, p_notes: notes });
export const saveReport = (report, submit = false, colporteurId = null) =>
  rpc('colporteur_report_save', { p_report: report, p_submit: submit, p_colporteur: colporteurId });
export const validateReport = (id) => rpc('colporteur_report_validate', { p_id: id });
export const returnReport = (id, reason) => rpc('colporteur_report_return', { p_id: id, p_reason: reason });
export const recordPayment = ({ colporteurId, direction, amount, method = '', reference = '', date = null, notes = '' }) =>
  rpc('colporteur_record_payment', { p_colporteur: colporteurId, p_direction: direction, p_amount: Number(amount), p_method: method, p_reference: reference, p_date: date, p_notes: notes });
export const ledgerAdjust = ({ colporteurId, amount, description }) =>
  rpc('colporteur_ledger_adjust', { p_colporteur: colporteurId, p_amount: Number(amount), p_description: description });

/** A área do colportor: resumo, relatórios, conta e guias (o RLS só dá os seus). */
export async function loadMyOperations() {
  const [overview, reports, ledger, documents] = await Promise.all([
    rpc('colporteur_overview', { p_colporteur: null }),
    all('colporteur_reports', 'week_start'),
    all('colporteur_ledger', 'id', true),
    all('colporteur_documents'),
  ]);
  return { overview: overview?.[0] || null, reports, ledger, documents };
}

/**
 * Liga ao colportor uma encomenda do site em que o cliente se esqueceu do código. Precisa da
 * permissão "Encomendas" (RLS); a base de dados confirma o código e recusa se a comissão já entrou.
 */
export async function assignOrderToColporteur(orderNumber, code) {
  const number = String(orderNumber || '').trim().toUpperCase();
  if (!number) throw new Error('Indique o número da encomenda.');
  const { data, error } = await supabase.from('orders').update({ colporteur_code: code }).eq('order_number', number).select('id, colporteur_id');
  if (error) throw new Error(colporteurError(error));
  if (!data?.length) throw new Error('Encomenda não encontrada, ou sem a permissão "Encomendas".');
  if (!data[0].colporteur_id) throw new Error('A base de dados não aceitou o código (colportor inactivo, ou é a conta do próprio colportor).');
  return data[0];
}
