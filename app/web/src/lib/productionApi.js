// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Produção da Editora, fornecedores, funcionários e saídas de dinheiro — leitura e escrita directas
 * na base de dados, com as regras RLS das migrações funcionarios, producao e saidas. Concluir e
 * cancelar uma ordem, mudar a ordem das etapas, gerar os salários do mês e o relatório de entradas e
 * saídas são funções da base de dados (uma transacção, com a permissão conferida lá dentro).
 */
import { supabase } from '@/lib/supabaseClient';
import { friendlyDbError } from '@/lib/production';

const MIGRATION_MISSING = 'A produção, os funcionários e as finanças ainda não estão na base de dados (migrações 20261108190000 a 20261108192000 por aplicar).';

function fail(error) {
  const msg = error?.message || String(error || '');
  const code = error?.code || '';
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /could not find the (table|function)/i.test(msg)) {
    throw new Error(MIGRATION_MISSING);
  }
  throw new Error(friendlyDbError(error));
}
const must = ({ data, error }) => {
  if (error) fail(error);
  return data;
};

async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await query().range(from, from + 999));
    out.push(...(rows || []));
    if (!rows || rows.length < 1000) return out;
  }
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k] === '' ? null : obj[k]]));
const text = (v) => (v == null ? '' : String(v));

// ---------------------------------------------------------------------------------------------
// Produção
// ---------------------------------------------------------------------------------------------

/** Tudo o que os ecrãs da produção mostram. Os pagamentos só vêm para quem os pode ler. */
export async function loadProduction() {
  const [orders, stages, costs, suppliers, payments, staff, books] = await Promise.all([
    all(() => supabase.from('production_orders').select('*').order('created', { ascending: false })),
    all(() => supabase.from('production_stages').select('*').order('order_id').order('position')),
    all(() => supabase.from('production_costs').select('*').order('incurred_on', { ascending: false })),
    all(() => supabase.from('suppliers').select('*').order('name')),
    all(() => supabase.from('supplier_payments').select('*').order('paid_on', { ascending: false }).order('created', { ascending: false })),
    all(() => supabase.from('staff_members').select('id, code, full_name, job_title, department, status, profile_id').order('full_name')),
    all(() => supabase.from('stock_books').select('id, title, book_code, stock, product_type').order('title')),
  ]);
  return { orders, stages, costs, suppliers, payments, staff, books };
}

/**
 * O que o Início precisa para o "Precisa de atenção" da Editora e das finanças
 * (lib/editoraAttention.js): só as ordens abertas, as etapas delas e as colunas usadas. As finanças
 * lêem também o que se deve aos fornecedores e os salários por pagar (o RLS só lhes deixa ler a elas).
 */
export async function loadEditoraAttention({ finance = false } = {}) {
  const orders = await all(() => supabase.from('production_orders')
    .select('id, code, title, status, due_date').in('status', ['planeada', 'em_curso']).order('created'));
  const ids = orders.map((o) => o.id);
  const [stages, staff, suppliers, costs, payments, payroll] = await Promise.all([
    ids.length ? all(() => supabase.from('production_stages')
      .select('id, order_id, name, status, due_date, responsible_id, position').in('order_id', ids).order('position')) : [],
    all(() => supabase.from('staff_members').select('id, full_name').order('full_name')),
    finance ? all(() => supabase.from('suppliers').select('id, name').order('name')) : [],
    finance ? all(() => supabase.from('production_costs').select('id, supplier_id, amount').not('supplier_id', 'is', null).order('id')) : [],
    finance ? all(() => supabase.from('supplier_payments').select('id, supplier_id, amount, status').order('id')) : [],
    finance ? all(() => supabase.from('staff_payroll').select('id, period, net, status').eq('status', 'por_pagar').order('period')) : [],
  ]);
  return { orders, stages, staff, suppliers, costs, payments, payroll };
}

const SUPPLIER_FIELDS = ['name', 'kind', 'nif', 'contact_name', 'phone', 'email', 'address', 'iban', 'notes', 'active'];
export async function saveSupplier(data) {
  const row = pick(data, SUPPLIER_FIELDS);
  for (const k of ['nif', 'contact_name', 'phone', 'email', 'address', 'iban', 'notes']) row[k] = text(data[k]).trim();
  if (data.id) return must(await supabase.from('suppliers').update(row).eq('id', data.id).select().single());
  return must(await supabase.from('suppliers').insert(row).select().single());
}
export async function deleteSupplier(id) {
  must(await supabase.from('suppliers').delete().eq('id', id));
}

const ORDER_FIELDS = ['title', 'book_id', 'kind', 'quantity', 'supplier_id', 'start_date', 'due_date', 'notes'];
export async function saveOrder(data) {
  const row = pick(data, ORDER_FIELDS);
  row.notes = text(data.notes);
  if (row.quantity != null) row.quantity = Number(row.quantity);
  if (data.id) return must(await supabase.from('production_orders').update(row).eq('id', data.id).select().single());
  return must(await supabase.from('production_orders').insert(row).select().single());
}
export async function deleteOrder(id) {
  must(await supabase.from('production_orders').delete().eq('id', id));
}
export async function completeOrder(id, received) {
  return must(await supabase.rpc('production_complete', { p_order_id: id, p_received: received == null || received === '' ? null : Number(received) }));
}
export async function cancelOrder(id, reason) {
  must(await supabase.rpc('production_cancel', { p_order_id: id, p_reason: reason }));
}

const STAGE_FIELDS = ['name', 'responsible_id', 'due_date', 'status', 'notes'];
export async function saveStage(stage) {
  const row = pick(stage, STAGE_FIELDS);
  if ('notes' in stage) row.notes = text(stage.notes);
  return must(await supabase.from('production_stages').update(row).eq('id', stage.id).select().single());
}
export async function addStage(orderId, name, stages = []) {
  const position = Math.max(0, ...stages.filter((s) => s.order_id === orderId).map((s) => s.position || 0)) + 1;
  return must(await supabase.from('production_stages').insert({ order_id: orderId, name, position }).select().single());
}
export async function deleteStage(id) {
  must(await supabase.from('production_stages').delete().eq('id', id));
}
export async function moveStage(id, delta) {
  must(await supabase.rpc('production_stage_move', { p_stage_id: id, p_delta: delta }));
}

export async function addCost(cost) {
  const row = pick(cost, ['order_id', 'supplier_id', 'description', 'amount', 'incurred_on']);
  row.amount = Number(cost.amount);
  // Sem data: a da base de dados (hoje em Luanda). Um null explícito numa coluna obrigatória falhava.
  if (!row.incurred_on) delete row.incurred_on;
  return must(await supabase.from('production_costs').insert(row).select().single());
}
export async function deleteCost(id) {
  must(await supabase.from('production_costs').delete().eq('id', id));
}

export async function recordSupplierPayment(payment) {
  const row = pick(payment, ['supplier_id', 'order_id', 'amount', 'paid_on', 'method', 'reference', 'notes']);
  row.amount = Number(payment.amount);
  row.reference = text(payment.reference).trim();
  row.notes = text(payment.notes).trim();
  if (!row.paid_on) delete row.paid_on;
  if (!row.method) delete row.method;
  return must(await supabase.from('supplier_payments').insert(row).select().single());
}
export async function voidSupplierPayment(id, reason) {
  must(await supabase.from('supplier_payments').update({ status: 'anulado', void_reason: reason }).eq('id', id));
}

// ---------------------------------------------------------------------------------------------
// Funcionários e salários
// ---------------------------------------------------------------------------------------------

/**
 * As fichas, as lojas, as contas da equipa (para ligar uma ficha a quem usa o painel) e, para as
 * finanças, os dados de pagamento de cada um.
 */
export async function loadStaff({ finance = false } = {}) {
  const [staff, stores, accounts, pay] = await Promise.all([
    all(() => supabase.from('staff_members').select('*').order('full_name')),
    all(() => supabase.from('physical_stores').select('id, name').order('sort_order').order('name')),
    all(() => supabase.from('profiles').select('id, name, email, role, staff_code').in('role', ['admin', 'manager']).order('name')),
    finance ? all(() => supabase.from('staff_pay_profiles').select('*')) : Promise.resolve([]),
  ]);
  return { staff, stores, accounts, pay };
}

const STAFF_FIELDS = ['full_name', 'job_title', 'department', 'store_id', 'phone', 'email', 'hired_on', 'left_on', 'status', 'notes', 'profile_id'];
export async function saveStaff(data) {
  const row = pick(data, STAFF_FIELDS);
  for (const k of ['job_title', 'phone', 'email', 'notes']) row[k] = text(data[k]).trim();
  if (data.id) return must(await supabase.from('staff_members').update(row).eq('id', data.id).select().single());
  return must(await supabase.from('staff_members').insert(row).select().single());
}
export async function deleteStaff(id) {
  must(await supabase.from('staff_members').delete().eq('id', id));
}

export async function savePayProfile(data) {
  const row = {
    staff_id: data.staff_id,
    base_salary: Number(data.base_salary) || 0,
    allowances: Number(data.allowances) || 0,
    iban: text(data.iban).trim(),
    nif: text(data.nif).trim(),
    notes: text(data.notes).trim(),
  };
  return must(await supabase.from('staff_pay_profiles').upsert(row, { onConflict: 'staff_id' }).select().single());
}

export async function loadPayroll(period) {
  return all(() => supabase.from('staff_payroll').select('*').eq('period', period).order('created'));
}
export async function generatePayroll(period) {
  return must(await supabase.rpc('payroll_generate', { p_period: period }));
}
export async function updatePayrollLine(id, patch) {
  const row = pick(patch, ['base_salary', 'allowances', 'deductions', 'notes']);
  for (const k of ['base_salary', 'allowances', 'deductions']) if (k in row) row[k] = Number(row[k]) || 0;
  return must(await supabase.from('staff_payroll').update(row).eq('id', id).select().single());
}
export async function payPayrollLine(id, { paid_on, method, reference }) {
  return must(await supabase.from('staff_payroll')
    .update({ status: 'pago', paid_on: paid_on || null, method, reference: text(reference).trim() })
    .eq('id', id).select().single());
}
export async function voidPayrollLine(id, reason) {
  must(await supabase.from('staff_payroll').update({ status: 'anulado', void_reason: reason }).eq('id', id));
}
export async function deletePayrollLine(id) {
  must(await supabase.from('staff_payroll').delete().eq('id', id));
}

/** Entradas e saídas de um período (AAAA-MM-DD, dias de Luanda). */
export async function cashFlowReport(from, to) {
  return must(await supabase.rpc('cash_flow_report', { p_from: from, p_to: to }));
}
