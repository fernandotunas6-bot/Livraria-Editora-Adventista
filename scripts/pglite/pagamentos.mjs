// Cenários dos pagamentos registados e do gateway, com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/pagamentos.mjs supabase/migrations
// Instruções em base.mjs e em docs/PAGAMENTOS.md ("Testes").
import { freshDb, migrationFiles, migrationSql } from './base.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const raises = async (name, fn, re) => {
  try {
    await fn();
    fail++; console.log('FALHOU (devia recusar):', name);
  } catch (e) {
    if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', name, '→', e.message); } else ok++;
  }
};

async function harness(db) {
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  const svc = (sql, params = [], actor = null) => db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                           set_config('request.headers', $1, true)`, [JSON.stringify(actor ? { 'x-actor-id': actor } : {})]);
    await tx.exec('set local role service_role');
    return (await tx.query(sql, params)).rows;
  });
  const asUser = (sub, sql, params = []) => db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                           set_config('request.headers', '{}', true)`, [sub]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql, params)).rows;
  });
  return { q, svc, asUser };
}

// ---------------------------------------------------------------------------------------------
const db = await freshDb(dir);
const { q, svc, asUser } = await harness(db);

const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = $3 where id = $1`, [u.id, role, permissions]);
  return u.id;
};
const admin = await user('admin@loja.ao', 'admin');
const gestor = await user('gestor@loja.ao', 'manager', { manage_orders: true });
const caixa = await user('caixa@loja.ao', 'manager', { manage_orders: true, confirm_payments: true });
const cliente = await user('cliente@exemplo.ao');

await q(`insert into public.payment_methods (name, code, type, enabled) values
  ('Transferência Bancária', 'transferencia', 'transfer', true),
  ('Pagamento na Entrega', 'entrega', 'offline', true),
  ('Pagar no Balcão', 'balcao', 'offline', true)`);
const [livro] = await q(`insert into public.stock_books (title, price, stock) values ('Livro A', 5000, 500) returning id`);
const [farda] = await q(`insert into public.stock_books (title, price, sale_price, stock, versions) values
  ('Farda', 4500, 4000, 100, '[{"label":"M","format":"","price":"","stock":"10","isbn":""},{"label":"G","format":"","price":"5200","stock":"","isbn":""}]')
  returning id`);

let seq = 0;
const encomenda = async (extra = {}, items = [{ book_id: livro.id, quantity: 2 }], method = 'delivery') => {
  seq++;
  const order = {
    order_number: `ENC-T${String(seq).padStart(3, '0')}`, customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente',
    customer_id: cliente, phone: '923000000', payment_method_code: 'transferencia', payment_method_name: 'Transferência Bancária',
    payment_status: 'paid', // o cliente não decide: tem de ficar pendente
    delivery_status: 'received', status: 'pending', shipping_method: method, ...extra,
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify(items), JSON.stringify({ method, free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const order = async (id) => (await q(`select * from public.orders where id = $1`, [id]))[0];
const rpc = async (fn, args, actor = caixa) => (await svc(`select ${fn} as r`, args, actor))[0].r;
const notices = async (orderId) => q(`select title, body from public.customer_notifications where order_id = $1 and kind = 'payment' order by created_at`, [orderId]);

// A. Encomenda nova ------------------------------------------------------------------------------
const o1 = await encomenda();
check('total = artigos + portes', Number(o1.total) === 11500, o1.total);
check('nasce pendente mesmo que o pedido diga "paid"', o1.payment_status === 'pending', o1.payment_status);
check('nada pago', Number(o1.amount_paid) === 0 && o1.paid_at === null);

const of = await encomenda({}, [{ book_id: farda.id, quantity: 1, variant: 0 }, { book_id: farda.id, quantity: 1, variant: 1 }]);
check('tamanho sem preço = preço do produto com a promoção', Number(of.items[0].price) === 4000, of.items[0]);
check('tamanho com preço próprio = o dele', Number(of.items[1].price) === 5200, of.items[1]);

// B. O cliente indica a referência ----------------------------------------------------------------
let r = await rpc(`public.order_payment_report($1, $2)`, [o1.id, 'TRF 0012-345'], null);
check('indicado → a aguardar confirmação', r.payment_status === 'awaiting_confirmation', r);
check('o indicado vale o que falta', Number(r.outstanding) === 11500);
const r1b = await rpc(`public.order_payment_report($1, $2)`, [o1.id, 'trf0012345'], null);
check('a mesma referência, escrita de outra forma, não cria outra', r1b.repeated === true && r1b.payment_id === r.payment_id, r1b);
r = await rpc(`public.order_payment_report($1, $2)`, [o1.id, 'TRF-999'], null);
check('referência nova substitui a anterior', r.replaced === true);
const [antiga] = await q(`select status, decision_reason from public.order_payments where reference = 'TRF 0012-345'`);
check('a anterior fica rejeitada, com o motivo', antiga.status === 'rejected' && /Substituída/.test(antiga.decision_reason), antiga);
check('referência na encomenda = a última', (await order(o1.id)).payment_reference === 'TRF-999');

const o2 = await encomenda();
const r2 = await rpc(`public.order_payment_report($1, $2)`, [o2.id, 'TRF-999'], null);
check('referência repetida noutra encomenda é assinalada', r2.duplicates.length === 1 && r2.duplicates[0].order_number === o1.order_number, r2.duplicates);
await raises('referência curta recusada', () => rpc(`public.order_payment_report($1, $2)`, [o2.id, 'ab'], null), /pelo menos 4/);

// C. Confirmar --------------------------------------------------------------------------------------
const pay1 = r.payment_id;
const at0 = new Date(Date.now() - 2 * 3600_000).toISOString();
r = await rpc(`public.order_payment_confirm($1::uuid, $2::numeric, $3::timestamptz)`, [pay1, 6000, at0]);
check('confirmado a menos → pago em parte', r.payment_status === 'partially_paid' && Number(r.outstanding) === 5500, r);
check('sem data de pago enquanto falta', (await order(o1.id)).paid_at === null);
const n1 = await notices(o1.id);
check('aviso na conta: recebido em parte', n1.some((n) => n.title === 'Pagamento recebido em parte' && /Faltam 5 500 Kz/.test(n.body)), n1);

await raises('a mesma referência não confirma outra encomenda sem dizer que é partilhada',
  () => rpc(`public.order_payment_confirm($1::uuid)`, [r2.payment_id]), /já confirmou a encomenda/);
r = await rpc(`public.order_payment_confirm($1::uuid, null, null, '', '', true)`, [r2.payment_id]);
check('partilhada, passa e fica na nota', r.payment_status === 'paid' && /partilhada/.test(r.note), r);

const at = new Date(Date.now() - 3600_000).toISOString();
r = await rpc(`public.order_payment_record($1, $2::numeric, 'balcao', '', $3::timestamptz, 'Caixa Luanda', 'Ana (balcão)')`, [o1.id, 5500, at]);
check('o resto ao balcão → pago', r.payment_status === 'paid' && Number(r.outstanding) === 0, r);
let o1n = await order(o1.id);
check('pago na data em que entrou o dinheiro que faltava', new Date(o1n.paid_at).toISOString() === at, o1n.paid_at);
check('estado geral avança quando fica pago (PR #23)', o1n.status === 'confirmed', o1n.status);
check('aviso na conta: pagamento confirmado', (await notices(o1.id)).some((n) => n.title === 'Pagamento confirmado'));
const audit = await q(`select actor_id, actor_kind, summary from public.security_audit_log where table_name = 'order_payments' order by id`);
check('registo de segurança com quem confirmou', audit.some((a) => a.actor_id === caixa && /pagamento confirmado/.test(a.summary)), audit.slice(-3));
await raises('data no futuro recusada', () => rpc(`public.order_payment_record($1, 100, null, '', now() + interval '1 day')`, [o2.id]), /futuro/);

// D. Ninguém escreve à mão -------------------------------------------------------------------------
const o3 = await encomenda();
await raises('service role não muda o estado do pagamento', () => svc(`update public.orders set payment_status = 'paid' where id = $1`, [o3.id]), /resulta dos pagamentos/);
await raises('service role não muda o pago', () => svc(`update public.orders set amount_paid = 999 where id = $1`, [o3.id]), /resulta dos pagamentos/);
await raises('service role não escreve na tabela de pagamentos', () => svc(`insert into public.order_payments (order_id, status, amount) values ($1, 'confirmed', 1)`, [o3.id]), /funções order_payment/);
await raises('pagamentos não se apagam', () => svc(`delete from public.order_payments where order_id = $1`, [o1.id]), /não se apagam/);
await raises('o painel não grava o total', () => asUser(gestor, `update public.orders set total = 1 where id = $1`, [o3.id]), /permission denied/);
await raises('o painel não grava o pagamento', () => asUser(gestor, `update public.orders set payment_status = 'paid' where id = $1`, [o3.id]), /permission denied/);
await raises('o painel não grava o stock devolvido', () => asUser(gestor, `update public.orders set stock_restored = true where id = $1`, [o3.id]), /permission denied/);
const seg = await asUser(gestor, `update public.orders set tracking_number = 'AO123', carrier = 'Correios' where id = $1 returning tracking_number`, [o3.id]);
check('o painel grava o seguimento', seg[0]?.tracking_number === 'AO123');
await svc(`update public.orders set total = 1 where id = $1`, [o3.id]);
check('total mudado sozinho volta a ser artigos + portes', Number((await order(o3.id)).total) === 11500);
await raises('o gestor não chama as funções de escrita', () => asUser(caixa, `select public.order_payment_record($1, 100)`, [o3.id]), /permission denied/);
check('quem gere encomendas vê os pagamentos', (await asUser(gestor, `select count(*)::int n from public.order_payments`))[0].n > 0);
check('o cliente não vê a tabela de pagamentos', (await asUser(cliente, `select count(*)::int n from public.order_payments`))[0].n === 0);
const ov = (await asUser(gestor, `select public.order_payments_overview($1) as v`, [o1.id]))[0].v;
check('resumo do painel', ov.payments.length === 3 && Number(ov.order.amount_paid) === 11500, ov.order);
check('resumo mostra a repetida', ov.payments.some((p) => p.duplicates.length > 0));
await raises('o cliente não lê o resumo', () => asUser(cliente, `select public.order_payments_overview($1)`, [o1.id]), /Sem acesso/);

// E. Rejeitar -----------------------------------------------------------------------------------------
r = await rpc(`public.order_payment_report($1, $2)`, [o3.id, 'ABCD1234'], null);
await raises('rejeitar pede o motivo', () => rpc(`public.order_payment_reject($1::uuid, 'não')`, [r.payment_id]), /porque/);
r = await rpc(`public.order_payment_reject($1::uuid, 'Não aparece no extracto do BAI')`, [r.payment_id]);
check('rejeitado → não confirmado', r.payment_status === 'failed', r);
check('referência rejeitada deixa de contar', (await order(o3.id)).payment_reference === '');
check('aviso na conta: não confirmado', (await notices(o3.id)).some((n) => n.title === 'Pagamento não confirmado'));
r = await rpc(`public.order_payment_report($1, $2)`, [o3.id, 'XYZ98765'], null);
check('depois de rejeitado, pode indicar outra', r.payment_status === 'awaiting_confirmation');

// F. Reembolso e anulação --------------------------------------------------------------------------
await raises('não se devolve mais do que o pago', () => rpc(`public.order_refund_record($1, 20000, null, '', null, '', 'Cliente desistiu da compra')`, [o1.id]), /no máximo 11 500 Kz/);
r = await rpc(`public.order_refund_record($1, 11500, 'transferencia', 'DEV-1', null, '', 'Cliente desistiu da compra')`, [o1.id]);
check('reembolso total → reembolsada', r.payment_status === 'refunded', r);
const refundId = r.payment_id;
r = await rpc(`public.order_payment_void($1::uuid, 'Reembolso registado por engano')`, [refundId]);
check('anular o reembolso → volta a paga', r.payment_status === 'paid', r);
const [p6000] = await q(`select id from public.order_payments where order_id = $1 and amount = 6000`, [o1.id]);
r = await rpc(`public.order_payment_void($1::uuid, 'Transferência devolvida pelo banco')`, [p6000.id]);
check('anular um pagamento → em parte', r.payment_status === 'partially_paid' && Number(r.amount_paid) === 5500, r);
const alerts = await q(`select count(*)::int n from public.security_audit_log where table_name = 'order_payments' and alerted`);
check('anulação avisa os administradores', alerts[0].n >= 1, alerts);
await raises('uma anulação não se anula', () => rpc(`public.order_payment_void($1::uuid, 'outra vez sem querer')`, [p6000.id]), /Só se anula/);

// G. Colportagem -----------------------------------------------------------------------------------
await q(`update public.colporteur_settings set base_pct = 10 where id = 1`);
const [cpt] = await q(`insert into public.colporteurs (code, full_name, phone, status) values ('CPT-0001', 'Colportor Um', '923111222', 'activo') returning id`);
const o4 = await encomenda({ colporteur_code: 'CPT-0001' });
check('código do colportor reconhecido', o4.colporteur_id === cpt.id, o4.colporteur_id);
const ledger = async () => (await q(`select coalesce(-sum(amount), 0)::numeric n, count(*)::int c from public.colporteur_ledger where order_id = $1`, [o4.id]))[0];
r = await rpc(`public.order_payment_record($1, 11500, 'transferencia', 'TRF-CPT-1')`, [o4.id]);
await svc(`update public.orders set delivery_status = 'delivered' where id = $1`, [o4.id]);
check('paga e entregue → comissão de 10% dos artigos', Number((await ledger()).n) === 1000, await ledger());
const [pc] = await q(`select id from public.order_payments where order_id = $1 and status = 'confirmed'`, [o4.id]);
await rpc(`public.order_payment_void($1::uuid, 'Transferência devolvida pelo banco')`, [pc.id]);
check('pagamento anulado → comissão anulada', Number((await ledger()).n) === 0, await ledger());
await rpc(`public.order_payment_record($1, 11500, 'transferencia', 'TRF-CPT-2')`, [o4.id]);
const lg = await ledger();
check('paga outra vez → comissão reposta', Number(lg.n) === 1000 && lg.c === 3, lg);
await rpc(`public.order_refund_record($1, 11500, null, '', null, '', 'Devolução dos livros')`, [o4.id]);
check('reembolsada → comissão anulada', Number((await ledger()).n) === 0, await ledger());
const sales = (await q(`select private.colporteur_site_sales($1) as s`, [cpt.id]))[0].s;
check('vendas do colportor somam as linhas da encomenda', sales.length === 1 && Number(sales[0].commission) === 0 && sales[0].cancelled_commission === true, sales);

// H. Total muda depois de pago -----------------------------------------------------------------------
const o5 = await encomenda();
await rpc(`public.order_payment_record($1, 11500)`, [o5.id]);
await svc(`update public.orders set items = items || $2::jsonb where id = $1`, [o5.id, JSON.stringify([{ book_id: livro.id, title: 'Livro A', quantity: 1, price: 5000 }])]);
const o5n = await order(o5.id);
check('artigo a mais depois de pago → pago em parte', Number(o5n.total) === 16500 && o5n.payment_status === 'partially_paid', { total: o5n.total, s: o5n.payment_status });

// I. Relatório ----------------------------------------------------------------------------------------
const o6 = await encomenda({ payment_method_code: 'balcao', payment_method_name: 'Pagar no Balcão' }, undefined, 'pickup');
await svc(`update public.orders set delivery_status = 'delivered' where id = $1`, [o6.id]);
const caixaNome = (await q(`select coalesce(nullif(name, ''), email) n from public.profiles where id = $1`, [caixa]))[0].n;
const rep = (await asUser(caixa, `select public.payments_report(current_date - 1, current_date) as r`))[0].r;
check('relatório: recebido líquido', Number(rep.received.net) === Number(rep.received.payments) - Number(rep.received.refunds), rep.received);
check('relatório: por método', rep.by_method.some((m) => m.method_code === 'balcao' && Number(m.received) === 5500), rep.by_method);
check('relatório: canal colportor', rep.by_channel.some((c) => c.channel === 'colportor'), rep.by_channel);
check('relatório: entregue sem pagamento', rep.delivered_unpaid.orders.some((o) => o.order_id === o6.id), rep.delivered_unpaid);
check('relatório: por confirmar, com a lista', rep.to_confirm.count >= 1 && rep.to_confirm.items.length === rep.to_confirm.count, rep.to_confirm);
check('relatório: movimentos com quem confirmou', rep.movements.some((m) => m.decided_by_name && m.decided_by_name === caixaNome), rep.movements.slice(0, 2));
check('relatório: vendido não é recebido', Number(rep.sold.value) > Number(rep.received.net), { sold: rep.sold, net: rep.received.net });
await raises('o cliente não lê o relatório', () => asUser(cliente, `select public.payments_report(current_date - 1, current_date)`), /Sem acesso/);

// J. Limites --------------------------------------------------------------------------------------------
const o7 = await encomenda();
for (let i = 0; i < 9; i++) await rpc(`public.order_payment_report($1, $2)`, [o7.id, `REF-LIMITE-${i}`], null);
await raises('no máximo 10 referências por encomenda', async () => {
  await rpc(`public.order_payment_report($1, $2)`, [o7.id, 'REF-LIMITE-9'], null);
  await rpc(`public.order_payment_report($1, $2)`, [o7.id, 'REF-LIMITE-10'], null);
}, /muitas referências/);
await svc(`update public.orders set status = 'cancelled' where id = $1`, [o2.id]);
check('paga e cancelada → por reembolsar no relatório', (await asUser(caixa, `select public.payments_report(current_date, current_date) as r`))[0].r.refund_due.count >= 1);
await raises('cancelada: o cliente já não indica referência', () => rpc(`public.order_payment_report($1, $2)`, [o2.id, 'TARDE123'], null), /cancelada/);

// L. Gateway de pagamentos (webhook) ------------------------------------------------------------------
const og = await encomenda({ payment_method_code: 'multicaixa', payment_method_name: 'Multicaixa Express' });
const gw = (tx, ref, amount, status = 'paid') =>
  rpc(`public.order_payment_gateway('generico', $1, $2, $3::numeric, now(), 'MCX-1', $4, '{"x":1}'::jsonb, '1.2.3.4')`, [tx, ref, amount, status], null);
r = await gw('TX-1', og.order_number.toLowerCase(), 11500);
check('gateway: pagamento gravado e a encomenda fica paga', r.outcome === 'recorded' && r.payment_status === 'paid', r);
check('gateway: aviso na conta do cliente', (await notices(og.id)).some((n) => n.title === 'Pagamento confirmado'));
const [pg1] = await q(`select source, provider, transaction_id, created_by from public.order_payments where order_id = $1`, [og.id]);
check('gateway: origem e transacção guardadas', pg1.source === 'gateway' && pg1.provider === 'generico' && pg1.transaction_id === 'TX-1' && pg1.created_by === null, pg1);
r = await gw('TX-1', og.order_number, 11500);
check('gateway: o reenvio não conta duas vezes', r.outcome === 'duplicate' && Number((await order(og.id)).amount_paid) === 11500, r);
r = await gw('TX-2', og.order_number, 11500, 'pending');
check('gateway: estado que não é pagamento é ignorado', r.outcome === 'ignored' && Number((await order(og.id)).amount_paid) === 11500, r);
r = await gw('TX-3', 'ENC-NAOEXISTE', 5000);
check('gateway: sem encomenda fica órfão', r.outcome === 'orphan', r);
const og2 = await encomenda({ payment_method_code: 'multicaixa', payment_method_name: 'Multicaixa Express' });
r = await gw('TX-4', og2.order_number, 4000);
check('gateway: valor a menos → pago em parte', r.payment_status === 'partially_paid' && Number(r.outstanding) === 7500, r);
// Sem estado, o aviso pode ser um reembolso ou um pendente: recusa-se (análise crítica, 2026-11-20).
r = await gw('TX-5', og2.order_number, 7500, '');
check('gateway: sem estado é recusado e não mexe na encomenda', r.outcome === 'rejected' && Number((await order(og2.id)).amount_paid) === 4000, r);
r = await rpc(`public.order_payment_gateway('generico', 'TX-6', $1, 7500::numeric)`, [og2.order_number], null);
check('gateway: estado omitido também é recusado', r.outcome === 'rejected' && Number((await order(og2.id)).amount_paid) === 4000, r);
const ev = await q(`select outcome, count(*)::int n from public.payment_gateway_events group by 1 order by 1`);
check('gateway: cada chamada fica registada', JSON.stringify(ev) === JSON.stringify([
  { outcome: 'duplicate', n: 1 }, { outcome: 'ignored', n: 1 }, { outcome: 'orphan', n: 1 }, { outcome: 'recorded', n: 2 },
  { outcome: 'rejected', n: 2 }]), ev);
await raises('gateway: só a Edge Function grava', () => asUser(caixa, `select public.order_payment_gateway('generico', 'TX-9', $1, 100)`, [og2.order_number]), /permission denied/);
await raises('gateway: o registo não se altera', () => svc(`update public.payment_gateway_events set outcome = 'recorded'`), /não se altera/);
await raises('gateway: a mesma transacção não entra à mão', async () => {
  await db.exec(`select set_config('app.payments_write', 'on', false)`);
  try { await q(`insert into public.order_payments (order_id, status, amount, source, provider, transaction_id, received_at) values ($1, 'confirmed', 1, 'gateway', 'generico', 'TX-1', now())`, [og2.id]); }
  finally { await db.exec(`select set_config('app.payments_write', '', false)`); }
}, /duplicate key|order_payments_transacao_unica/);
check('gestor vê as chamadas do gateway', (await asUser(gestor, `select count(*)::int n from public.payment_gateway_events`))[0].n === 7);
check('cliente não vê as chamadas do gateway', (await asUser(cliente, `select count(*)::int n from public.payment_gateway_events`))[0].n === 0);
const repG = (await asUser(caixa, `select public.payments_report(current_date - 1, current_date) as r`))[0].r;
check('relatório: automático (gateway) e manual', Number(repG.received.automatic) === 15500 && Number(repG.received.manual) > 0, repG.received);
check('relatório: chamadas do gateway', repG.gateway.recorded === 2 && repG.gateway.orphan === 1, repG.gateway);

// K. Encomendas antigas: a migração cria os pagamentos que já tinham, sem avisar ninguém -----------------
const old = await freshDb(dir, { upTo: '20261107199999' });
const h2 = await harness(old);
const [c2] = await h2.q(`insert into auth.users (email) values ('antigo@exemplo.ao') returning id`);
const items = JSON.stringify([{ book_id: 'x', title: 'Livro', quantity: 1, price: 7000 }]);
const paidAt = '2026-11-02T10:00:00.000Z';
await h2.q(`insert into public.orders (order_number, items, total, shipping_cost, customer_id, payment_status, payment_reference, delivery_status, status, delivery_timeline) values
  ('ENC-OLD1', $1, 7000, 0, $2, 'paid', '', 'delivered', 'pending', $3::jsonb),
  ('ENC-OLD2', $1, 7000, 0, $2, 'awaiting_confirmation', 'REF-ANTIGA', 'received', 'pending', '[]'),
  ('ENC-OLD3', $1, 7000, 0, $2, 'failed', 'REF-FALHOU', 'received', 'pending', '[]'),
  ('ENC-OLD4', $1, 7000, 0, $2, 'refunded', '', 'cancelled', 'cancelled', '[]'),
  ('ENC-OLD5', $1, 7000, 0, $2, 'pending', '', 'delivered', 'pending', '[]')`,
  [items, c2.id, JSON.stringify([{ status: 'paid', title: 'Pagamento confirmado', at: paidAt }])]);
const before = (await h2.q(`select count(*)::int n from public.customer_notifications`))[0].n;
for (const f of migrationFiles(dir).filter((f) => f.slice(0, 14) > '20261107199999')) {
  await old.exec(migrationSql(readFileSync(join(dir, f), 'utf8')));
}
const rows = await h2.q(`select order_number, payment_status, amount_paid::numeric, amount_refunded::numeric, paid_at, payment_reference from public.orders order by order_number`);
const by = Object.fromEntries(rows.map((x) => [x.order_number, x]));
check('antiga paga: continua paga, com o pagamento', by['ENC-OLD1'].payment_status === 'paid' && Number(by['ENC-OLD1'].amount_paid) === 7000, by['ENC-OLD1']);
check('antiga paga: data do passo "paid"', new Date(by['ENC-OLD1'].paid_at).toISOString() === paidAt, by['ENC-OLD1'].paid_at);
check('antiga a aguardar: continua, com o indicado', by['ENC-OLD2'].payment_status === 'awaiting_confirmation' && by['ENC-OLD2'].payment_reference === 'REF-ANTIGA', by['ENC-OLD2']);
check('antiga falhada: continua falhada', by['ENC-OLD3'].payment_status === 'failed', by['ENC-OLD3']);
check('antiga reembolsada: continua reembolsada', by['ENC-OLD4'].payment_status === 'refunded' && Number(by['ENC-OLD4'].amount_refunded) === 7000, by['ENC-OLD4']);
check('antiga por pagar e entregue: fica por pagar (a vigilância assinala)', by['ENC-OLD5'].payment_status === 'pending', by['ENC-OLD5']);
check('a migração não avisa clientes', (await h2.q(`select count(*)::int n from public.customer_notifications`))[0].n === before);
check('estados com regra validada', (await h2.q(`select count(*)::int n from pg_constraint where conname like 'orders_%_valido' and convalidated`))[0].n === 3);

console.log(`\n${ok} cenários certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
