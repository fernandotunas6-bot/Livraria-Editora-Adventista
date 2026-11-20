// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários das edições digitais à venda (migração edicoes_digitais), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/edicoes.mjs supabase/migrations
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
const as = (sub, sql, params = []) => db.transaction(async (tx) => {
  const role = sub ? 'authenticated' : 'anon';
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = $3 where id = $1`, [u.id, role, permissions]);
  return u.id;
};

const admin = await user('admin@loja.ao', 'admin');
const caixa = await user('caixa@loja.ao', 'manager', { manage_orders: true, confirm_payments: true });
const maria = await user('maria@exemplo.ao');
const joao = await user('joao@exemplo.ao');

await q(`insert into public.payment_methods (name, code, type, enabled) values
  ('Transferência Bancária', 'transferencia', 'transfer', true), ('Pagamento na Entrega', 'entrega', 'offline', true)`);

// O Desejado: impresso (0, com stock próprio) e edição digital (1).
const [livro] = await q(`insert into public.stock_books (title, price, stock, versions) values
  ('O Desejado', 6000, 5, '[{"label":"Impresso","format":"Capa mole","price":"","stock":"5","isbn":""},
                           {"label":"Edição digital","format":"PDF","price":"3000","stock":"","isbn":"","digital":true}]')
  returning id`);
// Revista só em PDF: produto digital, sem variantes e sem stock.
const [revista] = await q(`insert into public.stock_books (title, price, stock, digital) values ('Revista em PDF', 1200, 0, true) returning id`);
// Bíblia impressa.
const [biblia] = await q(`insert into public.stock_books (title, price, stock) values ('Bíblia de Estudo', 15000, 10) returning id`);
// Hinário com a edição digital marcada, mas sem o PDF carregado.
const [hinario] = await q(`insert into public.stock_books (title, price, stock, versions) values
  ('Hinário', 4000, 3, '[{"label":"Impresso","price":"","stock":""},{"label":"Edição digital","format":"PDF","price":"2000","digital":true}]')
  returning id`);
const [pdfLivro] = await q(`insert into public.downloads (title, access, book_id, variant, file_path, file_name, published)
  values ('O Desejado (PDF)', 'paid', $1, 1, 'files/desejado.pdf', 'desejado.pdf', true) returning id`, [livro.id]);
const [pdfRevista] = await q(`insert into public.downloads (title, access, book_id, file_path, file_name, published)
  values ('Revista de Novembro (PDF)', 'paid', $1, 'files/revista.pdf', 'revista.pdf', true) returning id`, [revista.id]);
await q(`insert into public.downloads (title, access, book_id, variant, file_path, file_name, published)
  values ('Hinário (PDF, rascunho)', 'paid', $1, 1, 'files/hinario.pdf', 'hinario.pdf', false)`, [hinario.id]);

let seq = 0;
const encomenda = async ({ customer = maria, email = 'maria@exemplo.ao', items, method = 'delivery', extra = {} }) => {
  seq++;
  const order = {
    order_number: `ENC-E${String(seq).padStart(3, '0')}`, customer_email: email, customer_name: 'Maria Lopes',
    customer_id: customer, phone: '923000000', payment_method_code: 'transferencia', payment_method_name: 'Transferência Bancária',
    delivery_status: 'received', status: 'pending', shipping_method: method,
    delivery_province: 'Luanda', delivery_municipality: 'Belas', delivery_street: 'Rua 1', delivery_address_full: 'Rua 1, Belas',
    ...extra,
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify(items), JSON.stringify({ method, free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const rpc = async (fn, args, actor = caixa) => (await svc(`select ${fn} as r`, args, actor))[0].r;
const pode = async (who, id) => (await as(who, `select private.can_download($1) as ok`, [id]))[0].ok;
const order = async (id) => (await q(`select * from public.orders where id = $1`, [id]))[0];
const book = async (id) => (await q(`select stock, sales_count, versions, stock_alert, stock_low from public.stock_books where id = $1`, [id]))[0];
const avisos = async (orderId) => (await q(`select title, body from public.customer_notifications where order_id = $1 order by created_at, id`, [orderId]));
const digital = [{ book_id: livro.id, quantity: 3, variant: 1 }];

// --- 1. Só edições digitais: sem envio, sem stock --------------------------------------------
const antes = await book(livro.id);
const o1 = await encomenda({ items: digital, method: 'delivery' });
check('só digital: o envio passa a "digital", mesmo que o site mande outro', o1.shipping_method === 'digital', o1.shipping_method);
check('só digital: sem portes, o total é o da edição', Number(o1.shipping_cost) === 0 && Number(o1.total) === 3000, { s: o1.shipping_cost, t: o1.total });
check('só digital: quantidade 1 (o livro fica na conta)', o1.items[0].quantity === 1 && o1.items[0].digital === true, o1.items);
check('só digital: sem morada', !o1.delivery_address_full && !o1.delivery_street && !o1.delivery_province && !o1.pickup_store, o1);
const depois = await book(livro.id);
check('só digital: o stock não mexe (nem o do produto nem o da impressa)', depois.stock === antes.stock && depois.versions[0].stock === '5', depois);
check('só digital: conta nas vendas', depois.sales_count === (antes.sales_count || 0) + 1, depois);
const av1 = await avisos(o1.id);
check('o cliente sabe logo como abre o livro', av1[0]?.title === 'Encomenda recebida' && /abre na sua biblioteca assim que o pagamento for confirmado/.test(av1[0]?.body), av1);
const equipa = await q(`select kind, title, body from public.staff_notifications where order_id = $1`, [o1.id]);
check('a equipa recebe "Nova encomenda digital" (sem "assumir")', equipa.length > 0 && equipa.every((n) => n.kind === 'new_order' && n.title === `Nova encomenda digital ${o1.order_number}` && /sem envio/.test(n.body)), equipa);

// --- 2. O que não se pode comprar -----------------------------------------------------------
await raises('sem conta: entrar primeiro', () => encomenda({ customer: null, items: digital }), /Entre na sua conta para comprar a edição digital de O Desejado/);
await raises('sem o PDF publicado: ainda não está à venda', () => encomenda({ items: [{ book_id: hinario.id, quantity: 1, variant: 1 }] }), /A edição digital de Hinário ainda não está disponível/);
await raises('a mesma edição digital duas vezes no carrinho', () => encomenda({ items: [digital[0], digital[0]] }), /está repetida no carrinho/);
await raises('impressos com envio "digital"', () => encomenda({ items: [{ book_id: biblia.id, quantity: 1 }, digital[0]], method: 'digital' }), /precisam de entrega ou levantamento/);
await raises('produto digital sem variantes, comprado como edição de outro', () => encomenda({ items: [{ book_id: revista.id, quantity: 1, variant: 0 }] }), /Variante indisponível/);

// --- 3. Pago: fica concluída e o livro abre --------------------------------------------------
check('por pagar: fechado, recebida e pendente', !(await pode(maria, pdfLivro.id)) && o1.delivery_status === 'received' && o1.status === 'pending');
await rpc(`public.order_payment_report($1, $2)`, [o1.id, 'TRF-445566'], null);
check('pagamento indicado: ainda recebida', (await order(o1.id)).delivery_status === 'received');
const pago = await rpc(`public.order_payment_record($1, 3000)`, [o1.id]);
const p1 = await order(o1.id);
check('paga: entregue e concluída', p1.payment_status === 'paid' && p1.delivery_status === 'delivered' && p1.status === 'delivered', { p: p1.payment_status, d: p1.delivery_status, s: p1.status });
check('paga: abre', await pode(maria, pdfLivro.id));
const ultimo = p1.delivery_timeline[p1.delivery_timeline.length - 1];
check('linha do tempo: "Na biblioteca", sem local', ultimo.status === 'delivered' && ultimo.title === 'Na biblioteca' && ultimo.location === '' && /biblioteca/.test(ultimo.description), ultimo);
const av2 = (await avisos(o1.id)).map((a) => a.title);
check('avisos: pagamento confirmado e livro disponível', av2.includes('Pagamento confirmado') && av2.includes('Livro digital disponível'), av2);
check('avisos: nenhum de entrega ("Encomenda entregue")', !av2.includes('Encomenda entregue') && av2.filter((t) => t === 'Encomenda recebida').length === 1, av2);
check('quem confirmou o pagamento assumiu a encomenda', !!p1.acknowledged_at);

// --- 4. Já é seu ------------------------------------------------------------------------------
await raises('já comprou: está na biblioteca', () => encomenda({ items: digital }), new RegExp(`Já comprou a edição digital de O Desejado \\(encomenda ${o1.order_number}\\)`));
const oJoao = await encomenda({ customer: joao, email: 'joao@exemplo.ao', items: digital });
check('outra pessoa compra a mesma edição', oJoao.shipping_method === 'digital');

// --- 5. Sem passos de envio -------------------------------------------------------------------
await raises('preparar uma encomenda digital', () => svc(`update public.orders set delivery_status = 'preparing' where id = $1`, [oJoao.id], admin), /não tem envio/);
await raises('enviar uma encomenda digital', () => svc(`update public.orders set delivery_status = 'shipped' where id = $1`, [oJoao.id], admin), /não tem envio/);
await raises('marcar como enviada pelo estado geral', () => svc(`update public.orders set status = 'shipped' where id = $1`, [oJoao.id], admin), /não tem envio/);
await raises('entregar à mão sem pagamento', () => svc(`update public.orders set delivery_status = 'delivered' where id = $1`, [oJoao.id], admin), /conclui|concluída sozinha/);
await svc(`update public.orders set delivery_status = 'confirmed' where id = $1`, [oJoao.id], admin);
check('confirmar (assumir) continua possível', (await order(oJoao.id)).delivery_status === 'confirmed');

// --- 6. Pagamento anulado e reembolso ------------------------------------------------------
await rpc(`public.order_payment_void($1::uuid, 'Transferência devolvida pelo banco')`, [pago.payment_id]);
const v1 = await order(o1.id);
check('pagamento anulado: volta a esperar pelo pagamento', v1.payment_status !== 'paid' && v1.delivery_status === 'received' && v1.status === 'pending', { p: v1.payment_status, d: v1.delivery_status, s: v1.status });
check('pagamento anulado: fecha', !(await pode(maria, pdfLivro.id)));
const ev = v1.delivery_timeline[v1.delivery_timeline.length - 1];
check('linha do tempo: "A aguardar o pagamento"', ev.title === 'A aguardar o pagamento', ev);
await rpc(`public.order_payment_record($1, 3000)`, [o1.id]);
check('paga outra vez: concluída e aberta', (await order(o1.id)).delivery_status === 'delivered' && await pode(maria, pdfLivro.id));
await rpc(`public.order_refund_record($1, 3000::numeric, 'transferencia', 'DEV-9', null, '', 'Cliente desistiu da compra')`, [o1.id]);
const r1 = await order(o1.id);
check('reembolsada: continua concluída, mas fecha', r1.payment_status === 'refunded' && r1.delivery_status === 'delivered' && !(await pode(maria, pdfLivro.id)), { p: r1.payment_status, d: r1.delivery_status });

// --- 7. Cancelar não devolve ao stock o que não saiu dele -----------------------------------
const s0 = await book(livro.id);
await svc(`update public.orders set status = 'cancelled' where id = $1`, [oJoao.id], admin);
const s1 = await book(livro.id);
check('cancelada: o stock fica igual, as vendas descontam', s1.stock === s0.stock && s1.versions[0].stock === s0.versions[0].stock && s1.sales_count === s0.sales_count - 1, { s0, s1 });

// --- 8. Impressos e digitais na mesma encomenda ----------------------------------------------
const b0 = await book(biblia.id);
const l0 = await book(livro.id);
const mista = await encomenda({ items: [{ book_id: biblia.id, quantity: 1 }, { book_id: revista.id, quantity: 4 }, { book_id: livro.id, quantity: 1, variant: 0 }] });
check('mista: o envio é o dos impressos', mista.shipping_method === 'delivery' && !!mista.delivery_address_full);
const equipaMista = await q(`select title from public.staff_notifications where order_id = $1`, [mista.id]);
check('mista: a equipa recebe a encomenda para assumir, como antes', equipaMista.length > 0 && equipaMista.every((n) => n.title === `Nova encomenda ${mista.order_number} — assumir`), equipaMista);
// 15 000 + 6 000 impressos = 21 000 (portes grátis); a revista (1 200) não conta, nem para baixo nem para cima.
check('mista: os portes contam só os impressos', Number(mista.shipping_cost) === 0 && Number(mista.total) === 22200, { s: mista.shipping_cost, t: mista.total });
check('mista: a revista vai com quantidade 1 e marcada digital', mista.items[1].quantity === 1 && mista.items[1].digital === true && mista.items[0].digital === undefined, mista.items);
const b1 = await book(biblia.id);
const l1 = await book(livro.id);
check('mista: sai do stock só o impresso', b1.stock === b0.stock - 1 && l1.stock === l0.stock - 1 && l1.versions[0].stock === 4, { b1, l1 });
const mista2 = await encomenda({ customer: joao, email: 'joao@exemplo.ao', items: [{ book_id: livro.id, quantity: 1, variant: 0 }, { book_id: revista.id, quantity: 1 }] });
// 6 000 impressos < 20 000: paga portes, embora com a revista o carrinho valha mais.
check('mista: abaixo do limite dos portes grátis pelos impressos', Number(mista2.shipping_cost) === 1500 && Number(mista2.total) === 8700, { s: mista2.shipping_cost, t: mista2.total });
await rpc(`public.order_payment_record($1, $2::numeric)`, [mista.id, mista.total]);
const m1 = await order(mista.id);
check('mista paga: a revista abre, mas a entrega continua por fazer', await pode(maria, pdfRevista.id) && m1.delivery_status === 'received', m1.delivery_status);
await svc(`update public.orders set delivery_status = 'shipped' where id = $1`, [mista.id], admin);
check('mista: tem passos de envio', (await order(mista.id)).delivery_status === 'shipped');
const r0 = await book(revista.id);
await svc(`update public.orders set status = 'cancelled' where id = $1`, [mista2.id], admin);
const l2 = await book(livro.id);
const r2 = await book(revista.id);
check('mista cancelada: o impresso volta ao stock, a revista não', l2.stock === l1.stock && l2.versions[0].stock === 4 && r2.stock === r0.stock, { l1, l2, r0, r2 });

// --- 9. O produto só digital não fica "Esgotado" ---------------------------------------------
const rev = await book(revista.id);
check('produto digital sem stock: não é "Esgotado"', rev.stock === 0 && rev.stock_alert === false && rev.stock_low === false, rev);
await q(`update public.stock_books set stock = 0 where id = $1`, [biblia.id]);
check('o impresso sem stock continua "Esgotado"', (await book(biblia.id)).stock_alert === true);
await q(`update public.stock_books set stock = 0 where id = $1`, [livro.id]);
check('impresso + digital sem stock: "Esgotado" (há o impresso para repor)', (await book(livro.id)).stock_alert === true);
const [soDigital] = await q(`insert into public.stock_books (title, price, stock, versions) values
  ('Lição em PDF', 900, 0, '[{"label":"PDF","digital":true},{"label":"ePub","digital":"true"}]') returning id`);
check('todas as edições digitais: não é "Esgotado"', (await book(soDigital.id)).stock_alert === false);
const [regra] = await q(`select private.item_digital(b, 1) as d1, private.item_digital(b, 0) as d0, private.item_digital(b, null) as dn from public.stock_books b where id = $1`, [livro.id]);
check('item_digital: decide a variante', regra.d1 === true && regra.d0 === false && regra.dn === false, regra);

// --- 10. Métodos de pagamento: "Disponível para" aceita a edição digital ---------------------
await q(`update public.payment_methods set shipping_methods = array['digital', 'pickup'] where code = 'entrega'`);
check('método: aceita "digital"', (await q(`select shipping_methods from public.payment_methods where code = 'entrega'`))[0].shipping_methods.includes('digital'));
await raises('método: um envio que não existe', () => q(`update public.payment_methods set shipping_methods = array['correio'] where code = 'entrega'`), /payment_methods_shipping_methods_check/);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
