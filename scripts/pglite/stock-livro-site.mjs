// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// As encomendas do site no livro de stock (KANGEST ONE, fase B2; migração 20261126200000_stock_livro_site), com as
// migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/stock-livro-site.mjs supabase/migrations
// O que se confere: o checkout reserva no livro, na loja da encomenda; o cancelamento liberta; a FR do posto liberta e,
// depois dela, o cancelamento não liberta outra vez; um erro no livro nunca impede uma encomenda; o resumo do painel.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (nome, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', nome, extra === undefined ? '' : JSON.stringify(extra)); }
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
const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [a] = await q(`insert into public.stock_books (title, price, stock, kigest_ref) values ('O Desejado', 5000, 50, 'LIV-001') returning id`);
const [b] = await q(`insert into public.stock_books (title, price, stock) values ('Sem referência', 3000, 50) returning id`);

let seq = 0;
const comprar = async (items, extra = {}) => {
  seq++;
  const order = {
    order_number: `ENC-L${String(seq).padStart(3, '0')}`, customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente',
    phone: '923000000', payment_method_code: 'entrega', payment_method_name: 'Pagamento na Entrega',
    delivery_status: 'received', status: 'pending', shipping_method: 'delivery', ...extra,
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify(items), JSON.stringify({ method: 'delivery', free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const livro = async (numero) => q(`select tipo, referencia, book_id, store_id, quantidade::numeric q, origem from public.stock_movimentos where documento = $1 order by id`, [numero]);
const soma = async (numero) => Number((await q(`select coalesce(sum(quantidade), 0)::numeric s from public.stock_movimentos where documento = $1`, [numero]))[0].s);

// --- o checkout reserva --------------------------------------------------------------------------------------------
const e1 = await comprar([{ book_id: a.id, quantity: 2 }, { book_id: b.id, quantity: 1 }], { store_id: loja.id });
const l1 = await livro(e1.order_number);
check('duas reservas, uma por linha', l1.length === 2 && l1.every((x) => x.tipo === 'reserva' && x.origem === 'site:checkout'), l1);
const ra = l1.find((x) => x.book_id === a.id);
check('a referência do KanGest e a quantidade com sinal', ra && ra.referencia === 'LIV-001' && Number(ra.q) === -2, ra);
check('sem referência, o id do produto', l1.find((x) => x.book_id === b.id)?.referencia === `livro:${b.id}`, l1);
const [comLoja] = await q(`select store_id from public.orders where order_number = $1`, [e1.order_number]);
check('na loja da encomenda', comLoja.store_id === loja.id && l1.every((x) => x.store_id === loja.id), { l1, comLoja });

// --- o cancelamento liberta ------------------------------------------------------------------------------------------
await q(`update public.orders set status = 'cancelled' where order_number = $1`, [e1.order_number]);
const l1c = await livro(e1.order_number);
check('o cancelamento liberta as duas', l1c.filter((x) => x.tipo === 'libertacao').length === 2 && (await soma(e1.order_number)) === 0, l1c);

// --- a FR do posto liberta, e o cancelamento depois não liberta outra vez -----------------------------------------
const posto = (await q(`select public.kangest_posto_criar('Caixa do Huambo', $1, 'r-site-1', null) id`, [loja.id]))[0].id;
const e2 = await comprar([{ book_id: a.id, quantity: 3 }]);
const [o2] = await q(`select id from public.orders where order_number = $1`, [e2.order_number]);
await q(`insert into public.kangest_fila (order_id, accao, estado, posto_id) values ($1, 'fr', 'pendente', $2)
         on conflict (order_id, accao) do update set estado = 'pendente', posto_id = excluded.posto_id`, [o2.id, posto]);
check('antes da FR, a reserva está aberta', (await soma(e2.order_number)) === -3);
await q(`update public.kangest_fila set estado = 'feito' where order_id = $1 and accao = 'fr'`, [o2.id]);
check('a FR do posto liberta (a saída passa a ser a venda dele)', (await soma(e2.order_number)) === 0, await livro(e2.order_number));
await q(`update public.orders set status = 'cancelled' where order_number = $1`, [e2.order_number]);
const l2 = await livro(e2.order_number);
check('o cancelamento depois da FR não liberta outra vez', l2.filter((x) => x.tipo === 'libertacao').length === 1 && (await soma(e2.order_number)) === 0, l2);

// --- uma FR sem posto (a ligação antiga) não liberta ------------------------------------------------------------------
const e3 = await comprar([{ book_id: a.id, quantity: 1 }]);
const [o3] = await q(`select id from public.orders where order_number = $1`, [e3.order_number]);
await q(`insert into public.kangest_fila (order_id, accao, estado) values ($1, 'fr', 'pendente') on conflict (order_id, accao) do update set estado = 'pendente', posto_id = null`, [o3.id]);
await q(`update public.kangest_fila set estado = 'feito' where order_id = $1 and accao = 'fr'`, [o3.id]);
check('sem posto, a reserva fica (a venda não chega pelo livro do posto)', (await soma(e3.order_number)) === -1);

// --- o resumo do painel ------------------------------------------------------------------------------------------------
const [res] = await svc(`select * from public.stock_livro_site_resumo()`);
check('uma reserva aberta, de uma unidade e uma encomenda', Number(res.reservas_abertas) === 1 && Number(res.unidades) === 1 && Number(res.encomendas) === 1, res);
// entregue pelo próprio site (sem posto): a reserva fica no livro como a saída, mas deixa de estar «em curso»
await q(`update public.orders set delivery_status = 'delivered' where order_number = $1`, [e3.order_number]);
const [res2] = await svc(`select * from public.stock_livro_site_resumo()`);
check('a entregue já não conta como reserva em curso', Number(res2.reservas_abertas) === 0 && Number(res2.encomendas) === 0, res2);
check('e o livro guarda a saída dela', (await soma(e3.order_number)) === -1);

// --- um erro no livro nunca impede uma encomenda ----------------------------------------------------------------------
await q(`alter table public.stock_movimentos add constraint teste_falha check (referencia <> 'LIV-001') not valid`);
const e4 = await comprar([{ book_id: a.id, quantity: 1 }]);
check('a encomenda passa mesmo com o livro a recusar', !!e4?.order_number && (await livro(e4.order_number)).length === 0, e4);
await q(`update public.orders set status = 'cancelled' where order_number = $1`, [e4.order_number]);
check('e o cancelamento também', (await q(`select status from public.orders where order_number = $1`, [e4.order_number]))[0].status === 'cancelled');
await q(`alter table public.stock_movimentos drop constraint teste_falha`);

console.log(`stock-livro-site: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
