import { isPickupOrder, orderDeliveryAddress, orderPaymentLabel, orderPickupStore } from '@/lib/orderUtils';

/**
 * Célula de CSV segura para abrir no Excel. Um texto começado por = + - @ (ou tabulação) é
 * lido como fórmula — e a exportação leva texto escrito pelos clientes (nome, morada,
 * notas): `=HYPERLINK(…)` numa nota virava um link no computador da equipa. O apóstrofo
 * à frente fá-lo ficar texto (recomendação da OWASP); os telefones +244… também, que o Excel
 * tentava calcular.
 */
export function csvSafeText(val) {
  const s = String(val ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function escapeCsv(val) {
  const s = csvSafeText(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtItems(items) {
  if (!items?.length) return '';
  return items.map((i) => `${i.quantity || 1}× ${i.title || i.book_code || '—'}`).join('; ');
}

function orderRow(o) {
  const items = o.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const shipping = Number(o.shipping_cost) || 0;
  const channel = o.order_type === 'whatsapp_order' || o.sale_channel === 'whatsapp' ? 'WhatsApp' : 'Compra Online';
  const type = o.order_type === 'whatsapp_order' ? 'Encomenda' : 'Compra';

  return [
    o.order_number || o.id,
    new Date(o.created).toLocaleString('pt-AO'),
    type,
    channel,
    o.customer_name || '',
    o.customer_email || '',
    o.phone || '',
    orderDeliveryAddress(o),
    isPickupOrder(o) ? '' : (o.delivery_municipality || o.city || ''),
    o.shipping_method === 'pickup' ? 'Levantamento' : o.shipping_method === 'express' ? 'Expressa' : 'Domicílio',
    orderPickupStore(o),
    subtotal.toFixed(2),
    shipping.toFixed(2),
    Number(o.total || 0).toFixed(2),
    o.status || '',
    o.payment_status || '',
    // O nome, como no recibo (antes saía o código: "entrega", "balcao").
    orderPaymentLabel(o),
    o.delivery_status || '',
    fmtItems(items),
    o.notes || '',
  ];
}

const HEADERS = [
  'Nº Pedido', 'Data', 'Tipo', 'Canal', 'Cliente', 'Email', 'Telefone',
  'Morada', 'Cidade', 'Método Envio', 'Loja Levantamento',
  'Subtotal (Kz)', 'Envio (Kz)', 'Total (Kz)',
  'Estado', 'Estado Pagamento', 'Método Pagamento', 'Estado Entrega',
  'Itens', 'Notas',
];

export function exportOrdersToExcel(orders, filename = 'historico-vendas') {
  const rows = [HEADERS, ...orders.map(orderRow)];
  const csv = '\uFEFF' + rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function computeSalesReport(orders) {
  const active = orders.filter((o) => o.status !== 'cancelled');
  const cancelled = orders.filter((o) => o.status === 'cancelled');
  const online = active.filter((o) => o.order_type !== 'whatsapp_order' && o.sale_channel !== 'whatsapp');
  const whatsapp = active.filter((o) => o.order_type === 'whatsapp_order' || o.sale_channel === 'whatsapp');
  const purchases = active.filter((o) => o.order_type === 'online_purchase' || (!o.order_type && o.sale_channel !== 'whatsapp'));
  const enquiries = active.filter((o) => o.order_type === 'whatsapp_order');

  const sum = (list) => list.reduce((s, o) => s + Number(o.total || 0), 0);
  const byMonth = {};
  active.forEach((o) => {
    const key = new Date(o.created).toLocaleDateString('pt-AO', { year: 'numeric', month: 'long' });
    if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
    byMonth[key].count += 1;
    byMonth[key].total += Number(o.total || 0);
  });

  const byStatus = {};
  orders.forEach((o) => {
    const st = o.status || 'pending';
    if (!byStatus[st]) byStatus[st] = { count: 0, total: 0 };
    byStatus[st].count += 1;
    byStatus[st].total += Number(o.total || 0);
  });

  return {
    totalOrders: orders.length,
    activeOrders: active.length,
    cancelledOrders: cancelled.length,
    onlineOrders: online.length,
    whatsappOrders: whatsapp.length,
    purchases: purchases.length,
    enquiries: enquiries.length,
    totalRevenue: sum(active),
    onlineRevenue: sum(online),
    whatsappRevenue: sum(whatsapp),
    cancelledRevenue: sum(cancelled),
    averageOrder: active.length ? sum(active) / active.length : 0,
    byMonth,
    byStatus,
    byDay: computeDailySales(active),
    topBooks: computeTopBooks(active),
  };
}

export function computeDailySales(orders, days = 14) {
  const map = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map[key] = { date: key, label: d.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' }), orders: 0, revenue: 0 };
  }
  orders.forEach((o) => {
    const key = new Date(o.created).toISOString().slice(0, 10);
    if (!map[key]) return;
    map[key].orders += 1;
    map[key].revenue += Number(o.total || 0);
  });
  return Object.values(map);
}

export function computeTopBooks(orders, limit = 8) {
  const counts = {};
  orders.forEach((o) => {
    (o.items || []).forEach((it) => {
      const title = it.title || it.book_code || 'Desconhecido';
      if (!counts[title]) counts[title] = { title, quantity: 0, revenue: 0 };
      counts[title].quantity += Number(it.quantity) || 1;
      counts[title].revenue += (Number(it.price) || 0) * (Number(it.quantity) || 1);
    });
  });
  return Object.values(counts).sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

export function exportSalesReportSummary(orders, filename = 'relatorio-vendas') {
  const report = computeSalesReport(orders);
  const lines = [
    ['Relatório de Vendas — Livraria Adventista'],
    ['Gerado em', new Date().toLocaleString('pt-AO')],
    [],
    ['Métrica', 'Valor'],
    ['Total de pedidos', report.totalOrders],
    ['Pedidos activos', report.activeOrders],
    ['Cancelados', report.cancelledOrders],
    ['Compras online', report.onlineOrders],
    ['Encomendas WhatsApp', report.whatsappOrders],
    [],
    ['Receita total (Kz)', report.totalRevenue.toFixed(2)],
    ['Receita online (Kz)', report.onlineRevenue.toFixed(2)],
    ['Receita WhatsApp (Kz)', report.whatsappRevenue.toFixed(2)],
    ['Ticket médio (Kz)', report.averageOrder.toFixed(2)],
    [],
    ['Por mês', 'Pedidos', 'Total (Kz)'],
    ...Object.entries(report.byMonth).map(([m, d]) => [m, d.count, d.total.toFixed(2)]),
    [],
    ['Por estado', 'Pedidos', 'Total (Kz)'],
    ...Object.entries(report.byStatus).map(([s, d]) => [s, d.count, d.total.toFixed(2)]),
  ];
  const csv = '\uFEFF' + lines.map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
