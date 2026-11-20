// Checkout (place_order): o total que o cliente viu e os bloqueios por ordem fixa
// (migração checkout_bloqueios_e_total):
//   PGLITE_MODULE=… node scripts/pglite/checkout.mjs supabase/migrations
// Instruções em base.mjs.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const svc = (sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                         set_config('request.headers', '{}', true)`);
  await tx.exec('set local role service_role');
  return (await tx.query(sql, params)).rows;
});

await q(`insert into public.payment_methods (name, code, type, enabled) values ('Pagamento na Entrega', 'entrega', 'offline', true)`);
const [a] = await q(`insert into public.stock_books (title, price, stock) values ('Livro A', 5000, 50) returning id`);
const [b] = await q(`insert into public.stock_books (title, price, sale_price, stock) values ('Livro B', 9000, 7500, 50) returning id`);

let seq = 0;
const comprar = async (items, shipping = {}) => {
  seq++;
  const order = {
    order_number: `ENC-C${String(seq).padStart(3, '0')}`, customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente',
    phone: '923000000', payment_method_code: 'entrega', payment_method_name: 'Pagamento na Entrega',
    delivery_status: 'received', status: 'pending', shipping_method: 'delivery',
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify(items), JSON.stringify({ method: 'delivery', free_threshold: 20000, cost: 1500, express_cost: 0, ...shipping })]);
  return r.o;
};
const erro = async (fn) => {
  try { await fn(); return null; } catch (e) { return e; }
};
const stock = async (id) => Number((await q(`select stock from public.stock_books where id = $1`, [id]))[0].stock);

// 1. Sem total esperado (apps antigas): como antes ----------------------------------------------------
let o = await comprar([{ book_id: a.id, quantity: 1 }]);
check('sem expected_total, a encomenda entra como antes', Number(o.total) === 6500, o.total);

// 2. O total que o cliente viu bate certo --------------------------------------------------------------
o = await comprar([{ book_id: a.id, quantity: 1 }, { book_id: b.id, quantity: 1 }], { expected_total: 14000 });
check('com o total certo (5000 + 7500 + 1500), a encomenda entra', Number(o.total) === 14000, o.total);
o = await comprar([{ book_id: b.id, quantity: 1 }, { book_id: a.id, quantity: 1 }], { expected_total: '14000.00' });
check('a ordem dos livros no carrinho não muda nada (bloqueio por id)', Number(o.total) === 14000, o.total);

// 3. O total mudou entretanto ---------------------------------------------------------------------------
const antesA = await stock(a.id);
await q(`update public.stock_books set sale_price = null where id = $1`, [b.id]); // a promoção acabou
const e = await erro(() => comprar([{ book_id: a.id, quantity: 1 }, { book_id: b.id, quantity: 1 }], { expected_total: 14000 }));
check('total diferente: a compra pára', !!e);
check('a mensagem diz o total certo', /15\s?500/.test(e?.message || '') && /14\s?000/.test(e?.message || ''), e?.message);
check('o código é o que a Edge Function passa ao cliente (P0001)', e?.code === 'P0001', e?.code);
check('a pista traz o total para o carrinho confirmar', /^total_changed:15500(\.0+)?$/.test(e?.hint || ''), e?.hint);
check('o stock fica como estava (nada foi gravado)', (await stock(a.id)) === antesA, await stock(a.id));
o = await comprar([{ book_id: a.id, quantity: 1 }, { book_id: b.id, quantity: 1 }], { expected_total: 15500 });
check('confirmado o total novo, a encomenda entra', Number(o.total) === 15500, o.total);

// 4. Os portes contam no total --------------------------------------------------------------------------
const e2 = await erro(() => comprar([{ book_id: a.id, quantity: 1 }], { expected_total: 5000, cost: 2000 }));
check('portes mudados também param a compra', /total_changed:7000/.test(e2?.hint || ''), e2?.hint);
check('valor esquisito no total esperado é ignorado (apps antigas)', Number((await comprar([{ book_id: a.id, quantity: 1 }], { expected_total: 'abc' })).total) === 6500);

console.log(`\n${ok} cenários certos, ${fail} falhados`);
if (fail) process.exit(1);
