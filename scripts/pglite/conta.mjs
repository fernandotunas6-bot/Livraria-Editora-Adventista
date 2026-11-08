// Cenários da conta do cliente e da fila da equipa (migração conta_do_cliente), com as
// migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/conta.mjs supabase/migrations
// Instruções em base.mjs e em docs/PAGAMENTOS.md ("Testes").
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const raises = async (name, fn, re) => {
  try { await fn(); fail++; console.log('FALHOU (devia recusar):', name); }
  catch (e) { if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', name, '→', e.message); } else ok++; }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const svc = (sql, params = [], actor = null) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                         set_config('request.headers', $1, true)`, [JSON.stringify(actor ? { 'x-actor-id': actor } : {})]);
  await tx.exec('set local role service_role');
  return (await tx.query(sql, params)).rows;
});
const as = (role, sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};

const admin = await user('admin@loja.ao', 'admin');
const func = await user('func@loja.ao', 'manager', { manage_orders: true });
const cliente = await user('cliente@exemplo.ao');
await q(`insert into public.payment_methods (name, code, type, enabled) values ('Transferência', 'transferencia', 'transfer', true), ('Pagamento na Entrega', 'entrega', 'offline', true)`);
const [livro] = await q(`insert into public.stock_books (title, price, stock) values ('Livro A', 5000, 50) returning id`);
const stock = async () => Number((await q(`select stock from public.stock_books where id = $1`, [livro.id]))[0].stock);

let seq = 0;
const encomenda = async (extra = {}, qtd = 2) => {
  seq++;
  const order = {
    order_number: `ENC-C${seq}`, customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente Teste', customer_id: cliente,
    phone: '923000000', payment_method_code: 'entrega', payment_method_name: 'Pagamento na Entrega', delivery_status: 'received',
    status: 'pending', shipping_method: 'delivery', ...extra,
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify([{ book_id: livro.id, quantity: qtd }]), JSON.stringify({ method: 'delivery', free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const order = async (id) => (await q(`select * from public.orders where id = $1`, [id]))[0];
const porLer = async (id) => Number((await q(`select count(*) from public.staff_notifications where order_id = $1 and kind = 'new_order' and read_at is null`, [id]))[0].count);
const cancelar = (id, motivo = '') => svc(`select public.order_cancel_by_customer($1, $2) as r`, [id, motivo]).then((x) => x[0].r);

// --- 1. Avisos de "assumir" ---------------------------------------------------------------
const o1 = await encomenda();
check('encomenda nova avisa a equipa (admin e funcionário)', await porLer(o1.id) === 2, await porLer(o1.id));
// A equipa avança a entrega sem carregar em "Assumir": assume implicitamente. A entrega muda
// pela Edge Function (papel de serviço); o painel só escreve o estado geral e o seguimento.
await svc(`update public.orders set delivery_status = 'confirmed' where id = $1`, [o1.id], func);
check('mudar a entrega assume a encomenda', !!(await order(o1.id)).acknowledged_at);
check('…e fecha os avisos "assumir" de toda a equipa', await porLer(o1.id) === 0, await porLer(o1.id));

const o2 = await encomenda();
await as('authenticated', func, `select public.order_acknowledge($1)`, [o2.id]);
check('o botão Assumir continua a fechar os avisos', await porLer(o2.id) === 0);

const o3 = await encomenda();
await as('authenticated', admin, `update public.orders set status = 'cancelled' where id = $1`, [o3.id]);
check('cancelar no painel também fecha os avisos', await porLer(o3.id) === 0);
const outros = await encomenda();
check('as outras encomendas continuam por assumir', await porLer(outros.id) === 2);

// --- 2. O cliente cancela -----------------------------------------------------------------
const antes = await stock();
const c1 = await encomenda({}, 3);
check('a encomenda tira 3 do stock', await stock() === antes - 3);
const r1 = await cancelar(c1.id, '  Enganei-me   na morada  ');
const d1 = await order(c1.id);
check('fica cancelada (estado e entrega)', d1.status === 'cancelled' && d1.delivery_status === 'cancelled', [d1.status, d1.delivery_status]);
check('o stock volta', await stock() === antes, [await stock(), antes]);
check('stock_restored marcado', d1.stock_restored === true);
const ultimo = d1.delivery_timeline[d1.delivery_timeline.length - 1];
check('a linha do tempo diz quem cancelou e porquê', ultimo.status === 'cancelled' && ultimo.description === 'Cancelada pelo cliente: Enganei-me na morada', ultimo);
check('devolve o número e o motivo limpo', r1.order_number === 'ENC-C' + (seq) && r1.reason === 'Enganei-me na morada', r1);
check('os avisos "assumir" fecham-se', await porLer(c1.id) === 0);
check('o cliente recebe o aviso de cancelamento', (await q(`select 1 from public.customer_notifications where order_id = $1 and title = 'Encomenda cancelada'`, [c1.id])).length === 1);
const audit = await q(`select summary from public.security_audit_log where row_id = $1 and summary like '%cancelled%'`, [c1.id]);
check('fica no registo de segurança', audit.length === 1, audit);
await raises('cancelar outra vez', () => cancelar(c1.id), /já está cancelada/);

const c2 = await encomenda();
await cancelar(c2.id);
check('sem motivo: "Cancelada pelo cliente."', (await order(c2.id)).delivery_timeline.at(-1).description === 'Cancelada pelo cliente.');

// Confirmada pela equipa, ainda na fila: pode.
const c3 = await encomenda();
await as('authenticated', func, `update public.orders set status = 'confirmed' where id = $1`, [c3.id]);
await svc(`update public.orders set delivery_status = 'confirmed' where id = $1`, [c3.id], func);
await cancelar(c3.id);
check('confirmada mas não preparada: pode cancelar', (await order(c3.id)).status === 'cancelled');

// Recusas
const prep = await encomenda();
await svc(`update public.orders set delivery_status = 'preparing' where id = $1`, [prep.id], func);
await raises('a preparar: recusa', () => cancelar(prep.id), /a ser preparada ou a caminho/);
const env = await encomenda();
await svc(`update public.orders set delivery_status = 'in_transit' where id = $1`, [env.id], func);
await raises('a caminho: recusa', () => cancelar(env.id), /a ser preparada ou a caminho/);
const ent = await encomenda();
await svc(`update public.orders set delivery_status = 'delivered' where id = $1`, [ent.id], func);
await raises('entregue: recusa', () => cancelar(ent.id), /já foi entregue/);

const trf = await encomenda({ payment_method_code: 'transferencia', payment_method_name: 'Transferência' });
await svc(`select public.order_payment_report($1, 'TRF-123456')`, [trf.id]);
check('referência indicada: a aguardar confirmação', (await order(trf.id)).payment_status === 'awaiting_confirmation');
await raises('pagamento indicado: recusa (reembolso com a equipa)', () => cancelar(trf.id), /Indicou um pagamento/);

const paga = await encomenda({ payment_method_code: 'transferencia', payment_method_name: 'Transferência' });
await svc(`select public.order_payment_record($1, 1000::numeric, 'transferencia', 'TRF-PARTE')`, [paga.id], admin);
await raises('pagamento em parte: recusa', () => cancelar(paga.id), /já tem pagamento registado/);

await raises('encomenda inexistente', () => cancelar('nao-existe'), /não encontrada/);

// Quem pode chamar: só o servidor (a Edge Function confirma de quem é a encomenda).
const c4 = await encomenda();
await raises('o cliente não chama a função directamente', () => as('authenticated', cliente, `select public.order_cancel_by_customer($1, '')`, [c4.id]), /permission denied/);
await raises('um visitante também não', () => as('anon', null, `select public.order_cancel_by_customer($1, '')`, [c4.id]), /permission denied/);
check('…e a encomenda continua activa', (await order(c4.id)).status === 'pending');

// --- 3. Tipo de aviso novo ----------------------------------------------------------------
await q(`insert into public.staff_notifications (staff_id, kind, title, body, order_id) values ($1, 'order_cancelled', 'Cancelada pelo cliente', '—', $2)`, [admin, c1.id]);
check('aviso order_cancelled aceite', true);
for (const kind of ['security', 'colporteur_application', 'colporteur_delivery', 'new_order', 'payment_reported']) {
  await q(`insert into public.staff_notifications (staff_id, kind, title, body) values ($1, $2, 't', 'b')`, [admin, kind]);
  check(`os tipos anteriores continuam (${kind})`, true);
}
await raises('tipo desconhecido recusado', () => q(`insert into public.staff_notifications (staff_id, kind, title, body) values ($1, 'inventado', 't', 'b')`, [admin]), /staff_notifications_kind_check/);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
