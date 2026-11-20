// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O mês da loja em números, para o Início do painel: do dia 1 até hoje, comparado com os mesmos
// dias do mês anterior (1 a 8 de Novembro contra 1 a 8 de Outubro — comparar o mês a meio com o
// mês anterior inteiro dizia sempre "a descer").
//
// "Encomendado" é o valor das encomendas feitas (sem as canceladas); "Recebido" é o dinheiro que
// já entrou dessas encomendas (pagamentos registados, menos reembolsos). O cartão antigo chamava
// "Vendas" ao encomendado, com as encomendas por pagar lá dentro.

const DAY = 24 * 3600 * 1000;

function bounds(now) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Os mesmos dias no mês anterior; num mês mais curto, até ao fim dele.
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const span = now.getTime() - start.getTime();
  const prevEnd = new Date(Math.min(prevStart.getTime() + span, prevMonthEnd.getTime()));
  return { start, end: now, prevStart, prevEnd };
}

function totals(orders, from, to) {
  const inRange = orders.filter((o) => {
    const t = Date.parse(o.created);
    return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
  });
  const live = inRange.filter((o) => o.status !== 'cancelled');
  const ordered = live.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const received = live.reduce((s, o) => s + Math.max(0, (Number(o.amount_paid) || 0) - (Number(o.amount_refunded) || 0)), 0);
  const cancelled = inRange.length - live.length;
  return {
    orders: live.length,
    ordered,
    received,
    average: live.length ? ordered / live.length : 0,
    cancelled,
    cancelledShare: inRange.length ? cancelled / inRange.length : 0,
  };
}

/** Variação em %, arredondada; `null` sem base de comparação (o painel mostra "—", não "igual"). */
export function delta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** O mês até hoje e o mesmo período do mês anterior. */
export function monthSummary(orders, now = new Date()) {
  const list = Array.isArray(orders) ? orders : [];
  const b = bounds(now);
  const current = totals(list, b.start, b.end);
  const previous = totals(list, b.prevStart, b.prevEnd);
  const monthName = now.toLocaleDateString('pt-PT', { month: 'long' });
  return {
    label: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}, até dia ${now.getDate()}`,
    current,
    previous,
    deltas: {
      orders: delta(current.orders, previous.orders),
      ordered: delta(current.ordered, previous.ordered),
      received: delta(current.received, previous.received),
      average: delta(current.average, previous.average),
    },
  };
}

/** Os produtos mais vendidos nos últimos `days` dias (unidades, sem as canceladas). */
export function topProducts(orders, { days = 30, limit = 5, now = new Date() } = {}) {
  const since = now.getTime() - days * DAY;
  const byKey = new Map();
  for (const o of Array.isArray(orders) ? orders : []) {
    if (o.status === 'cancelled' || !(Date.parse(o.created) >= since)) continue;
    for (const item of Array.isArray(o.items) ? o.items : []) {
      const key = String(item?.book_id || item?.title || '');
      if (!key) continue;
      const row = byKey.get(key) || { id: key, title: String(item.title || 'Produto'), code: item.book_code || '', units: 0, revenue: 0 };
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      row.units += qty;
      row.revenue += qty * (Number(item.price) || 0);
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
}
