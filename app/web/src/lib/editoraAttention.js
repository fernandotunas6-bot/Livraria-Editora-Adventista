// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// "Precisa de atenção" da Editora e das finanças: o que o Início deve pôr à frente de quem gere a
// produção ou paga (lib/adminAttention.js faz o mesmo para as encomendas e o catálogo), e o
// número ao lado da Produção e dos Funcionários na navegação.
//
// Situações que pioram se ninguém fizer nada, com os mesmos critérios dos ecrãs da produção
// (lib/production.js): etapas com o prazo passado, ordens com as etapas todas feitas à espera de
// concluir (a tiragem só entra no stock ao concluir), salários de meses já fechados por pagar e o
// que se deve aos fornecedores. Cada uma leva à vista onde se resolve.
//
// Função pura (os dados entram, a lista sai), para se poder testar com datas fixas.

import { monthLabel, monthStart, orderOverdue, orderProgress, stageOverdue, supplierBalances, todayLuanda } from '@/lib/production';
import { kwanza } from '@/lib/money';

export const EDITORA_RULES = Object.freeze({
  stageCriticalDays: 7,   // uma etapa atrasada há mais de uma semana passa a urgente
  payrollFromDay: 25,     // os salários do mês corrente lembram-se a partir deste dia
});

const OPEN = ['planeada', 'em_curso'];
const DAY = 24 * 3600 * 1000;
const plural = (n, one, many) => (n === 1 ? one : many);
const daysLate = (due, today) => Math.max(0, Math.round((Date.parse(today) - Date.parse(String(due).slice(0, 10))) / DAY));
const shortDate = (day) => `${String(day).slice(8, 10)}/${String(day).slice(5, 7)}`;
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/**
 * @param {object} data
 * @param {object} data.perms   adminPermissions(): production, finance
 * @param {Array}  data.orders  ordens de produção (id, code, title, status, due_date)
 * @param {Array}  data.stages  etapas dessas ordens (order_id, name, status, due_date, responsible_id, position)
 * @param {Array}  data.staff   fichas (id, full_name), para dizer quem é o responsável
 * @param {Array}  data.suppliers, data.costs, data.payments  para o que se deve a cada fornecedor
 * @param {Array}  data.payroll linhas de salário por pagar (period, net) — só as finanças as lêem
 * @returns {{ items: { id, severity, title, detail, action: { section, view } }[], badges: object }}
 */
export function editoraAttention({
  perms = {}, orders = [], stages = [], staff = [], suppliers = [], costs = [], payments = [], payroll = [],
  today = todayLuanda(), rules = EDITORA_RULES,
} = {}) {
  const items = [];
  const badges = {};
  const seesProduction = !!(perms.production || perms.finance);

  if (seesProduction) {
    const open = orders.filter((o) => OPEN.includes(o.status));
    const openById = new Map(open.map((o) => [o.id, o]));
    const people = new Map(staff.map((s) => [s.id, s]));
    const late = stages
      .filter((s) => openById.has(s.order_id) && stageOverdue(s, today))
      .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
    if (late.length) badges.producao = { count: late.length, tone: 'warning' };

    if (perms.production) {
      if (late.length) {
        const worst = late[0];
        const order = openById.get(worst.order_id);
        const days = daysLate(worst.due_date, today);
        const who = people.get(worst.responsible_id)?.full_name;
        items.push({
          id: 'producao-etapas-atrasadas',
          severity: days > rules.stageCriticalDays ? 'critical' : 'warning',
          title: `${late.length} ${plural(late.length, 'etapa da produção atrasada', 'etapas da produção atrasadas')}`,
          detail: `A mais atrasada: «${worst.name}» de ${order.code} (${order.title}), prazo ${shortDate(worst.due_date)}, há ${days} ${plural(days, 'dia', 'dias')}${who ? ` · ${who}` : ' · sem responsável'}.`,
          action: { section: 'producao', view: 'etapas' },
        });
      }

      const lateOrders = open.filter((o) => orderOverdue(o, today));
      if (lateOrders.length) {
        const first = [...lateOrders].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
        items.push({
          id: 'producao-ordens-atrasadas',
          severity: 'warning',
          title: `${lateOrders.length} ${plural(lateOrders.length, 'ordem de produção', 'ordens de produção')} com o prazo de entrega passado`,
          detail: `${first.code} (${first.title}) devia estar pronta a ${shortDate(first.due_date)}.`,
          action: { section: 'producao', view: 'ordens' },
        });
      }

      const byOrder = new Map();
      for (const s of stages) {
        if (!openById.has(s.order_id)) continue;
        if (!byOrder.has(s.order_id)) byOrder.set(s.order_id, []);
        byOrder.get(s.order_id).push(s);
      }
      const ready = open.filter((o) => orderProgress(byOrder.get(o.id) || [], today).ready);
      if (ready.length) {
        items.push({
          id: 'producao-por-concluir',
          severity: 'info',
          title: `${ready.length} ${plural(ready.length, 'ordem com as etapas todas feitas', 'ordens com as etapas todas feitas')}, por concluir`,
          detail: `A tiragem só entra no stock ao concluir: ${ready.slice(0, 2).map((o) => o.code).join(', ')}${ready.length > 2 ? '…' : '.'}`,
          action: { section: 'producao', view: 'ordens' },
        });
      }
    }
  }

  if (perms.finance) {
    const month = monthStart(today);
    const due = payroll.filter((l) => (l.status || 'por_pagar') === 'por_pagar');
    const past = due.filter((l) => String(l.period).slice(0, 10) < month);
    const current = due.filter((l) => String(l.period).slice(0, 10) === month);
    const sum = (lines) => lines.reduce((s, l) => s + (Number(l.net) || 0), 0);
    if (past.length) {
      badges.funcionarios = { count: past.length, tone: 'warning' };
      const months = [...new Set(past.map((l) => String(l.period).slice(0, 10)))].sort();
      items.push({
        id: 'salarios-atrasados',
        severity: 'warning',
        title: `${past.length} ${plural(past.length, 'salário', 'salários')} de ${months.map((m) => monthLabel(m).toLowerCase()).join(', ')} por pagar`,
        detail: `${kwanza(sum(past))} no total. Pague ou anule cada linha em Funcionários → Salários.`,
        action: { section: 'funcionarios', view: 'salarios' },
      });
    }
    if (current.length && Number(today.slice(8, 10)) >= rules.payrollFromDay) {
      items.push({
        id: 'salarios-do-mes',
        severity: 'info',
        title: `Salários de ${monthLabel(month).toLowerCase()}: ${current.length} por pagar`,
        detail: `${kwanza(sum(current))} até ao fim do mês.`,
        action: { section: 'funcionarios', view: 'salarios' },
      });
    }

    const owed = supplierBalances(suppliers, costs, payments).filter((b) => b.balance > 0);
    if (owed.length) {
      const total = owed.reduce((s, b) => s + b.balance, 0);
      items.push({
        id: 'fornecedores-por-pagar',
        severity: 'info',
        title: `${kwanza(total)} por pagar a ${owed.length} ${plural(owed.length, 'fornecedor', 'fornecedores')}`,
        detail: `${owed[0].supplier.name}: ${kwanza(owed[0].balance)}${owed.length > 1 ? ', e os outros na lista' : ''}.`,
        action: { section: 'producao', view: 'contas' },
      });
    }
  }

  return { items: items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]), badges };
}

/** Junta duas listas de atenção pela ordem de urgência (a de cada uma mantém-se dentro do mesmo nível). */
export function mergeAttention(...lists) {
  return lists.flat().map((item, i) => ({ item, i }))
    .sort((a, b) => (SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity]) || a.i - b.i)
    .map(({ item }) => item);
}
