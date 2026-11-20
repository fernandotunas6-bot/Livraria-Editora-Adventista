// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Produção da Editora, funcionários e saídas de dinheiro: os rótulos e as contas que os ecrãs
// mostram. Funções puras (os dados entram, o resultado sai), testadas em production.test.js. Os
// valores (estados, tipos, formas de pagamento) são os das migrações funcionarios, producao e saidas.

export const ORDER_KINDS = {
  reimpressao: 'Reimpressão',
  novo_titulo: 'Título novo',
  nova_edicao: 'Nova edição',
  outro: 'Outro',
};

export const ORDER_STATUS = {
  planeada: { label: 'Planeada', tone: 'muted' },
  em_curso: { label: 'Em curso', tone: 'blue' },
  concluida: { label: 'Concluída', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'red' },
};

export const STAGE_STATUS = {
  por_fazer: { label: 'Por fazer', tone: 'muted' },
  em_curso: { label: 'Em curso', tone: 'blue' },
  concluida: { label: 'Feita', tone: 'green' },
  nao_aplica: { label: 'Não se aplica', tone: 'muted' },
};

export const SUPPLIER_KINDS = {
  grafica: 'Gráfica',
  papel: 'Papel',
  design: 'Design',
  revisao: 'Revisão',
  traducao: 'Tradução',
  transporte: 'Transporte',
  outro: 'Outro',
};

export const PAY_METHODS = {
  transferencia: 'Transferência',
  numerario: 'Numerário',
  multicaixa: 'Multicaixa',
  cheque: 'Cheque',
  outro: 'Outro',
};

export const DEPARTMENTS = {
  loja: 'Loja',
  producao: 'Produção',
  entregas: 'Entregas',
  administracao: 'Administração',
  colportagem: 'Colportagem',
  outro: 'Outro',
};

export const STAFF_STATUS = {
  activo: { label: 'Activo', tone: 'green' },
  ferias: { label: 'De férias', tone: 'blue' },
  baixa: { label: 'De baixa', tone: 'amber' },
  saiu: { label: 'Saiu', tone: 'muted' },
};

export const PAYROLL_STATUS = {
  por_pagar: { label: 'Por pagar', tone: 'amber' },
  pago: { label: 'Pago', tone: 'green' },
  anulado: { label: 'Anulado', tone: 'muted' },
};

const DONE = new Set(['concluida', 'nao_aplica']);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const byPosition = (a, b) => (a.position || 0) - (b.position || 0);

/** Hoje em Luanda (UTC+1), AAAA-MM-DD — os prazos e os meses contam pelo dia de Luanda. */
export function todayLuanda(now = Date.now()) {
  return new Date(now + 3600_000).toISOString().slice(0, 10);
}

/** Atrasada: tem prazo, o prazo passou e ainda não está feita. */
export function stageOverdue(stage, today = todayLuanda()) {
  return !!stage?.due_date && String(stage.due_date).slice(0, 10) < today && !DONE.has(stage.status);
}

/** Ordem aberta (planeada ou em curso) com o prazo de entrega passado. */
export function orderOverdue(order, today = todayLuanda()) {
  return !!order?.due_date && String(order.due_date).slice(0, 10) < today && ['planeada', 'em_curso'].includes(order.status);
}

/**
 * Onde vai uma ordem: etapas feitas (concluídas ou "não se aplica") e o total, a percentagem, a
 * etapa em que está (a primeira por fazer) e quantas estão atrasadas.
 */
export function orderProgress(stages = [], today = todayLuanda()) {
  const list = [...stages].sort(byPosition);
  const done = list.filter((s) => DONE.has(s.status)).length;
  return {
    total: list.length,
    done,
    pct: list.length ? Math.round((done * 100) / list.length) : 0,
    current: list.find((s) => !DONE.has(s.status)) || null,
    overdue: list.filter((s) => stageOverdue(s, today)).length,
    ready: list.length > 0 && done === list.length,
  };
}

/** Os custos de uma ordem: o total e o custo por exemplar (pelo que entrou, se já concluída). */
export function orderCost(order, costs = []) {
  const total = round2(costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0));
  const units = Number(order?.received_quantity ?? order?.quantity) || 0;
  return { total, units, perUnit: units > 0 ? round2(total / units) : 0 };
}

/**
 * O que se deve a cada fornecedor: o que custou (custos das ordens) menos o que se pagou (os
 * pagamentos anulados não contam). Os que mais se deve primeiro; sem movimento nenhum ficam de fora.
 */
export function supplierBalances(suppliers = [], costs = [], payments = []) {
  const totals = new Map();
  const add = (id, key, value) => {
    if (!id) return;
    const row = totals.get(id) || { costs: 0, paid: 0 };
    row[key] += Number(value) || 0;
    totals.set(id, row);
  };
  for (const c of costs) add(c.supplier_id, 'costs', c.amount);
  for (const p of payments) if (p.status !== 'anulado') add(p.supplier_id, 'paid', p.amount);
  return suppliers
    .filter((s) => totals.has(s.id))
    .map((s) => {
      const t = totals.get(s.id);
      return { supplier: s, costs: round2(t.costs), paid: round2(t.paid), balance: round2(t.costs - t.paid) };
    })
    .sort((a, b) => b.balance - a.balance || a.supplier.name.localeCompare(b.supplier.name, 'pt'));
}

/**
 * As etapas por fazer das ordens abertas, para "Etapas e prazos": cada uma com a ordem, o
 * responsável e se está atrasada. Atrasadas primeiro, depois as com prazo (o mais próximo
 * primeiro), depois as sem prazo; dentro da mesma ordem, pela posição.
 */
export function pendingStages({ orders = [], stages = [], staff = [], today = todayLuanda() } = {}) {
  const open = new Map(orders.filter((o) => ['planeada', 'em_curso'].includes(o.status)).map((o) => [o.id, o]));
  const people = new Map(staff.map((s) => [s.id, s]));
  return stages
    .filter((s) => open.has(s.order_id) && !DONE.has(s.status))
    .map((s) => ({ stage: s, order: open.get(s.order_id), responsible: people.get(s.responsible_id) || null, overdue: stageOverdue(s, today) }))
    .sort((a, b) => (Number(b.overdue) - Number(a.overdue))
      || (a.stage.due_date ? 0 : 1) - (b.stage.due_date ? 0 : 1)
      || String(a.stage.due_date || '').localeCompare(String(b.stage.due_date || ''))
      || String(a.order.code).localeCompare(String(b.order.code))
      || byPosition(a.stage, b.stage));
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** O primeiro dia do mês de uma data (AAAA-MM-01). */
export function monthStart(date = todayLuanda()) {
  return `${String(date).slice(0, 7)}-01`;
}

/** Outro mês: `shiftMonth('2026-11-01', -1)` → '2026-10-01'. */
export function shiftMonth(month, delta) {
  const [y, m] = String(month).slice(0, 7).split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** "Novembro de 2026". */
export function monthLabel(month) {
  const [y, m] = String(month).slice(0, 7).split('-').map(Number);
  const name = MONTHS[(m || 1) - 1] || '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

/** Os totais de um mês de salários (as linhas anuladas não contam). */
export function payrollTotals(lines = []) {
  const live = lines.filter((l) => l.status !== 'anulado');
  const sum = (list, key) => round2(list.reduce((t, l) => t + (Number(l[key]) || 0), 0));
  const paid = live.filter((l) => l.status === 'pago');
  const due = live.filter((l) => l.status === 'por_pagar');
  return {
    count: live.length,
    base: sum(live, 'base_salary'),
    allowances: sum(live, 'allowances'),
    deductions: sum(live, 'deductions'),
    net: sum(live, 'net'),
    paid: sum(paid, 'net'),
    paidCount: paid.length,
    due: sum(due, 'net'),
    dueCount: due.length,
  };
}

/** O líquido de uma linha de salário (a base de dados calcula o mesmo, na coluna `net`). */
export function payrollNet({ base_salary = 0, allowances = 0, deductions = 0 } = {}) {
  return round2((Number(base_salary) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0));
}

/** Uma mensagem de erro da base de dados em palavras do painel. */
export function friendlyDbError(err) {
  const msg = String(err?.message || err || '');
  if (/foreign key/i.test(msg) && /supplier/i.test(msg)) return 'Este fornecedor tem ordens, custos ou pagamentos: desactive-o em vez de o apagar.';
  if (/foreign key/i.test(msg) && /staff/i.test(msg)) return 'Esta pessoa tem salários registados: marque-a como "saiu" em vez de apagar a ficha.';
  if (/foreign key/i.test(msg) && /stock_books|book_id/i.test(msg)) return 'Este produto tem ordens de produção: não se pode apagar.';
  if (/phone_check/i.test(msg)) return 'O telefone não é um número angolano válido (9 algarismos, a começar por 9).';
  if (/email_check/i.test(msg)) return 'O email não parece válido.';
  if (/staff_payroll_liquido/i.test(msg)) return 'Os descontos não podem ser maiores do que o salário.';
  if (/staff_payroll_um_por_mes/i.test(msg)) return 'Esta pessoa já tem o salário deste mês (anule a linha antes de fazer outra).';
  if (/row-level security|42501|permission denied/i.test(msg)) return 'Sem permissão para isto.';
  return msg || 'Não foi possível.';
}
