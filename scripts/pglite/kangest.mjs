// Cenários da ligação ao KanGest (migração 20261119120000_kangest), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kangest.mjs supabase/migrations
// Instruções em base.mjs e em docs/KANGEST.md.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (nome, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', nome, extra === undefined ? '' : JSON.stringify(extra)); }
};
const recusa = async (nome, fn, re) => {
  try { await fn(); fail++; console.log('FALHOU (devia recusar):', nome); }
  catch (e) { if (re && !re.test(e.message)) { fail++; console.log('FALHOU (mensagem):', nome, '→', e.message); } else ok++; }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const como = (role, sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const fila = async (order) => q(`select accao, estado from public.kangest_fila where order_id = $1 order by id`, [order]);
const stock = async (id) => Number((await q(`select stock from public.stock_books where id = $1`, [id]))[0].stock);
// Pagamento confirmado como o faz private.order_payments_sync: com app.payment_sync e payment_status no UPDATE
// (é assim que os gatilhos «of payment_status» correm).
const pagar = async (id) => db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set amount_paid = total, payment_status = payment_status where id = $1`, [id]);
});
const encomenda = async (numero, itens) => (await q(
  `insert into public.orders (order_number, customer_email, customer_name, items, total, shipping_method)
   values ($1, 'cliente@x.ao', 'Cliente', $2::jsonb, $3, 'pickup') returning id`,
  [numero, JSON.stringify(itens), itens.reduce((t, i) => t + i.price * i.quantity, 0)]))[0].id;

// --- lojas e um livro com a referência do KanGest -------------------------------------------------------
const [h] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [l] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Lubango', 'Huíla', 'Lubango', true) returning id`);
const [livro] = await q(`insert into public.stock_books (title, book_code, price, stock, active, kigest_ref) values ('O Desejado', 'LIV-901', 5700, 10, true, 'LIV-001') returning id`);
const [variantes] = await q(`insert into public.stock_books (title, book_code, price, stock, active, kigest_ref, versions)
  values ('Bíblia', 'LIV-902', 9000, 4, true, 'BIB-01', '[{"label":"Castanha","stock":4}]'::jsonb) returning id`);

// --- as tabelas só se lêem pelo servidor (service_role) --------------------------------------------------
for (const t of ['kangest_fila', 'kangest_stock', 'kangest_estado']) {
  await recusa(`${t}: o público não lê`, () => como('anon', null, `select * from public.${t}`), /permission denied/);
}
await recusa('kangest_recalcular_stock: só o servidor', () => como('authenticated', null, `select public.kangest_recalcular_stock('LIV-001')`), /permission denied/);

// --- antes de activar, nada vai para a fila ---------------------------------------------------------------
const antes = await encomenda('LIV-0001', [{ book_id: livro.id, quantity: 1, price: 5700 }]);
check('sem a ligação activa, as encomendas não vão para a fila', (await fila(antes)).length === 0);

await q(`insert into public.kangest_estado (chave, valor) values ('activo', 'true'::jsonb)`);

// --- encomenda → NE; pagamento → FR ------------------------------------------------------------------------
const o1 = await encomenda('LIV-0002', [{ book_id: livro.id, quantity: 2, price: 5700 }]);
check('encomenda nova: NE na fila', JSON.stringify(await fila(o1)) === JSON.stringify([{ accao: 'ne', estado: 'pendente' }]), await fila(o1));
await pagar(o1);
check('o pagamento confirmado passa a paid', (await q(`select payment_status from public.orders where id = $1`, [o1]))[0].payment_status === 'paid');
check('pagamento confirmado: FR na fila', (await fila(o1)).map((f) => f.accao).join() === 'ne,fr', await fila(o1));

// encomenda paga antes da activação: ao pagar, vai a NE e a FR
await pagar(antes);
check('encomenda de antes da activação: NE e FR ao pagar', (await fila(antes)).map((f) => f.accao).join() === 'ne,fr', await fila(antes));

// --- stock: o disponível dos armazéns online, menos as encomendas que ainda não chegaram ao KanGest ----------
await q(`insert into public.kangest_stock (ligacao, referencia, armazem_id, quantidade, reservado, disponivel, online, store_id) values
  ('central', 'LIV-001', 1, 9, 1, 8, true, $1), ('central', 'LIV-001', 2, 3, 0, 3, false, $2), ('central', 'BIB-01', 1, 7, 0, 7, true, $1)`, [h.id, l.id]);
await q(`select public.kangest_recalcular_stock('LIV-001'), public.kangest_recalcular_stock('BIB-01')`);
// 8 disponíveis online − 2 (LIV-0002) − 1 (LIV-0001), ainda sem NE no KanGest
check('stock à venda = disponível online − encomendas por reservar', await stock(livro.id) === 5, await stock(livro.id));
check('produto com variantes fica como está', await stock(variantes.id) === 4);
const marcas = await q(`select store_id, available from public.store_stock where book_id = $1 order by store_id`, [livro.id]);
check('«temos» nas duas lojas com disponível', marcas.length === 2 && marcas.every((m) => m.available), marcas);
await q(`update public.kangest_fila set estado = 'feito', resultado = '{"id": 50}'::jsonb where order_id in ($1, $2) and accao = 'ne'`, [o1, antes]);
await q(`select public.kangest_recalcular_stock('LIV-001')`);
check('com as NE no KanGest, deixam de se descontar à parte', await stock(livro.id) === 8, await stock(livro.id));
await q(`update public.kangest_stock set disponivel = 0 where armazem_id = 2`);
await q(`select public.kangest_recalcular_stock('LIV-001')`);
check('loja sem disponível: «não temos»', (await q(`select available from public.store_stock where book_id = $1 and store_id = $2`, [livro.id, l.id]))[0].available === false);

// --- cancelamento ---------------------------------------------------------------------------------------------
const o2 = await encomenda('LIV-0003', [{ book_id: livro.id, quantity: 1, price: 5700 }]);
await q(`update public.orders set status = 'cancelled' where id = $1`, [o2]);
check('cancelada antes de chegar ao KanGest: a NE fica de parte e não há anulação',
  JSON.stringify(await fila(o2)) === JSON.stringify([{ accao: 'ne', estado: 'ignorado' }]), await fila(o2));
const o3 = await encomenda('LIV-0004', [{ book_id: livro.id, quantity: 1, price: 5700 }]);
await q(`update public.kangest_fila set estado = 'feito', resultado = '{"id": 51}'::jsonb where order_id = $1`, [o3]);
await q(`update public.orders set status = 'cancelled' where id = $1`, [o3]);
check('cancelada com a NE no KanGest: anulação na fila', (await fila(o3)).map((f) => `${f.accao}:${f.estado}`).join() === 'ne:feito,anular:pendente', await fila(o3));

// --- reembolso depois de facturada: nota de crédito; cancelada já facturada: sem anulação da NE ----------------------
const o4 = await encomenda('LIV-0005', [{ book_id: livro.id, quantity: 1, price: 5700 }]);
await pagar(o4);
await q(`update public.kangest_fila set estado = 'feito', resultado = '{"id": 60}'::jsonb where order_id = $1`, [o4]);
await db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set amount_refunded = amount_paid, payment_status = payment_status where id = $1`, [o4]);
});
check('reembolsada depois da FR: nota de crédito na fila', (await fila(o4)).some((f) => f.accao === 'nc' && f.estado === 'pendente'), await fila(o4));
await q(`update public.orders set status = 'cancelled' where id = $1`, [o4]);
check('cancelada já facturada: não tenta anular a NE (a NC trata)', !(await fila(o4)).some((f) => f.accao === 'anular'), await fila(o4));

// --- documentos de uma encomenda e vendas ao balcão, só para a equipa / quem vê relatórios -------------------
const membro = (await q(`insert into auth.users (email, email_confirmed_at) values ('m@x.ao', now()) returning id`))[0].id;
await recusa('kangest_da_encomenda: só a equipa', () => como('authenticated', membro, `select public.kangest_da_encomenda($1)`, [o1]), /Sem permissão/);
await recusa('vendas_do_kangest: só quem vê os relatórios', () => como('authenticated', membro, `select * from public.vendas_do_kangest(2026)`), /Sem permissão/);
const admin = (await q(`insert into auth.users (email, email_confirmed_at) values ('a@x.ao', now()) returning id`))[0].id;
await q(`update public.profiles set role = 'admin' where id = $1`, [admin]);
const docs = (await como('authenticated', admin, `select public.kangest_da_encomenda($1) d`, [o1]))[0].d;
check('a equipa vê os documentos da encomenda', docs.ne?.estado === 'feito' && docs.fr?.estado === 'pendente', docs);
await q(`insert into public.kangest_vendas (ligacao, store_id, ano, mes, canal, total, docs) values
  ('central', $1, 2026, 10, 'balcao', 1000, 3), ('central', $2, 2026, 10, 'balcao', 500, 1), ('central', $1, 2026, 10, 'api', 99, 1)`, [h.id, l.id]);
const vendas = await como('authenticated', admin, `select store_id, mes, total::float8 total from public.vendas_do_kangest(2026) order by total desc`);
check('vendas ao balcão por loja e mês', vendas.length === 2 && vendas[0].total === 1000, vendas);
check('membro sem permissão não lê kangest_vendas', (await como('authenticated', membro, `select * from public.kangest_vendas`)).length === 0);

console.log(`kangest: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
