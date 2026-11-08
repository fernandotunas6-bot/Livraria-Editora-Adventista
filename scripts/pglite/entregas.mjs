// Cenários das entregas por colportor, com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/entregas.mjs supabase/migrations
// Instruções em base.mjs e em docs/COLPORTAGEM.md ("Entregas por colportor").
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
const asUser = (sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub]);
  await tx.exec('set local role authenticated');
  return (await tx.query(sql, params)).rows;
});
const user = async (email, role = 'member') => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2 where id = $1`, [u.id, role]);
  return u.id;
};

// Geografia: Luanda (Viana, Belas) e Huambo.
await q(`insert into public.angola_provinces (id, name, slug) values ('luanda', 'Luanda', 'luanda'), ('huambo', 'Huambo', 'huambo')`);
await q(`insert into public.angola_municipalities (id, name, province) values ('viana', 'Viana', 'luanda'), ('belas', 'Belas', 'luanda'), ('huambo-m', 'Huambo', 'huambo')`);

const admin = await user('admin@loja.ao', 'admin');
const cliente = await user('cliente@exemplo.ao');
const perfil = {};
const colportor = async (code, nome, mun, prov, lat = null, lng = null) => {
  const pid = await user(`${code.toLowerCase()}@colportor.ao`);
  perfil[code] = pid;
  const [c] = await q(`insert into public.colporteurs (code, full_name, phone, status, profile_id, municipality_id, province_id, latitude, longitude)
    values ($1, $2, $3, 'activo', $4, $5, $6, $7, $8) returning id`,
  [code, nome, `92300${String(Object.keys(perfil).length).padStart(4, '0')}`, pid, mun, prov, lat, lng]);
  return c.id;
};
// Cliente em Viana (-8.90, 13.37). A: a 2 km, com os livros. B: Viana, sem GPS. C: a ~40 km (Belas).
// D: no Huambo.
const A = await colportor('CPT-0001', 'Ana Colportora', 'viana', 'luanda', -8.885, 13.37);
const B = await colportor('CPT-0002', 'Bento Colportor', 'viana', 'luanda');
const C = await colportor('CPT-0003', 'Carla Colportora', 'belas', 'luanda', -9.25, 13.25);
const D = await colportor('CPT-0004', 'Duarte Colportor', 'huambo-m', 'huambo', -12.77, 15.73);

await q(`insert into public.payment_methods (name, code, type, enabled) values ('Transferência', 'transferencia', 'transfer', true), ('Pagamento na Entrega', 'entrega', 'offline', true)`);
const [livro] = await q(`insert into public.stock_books (title, price, stock) values ('Livro A', 5000, 100) returning id`);
// A tem 5 livros à consignação (guia de entrega).
await q(`insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price) values ($1, $2, 5, 'entrega', 5000)`, [A, livro.id]);
await q(`insert into public.colporteur_ledger (colporteur_id, kind, amount, description) values ($1, 'entrega', 25000, 'GUI-0001')`, [A]);

let seq = 0;
const encomenda = async (extra = {}, qtd = 2) => {
  seq++;
  const method = extra.shipping_method || 'delivery';
  const order = {
    order_number: `ENC-E${seq}`, customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente Teste', customer_id: cliente,
    phone: '923000000', payment_method_code: 'transferencia', payment_method_name: 'Transferência', delivery_status: 'received',
    status: 'pending', shipping_method: method, delivery_province_id: 'luanda', delivery_province: 'Luanda',
    delivery_municipality_id: 'viana', delivery_municipality: 'Viana', delivery_locality: 'Zango',
    delivery_street: 'Rua 1', delivery_address_full: 'Rua 1, Zango, Viana, Luanda', delivery_gps_lat: -8.90, delivery_gps_lng: 13.37,
    ...extra,
  };
  const [r] = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`,
    [JSON.stringify(order), JSON.stringify([{ book_id: livro.id, quantity: qtd }]), JSON.stringify({ method, free_threshold: 20000, cost: 1500, express_cost: 0 })]);
  return r.o;
};
const pagar = (o) => svc(`select public.order_payment_record($1, $2::numeric, 'transferencia', $3)`, [o.id, o.total, `TRF-${o.order_number}`], admin);
const ofertas = (o) => q(`select d.*, c.code from public.colporteur_deliveries d join public.colporteurs c on c.id = d.colporteur_id where order_id = $1 order by offered_at, d.id`, [o.id]);
const activa = async (o) => (await ofertas(o)).find((d) => ['offered', 'accepted'].includes(d.status));
const order = async (id) => (await q(`select * from public.orders where id = $1`, [id]))[0];
const respond = (d, code, accept, reason = '') => svc(`select public.colporteur_delivery_respond($1::uuid, $2::uuid, $3, $4) as r`, [d.id, perfil[code], accept, reason]).then((x) => x[0].r);
const step = (d, code, s, extra = {}) => svc(`select public.colporteur_delivery_step($1::uuid, $2::uuid, $3, $4, $5, $6, $7) as r`,
  [d.id, perfil[code], s, extra.name || '', extra.bi || '', extra.sig || '', extra.reason || '']).then((x) => x[0].r);
const SIG = 'data:image/png;base64,iVBORw0KGgo=';

// 1. Paga → oferta ao mais perto por GPS, com os livros --------------------------------------
const o1 = await encomenda();
check('por pagar: nada oferecido', (await ofertas(o1)).length === 0);
await pagar(o1);
let d = await activa(o1);
check('paga: oferecida ao colportor a 2 km', d?.code === 'CPT-0001' && d.match_level === 'gps' && Number(d.distance_km) < 3, d);
check('a oferta sabe que ele tem os livros e leva os portes', d.has_stock === true && Number(d.fee) === 1500, d);
const aviso = await q(`select title, body, href from public.customer_notifications where customer_id = $1 and kind = 'colportagem'`, [perfil['CPT-0001']]);
check('aviso ao colportor, com o sítio, os portes e o prazo', aviso.length === 1 && /Viana/.test(aviso[0].body) && /1 500 Kz/.test(aviso[0].body) && /Aceite até/.test(aviso[0].body), aviso);
const minhaAntes = (await asUser(perfil['CPT-0001'], `select public.colporteur_my_deliveries() as m`))[0].m;
check('antes de aceitar, o colportor não vê os dados do cliente', minhaAntes.deliveries[0].customer === null, minhaAntes.deliveries[0]);

// 2. Recusa → o seguinte (mesmo município, sem GPS) → prazo esgotado → GPS a 40 km → equipa ----
let r = await respond(d, 'CPT-0001', false, 'Estou fora da cidade');
check('recusou: passa ao seguinte', r.status === 'declined' && r.next === 'offered', r);
d = await activa(o1);
check('o seguinte é o do mesmo município', d?.code === 'CPT-0002' && d.match_level === 'municipio', d);
await q(`update public.colporteur_deliveries set expires_at = now() - interval '1 minute' where id = $1`, [d.id]);
const tick = (await q(`select private.colporteur_deliveries_tick() as n`))[0].n;
d = await activa(o1);
check('prazo esgotado: o agendador passa ao seguinte, por GPS a 40 km', tick >= 1 && d?.code === 'CPT-0003' && d.match_level === 'gps', d);
r = await respond(d, 'CPT-0003', false);
check('ninguém mais (o do Huambo fica de fora): passa à equipa', r.next === 'loja' && (await order(o1.id)).delivery_route === 'loja', r);
const staffAviso = await q(`select title, body from public.staff_notifications where kind = 'colporteur_delivery' and order_id = $1`, [o1.id]);
check('a equipa é avisada de que entrega ela', staffAviso.some((n) => /Entrega pela equipa/.test(n.title) && /Nenhum dos 3/.test(n.body)), staffAviso);
check('nunca o mesmo colportor duas vezes', new Set((await ofertas(o1)).map((x) => x.code)).size === 3);

// 3. Aceita com os livros: sai logo, entrega com assinatura, portes e guia de devolução -------------
const o2 = await encomenda();
await pagar(o2);
d = await activa(o2);
await raises('outro colportor não responde à oferta dela', () => respond(d, 'CPT-0002', true), /não é sua/);
r = await respond(d, 'CPT-0001', true);
let o2n = await order(o2.id);
check('aceite do stock dela; a encomenda fica confirmada e com ela', r.source === 'stock' && o2n.delivery_status === 'confirmed' && o2n.delivery_colporteur_id === A && o2n.delivery_route === 'colportor', { r, s: o2n.delivery_status });
const minha = (await asUser(perfil['CPT-0001'], `select public.colporteur_my_deliveries() as m`))[0].m;
const aceite = minha.deliveries.find((x) => x.order_number === o2.order_number);
check('depois de aceitar vê o nome, telefone, morada e GPS do cliente', aceite.customer?.phone === '923000000' && aceite.customer?.gps?.lat === -8.9, aceite.customer);
await step(d, 'CPT-0001', 'out_for_delivery');
check('saiu para entrega', (await order(o2.id)).delivery_status === 'out_for_delivery');
await raises('entregar pede o nome de quem recebe', () => step(d, 'CPT-0001', 'delivered', { sig: SIG }), /nome de quem recebeu/);
await raises('entregar pede a assinatura', () => step(d, 'CPT-0001', 'delivered', { name: 'Maria' }), /assinatura/);
const stockAntes = (await q(`select stock from public.stock_books where id = $1`, [livro.id]))[0].stock;
await step(d, 'CPT-0001', 'delivered', { name: 'Maria Cliente', bi: '001234567LA041', sig: SIG });
o2n = await order(o2.id);
check('entregue, com quem recebeu e a assinatura', o2n.delivery_status === 'delivered' && o2n.delivery_recipient_name === 'Maria Cliente' && o2n.delivery_signature_data === SIG, o2n.delivery_status);
const conta = await q(`select kind, amount::numeric a from public.colporteur_ledger where colporteur_id = $1 order by id`, [A]);
check('portes na conta dela (a Livraria deve-lhe 1 500)', conta.some((l) => l.kind === 'taxa_entrega' && Number(l.a) === -1500), conta);
check('guia de devolução: os 2 livros deixam de lhe ser cobrados', conta.some((l) => l.kind === 'devolucao' && Number(l.a) === -10000), conta);
check('em mão: 5 − 2 = 3', (await q(`select private.colporteur_in_hand($1, $2) n`, [A, livro.id]))[0].n === 3);
check('o stock da loja recupera os 2 que tinha descontado', Number((await q(`select stock from public.stock_books where id = $1`, [livro.id]))[0].stock) === Number(stockAntes) + 2);
check('a entrega fica fechada com a guia e o movimento', (await q(`select status, document_id, ledger_id from public.colporteur_deliveries where id = $1`, [d.id]))[0].status === 'delivered');

// 4. Sem os livros: levanta na loja (a equipa marca), depois entrega ------------------------------
const o3 = await encomenda({}, 9); // 9 > 3 em mão: ela já não tem os livros
await pagar(o3);
d = await activa(o3);
check('sem os livros, a de GPS perto continua primeiro', d?.code === 'CPT-0001' && d.has_stock === false, d);
await respond(d, 'CPT-0001', false);
d = await activa(o3);
r = await respond(d, 'CPT-0002', true);
check('aceite com os livros da loja', r.source === 'loja', r);
check('a equipa recebe "Preparar para o colportor"', (await q(`select count(*)::int n from public.staff_notifications where order_id = $1 and title like 'Preparar para o colportor%'`, [o3.id]))[0].n >= 1);
await raises('não sai sem levantar os livros', () => step(d, 'CPT-0002', 'out_for_delivery'), /Levante primeiro/);
await svc(`select public.colporteur_delivery_handover($1::uuid)`, [d.id], admin);
check('a equipa entregou os livros: encomenda expedida', (await order(o3.id)).delivery_status === 'shipped');
await step(d, 'CPT-0002', 'delivered', { name: 'Maria', sig: SIG });
// 9 livros = 45 000 Kz: portes grátis para o cliente, por isso o colportor não ganha nada aqui
// (decisão do dono: fica com os portes).
check('entregue; envio grátis = sem portes para ele; sem guia', (await order(o3.id)).delivery_status === 'delivered'
  && Number(d.fee) === 0
  && (await q(`select count(*)::int n from public.colporteur_ledger where colporteur_id = $1 and kind = 'taxa_entrega'`, [B]))[0].n === 0
  && (await q(`select count(*)::int n from public.colporteur_ledger where colporteur_id = $1 and kind = 'devolucao'`, [B]))[0].n === 0);

// 5. Desistir, retirar, cancelar --------------------------------------------------------------------
const o4 = await encomenda();
await pagar(o4);
d = await activa(o4);
await respond(d, 'CPT-0001', true);
r = await step(d, 'CPT-0001', 'release', { reason: 'Fiquei doente' });
d = await activa(o4);
check('desistiu: passa ao seguinte e a encomenda deixa de ser dela', r.next === 'offered' && d?.code === 'CPT-0002' && (await order(o4.id)).delivery_colporteur_id === null, r);
await svc(`select public.colporteur_delivery_take_back($1::uuid, 'A equipa vai entregar hoje')`, [d.id], admin);
check('retirada pela equipa: entrega pela loja, sem novas ofertas', (await order(o4.id)).delivery_route === 'loja' && !(await activa(o4)));
const o5 = await encomenda();
await pagar(o5);
d = await activa(o5);
await svc(`update public.orders set status = 'cancelled' where id = $1`, [o5.id]);
check('cancelada: a oferta acaba e o colportor é avisado', (await q(`select status from public.colporteur_deliveries where id = $1`, [d.id]))[0].status === 'cancelled'
  && (await q(`select count(*)::int n from public.customer_notifications where order_id = $1 and title like 'Entrega cancelada%'`, [o5.id]))[0].n === 1);

// 6. O que não vai a colportores -------------------------------------------------------------------
const o6 = await encomenda({ payment_method_code: 'entrega', payment_method_name: 'Pagamento na Entrega' });
check('pagamento na entrega: fica com a loja (não está paga)', (await ofertas(o6)).length === 0);
const o7 = await encomenda({ shipping_method: 'pickup', pickup_store: 'Loja' });
await pagar(o7);
check('levantamento na loja: nunca vai a colportores', (await ofertas(o7)).length === 0);
await q(`update public.colporteur_settings set deliveries_enabled = false where id = 1`);
const o8 = await encomenda();
await pagar(o8);
check('desligado nas definições: nada oferecido', (await ofertas(o8)).length === 0);
await q(`update public.colporteur_settings set deliveries_enabled = true where id = 1`);
await q(`select private.colporteur_deliveries_tick()`);
check('voltou a ligar: o agendador oferece as pagas que ficaram para trás', !!(await activa(o8)));

// 6b. Mínimo por entrega, cliente que confirma antes do colportor, equipa que marca entregue ------------
await q(`update public.colporteur_settings set delivery_min_fee = 1000 where id = 1`);
const o9 = await encomenda({}, 5); // 25 000 Kz: envio grátis
await pagar(o9);
d = await activa(o9);
check('envio grátis com mínimo: a oferta leva o mínimo', Number(d.fee) === 1000, d);
check('o aviso diz quanto ganha', (await q(`select count(*)::int n from public.customer_notifications where order_id = $1 and body like '%Ganha 1 000 Kz%'`, [o9.id]))[0].n === 1);
await q(`update public.colporteur_settings set delivery_min_fee = 0 where id = 1`);
// O colportor (com os livros na mão) entrega; o cliente confirma no site antes de ele marcar.
await q(`insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price) values ($1, $2, 10, 'entrega', 5000)`, [d.colporteur_id, livro.id]);
const quem = Object.keys(perfil).find((k) => k === d.code);
r = await respond(d, quem, true);
check('aceite com os livros dele', r.source === 'stock', r);
await svc(`update public.orders set delivery_status = 'delivered', delivery_confirmed_at = now(), delivery_recipient_name = 'Cliente' where id = $1`, [o9.id]);
const d9 = (await q(`select * from public.colporteur_deliveries where id = $1`, [d.id]))[0];
check('o cliente confirmou primeiro: conta como entrega dele, com portes e guia', d9.status === 'delivered' && d9.document_id && d9.ledger_id, d9);
check('e ele é avisado', (await q(`select count(*)::int n from public.customer_notifications where order_id = $1 and title like 'Entrega confirmada%'`, [o9.id]))[0].n === 1);
// Oferecida mas não aceite, e a equipa marca entregue: a oferta fecha e o colportor é avisado.
const o10 = await encomenda();
await pagar(o10);
d = await activa(o10);
await svc(`update public.orders set delivery_status = 'delivered' where id = $1`, [o10.id]);
check('a equipa entregou: a oferta fecha', (await q(`select status from public.colporteur_deliveries where id = $1`, [d.id]))[0].status === 'released'
  && (await q(`select count(*)::int n from public.customer_notifications where order_id = $1 and title like 'Entrega fechada%'`, [o10.id]))[0].n === 1);

// O total baixa (a equipa tira os portes) e a encomenda fica paga sem pagamento novo: o estado muda
// dentro do gatilho dos pagamentos, sem a coluna no SET, e mesmo assim tem de ir a um colportor.
const o11 = await encomenda();
await svc(`select public.order_payment_record($1, $2::numeric, 'transferencia', $3)`, [o11.id, 10000, `TRF-${o11.order_number}`], admin);
check('paga em parte: nada oferecido', (await order(o11.id)).payment_status === 'partially_paid' && (await ofertas(o11)).length === 0, (await order(o11.id)).payment_status);
await svc(`update public.orders set shipping_cost = 0 where id = $1`, [o11.id]);
check('o total baixou e ficou paga: vai a um colportor', (await order(o11.id)).payment_status === 'paid' && !!(await activa(o11)), { p: (await order(o11.id)).payment_status, r: (await order(o11.id)).delivery_route });

// 6c. A encomenda deixa de estar paga com a entrega em curso ------------------------------------------
const codigo = async (id) => (await q(`select code from public.colporteurs where id = $1`, [id]))[0].code;
const devolver = (o, valor, ref) => svc(`select public.order_refund_record($1, $2::numeric, 'transferencia', $3, null, '', 'Cliente desistiu da compra')`, [o.id, valor, ref], admin);
const avisos = async (o, titulo) => (await q(`select count(*)::int n from public.customer_notifications where order_id = $1 and title like $2`, [o.id, titulo]))[0].n;
const avisosEquipa = async (o, titulo) => (await q(`select severity as priority, body from public.staff_notifications where order_id = $1 and title like $2`, [o.id, titulo]));
const o13 = await encomenda();
await pagar(o13);
const d13 = await activa(o13);
const c13 = await codigo(d13.colporteur_id);
await respond(d13, c13, true);
await devolver(o13, Number(o13.total), `DEV-${o13.order_number}`);
const d13b = (await q(`select * from public.colporteur_deliveries where id = $1`, [d13.id]))[0];
check('reembolsada com a entrega aceite: a entrega fecha', d13b.status === 'cancelled', d13b.status);
check('e a encomenda deixa de estar com o colportor', (await order(o13.id)).delivery_colporteur_id === null && (await order(o13.id)).delivery_route === '', await order(o13.id));
check('o colportor é avisado para não entregar', (await avisos(o13, 'Não entregue%')) === 1);
check('a equipa é avisada', (await avisosEquipa(o13, 'Entrega parada%')).length === 1);
await raises('reembolsada: o colportor já não entrega nem ganha os portes', () => step(d13, c13, 'delivered', { name: 'Maria', sig: 'data:image/png;base64,AAAA' }), /já não está consigo/);
check('sem portes na conta dele', (await q(`select count(*)::int n from public.colporteur_ledger where order_id = $1 and kind = 'taxa_entrega'`, [o13.id]))[0].n === 0);
const meus13 = (await asUser(perfil[c13], `select public.colporteur_my_deliveries() b`))[0].b;
check('e deixa de ver os dados do cliente', !meus13.deliveries.find((x) => x.id === d13.id)?.customer, meus13.deliveries.find((x) => x.id === d13.id));
await q(`select private.colporteur_deliveries_tick()`);
check('o agendador não volta a oferecer uma encomenda por pagar', !(await activa(o13)));
await svc(`select public.order_payment_record($1, $2::numeric, 'transferencia', $3)`, [o13.id, o13.total, `TRF2-${o13.order_number}`], admin);
if ((await order(o13.id)).payment_status === 'paid') {
  const d13c = await activa(o13);
  check('paga de novo: vai ao colportor seguinte, não ao mesmo', !d13c || d13c.colporteur_id !== d13.colporteur_id, d13c);
}
// Oferta ainda sem resposta.
const o14 = await encomenda();
await pagar(o14);
const d14 = await activa(o14);
await devolver(o14, Number(o14.total), `DEV-${o14.order_number}`);
check('reembolsada com a oferta à espera: a oferta fecha', (await q(`select status from public.colporteur_deliveries where id = $1`, [d14.id]))[0].status === 'cancelled' && !(await activa(o14)));
// Os livros da loja já estão com ele: a equipa tem de os recuperar.
await q(`update public.stock_books set stock = 500 where id = $1`, [livro.id]);
const o15 = await encomenda({}, 30); // mais do que qualquer um tem à consignação
await pagar(o15);
const d15 = await activa(o15);
const c15 = await codigo(d15.colporteur_id);
await respond(d15, c15, true);
const f15 = (await q(`select source from public.colporteur_deliveries where id = $1`, [d15.id]))[0].source;
if (f15 === 'loja') await svc(`select public.colporteur_delivery_handover($1::uuid)`, [d15.id], admin);
await devolver(o15, Number(o15.total), `DEV-${o15.order_number}`);
const e15 = await avisosEquipa(o15, 'Entrega parada%');
check('com os livros da loja na mão: a equipa recebe aviso urgente', f15 === 'loja' && e15.length === 1 && e15[0].priority === 'high' && /livros/.test(e15[0].body), { f15, e15 });
check('já expedida: fica com a equipa', (await order(o15.id)).delivery_route === 'loja', (await order(o15.id)).delivery_route);
// Entregue e reembolsada depois: a entrega foi feita e os portes ficam.
const o16 = await encomenda();
await pagar(o16);
const d16 = await activa(o16);
const c16 = await codigo(d16.colporteur_id);
await respond(d16, c16, true);
const f16 = (await q(`select source from public.colporteur_deliveries where id = $1`, [d16.id]))[0].source;
if (f16 === 'loja') await svc(`select public.colporteur_delivery_handover($1::uuid)`, [d16.id], admin);
await step(d16, c16, 'delivered', { name: 'Maria', sig: 'data:image/png;base64,AAAA' });
await devolver(o16, Number(o16.total), `DEV-${o16.order_number}`);
check('entregue e reembolsada depois: a entrega fica feita', (await q(`select status from public.colporteur_deliveries where id = $1`, [d16.id]))[0].status === 'delivered');

// 6d. O colportor deixa de estar activo com entregas em curso -----------------------------------------
const estado = (id, s) => asUser(admin, `select public.colporteur_set_status($1::uuid, $2, 'Motivo do teste')`, [id, s]);
const volta = async (id) => { await estado(id, 'activo'); };
const o17 = await encomenda();
await pagar(o17);
const d17 = await activa(o17);
await estado(d17.colporteur_id, 'suspenso');
const d17b = (await q(`select status from public.colporteur_deliveries where id = $1`, [d17.id]))[0];
const d17n = await activa(o17);
check('suspenso com uma oferta: fecha e passa logo ao seguinte', d17b.status === 'released' && (!d17n || d17n.colporteur_id !== d17.colporteur_id) && (d17n || (await order(o17.id)).delivery_route === 'loja'), { d17b, d17n });
await volta(d17.colporteur_id);
const o18 = await encomenda();
await pagar(o18);
const d18 = await activa(o18);
const c18 = await codigo(d18.colporteur_id);
await respond(d18, c18, true);
await estado(d18.colporteur_id, 'suspenso');
check('suspenso com uma aceite: a entrega fecha', (await q(`select status from public.colporteur_deliveries where id = $1`, [d18.id]))[0].status === 'released');
const meus18 = (await asUser(perfil[c18], `select public.colporteur_my_deliveries() b`))[0].b;
check('suspenso: deixa de ver os dados do cliente', !meus18.deliveries.find((x) => x.id === d18.id)?.customer, meus18.deliveries.find((x) => x.id === d18.id));
await raises('suspenso: já não marca passos', () => step(d18, c18, 'out_for_delivery'), /já não está consigo/);
check('a encomenda deixa de estar com ele', (await order(o18.id)).delivery_colporteur_id !== d18.colporteur_id);
check('ele é avisado', (await avisos(o18, 'Entrega retirada%')) === 1);
await volta(d18.colporteur_id);
const o19 = await encomenda({}, 30);
await pagar(o19);
const d19 = await activa(o19);
const c19 = await codigo(d19.colporteur_id);
await respond(d19, c19, true);
const f19 = (await q(`select source from public.colporteur_deliveries where id = $1`, [d19.id]))[0].source;
if (f19 === 'loja') await svc(`select public.colporteur_delivery_handover($1::uuid)`, [d19.id], admin);
await estado(d19.colporteur_id, 'inactivo');
const e19 = await avisosEquipa(o19, 'Recuperar a entrega%');
check('inactivo com os livros da loja: fica com a equipa, com aviso urgente', f19 === 'loja' && (await order(o19.id)).delivery_route === 'loja' && !(await activa(o19)) && e19.length === 1 && e19[0].priority === 'high', { f19, e19, r: (await order(o19.id)).delivery_route });
await volta(d19.colporteur_id);
// Conta desligada: no Huambo só há um colportor, por isso fica com a equipa.
const o20 = await encomenda({ delivery_province_id: 'huambo', delivery_province: 'Huambo', delivery_municipality_id: 'huambo-m', delivery_municipality: 'Huambo', delivery_locality: 'Centro', delivery_gps_lat: -12.77, delivery_gps_lng: 15.73 });
await pagar(o20);
const d20 = await activa(o20);
check('no Huambo a oferta vai ao colportor de lá', d20?.colporteur_id === D, d20);
await asUser(admin, `select public.colporteur_unlink_account($1::uuid, 'Conta errada')`, [D]);
check('conta desligada: a oferta fecha e fica com a equipa', (await q(`select status from public.colporteur_deliveries where id = $1`, [d20.id]))[0].status === 'released' && (await order(o20.id)).delivery_route === 'loja');

// 6e. A equipa expede com uma oferta à espera: não pode haver duas entregas ------------------------------
const o21 = await encomenda();
await pagar(o21);
const d21 = await activa(o21);
await svc(`update public.orders set delivery_status = 'shipped' where id = $1`, [o21.id]);
check('a equipa expediu: a oferta fecha e fica com a equipa', (await q(`select status from public.colporteur_deliveries where id = $1`, [d21.id]))[0].status === 'released' && (await order(o21.id)).delivery_route === 'loja', (await q(`select status from public.colporteur_deliveries where id = $1`, [d21.id]))[0]);
check('e o colportor é avisado', (await avisos(o21, 'Entrega fechada%')) === 1);
const c21 = await codigo(d21.colporteur_id);
await raises('o colportor já não a aceita', () => respond(d21, c21, true), /já não está à sua espera/);

// 6f. Uma falha a oferecer não trava o pagamento -----------------------------------------------------
const candidatos = (await q(`select pg_get_functiondef('private.delivery_candidates(text)'::regprocedure) d`))[0].d;
const avaria = (quando) => db.exec(`create or replace function private.delivery_candidates(p_order_id text)
  returns table (colporteur_id uuid, km double precision, level text, has_stock boolean)
  language plpgsql security definer set search_path = '' as $f$ begin
    if ${quando} then raise exception 'avaria de teste'; end if;
    return query select * from private._candidatos_ok(p_order_id);
  end $f$;`);
await db.exec(candidatos.replace('private.delivery_candidates(', 'private._candidatos_ok('));
await avaria('true');
const o22 = await encomenda();
await pagar(o22);
check('avaria ao oferecer: o pagamento fica registado', (await order(o22.id)).payment_status === 'paid', (await order(o22.id)).payment_status);
check('e não há oferta', !(await activa(o22)));
// O agendador volta a tentar, e uma encomenda com problema não pára as outras.
const o23 = await encomenda();
await pagar(o23);
await avaria(`p_order_id = '${o22.id}'`);
await q(`select private.colporteur_deliveries_tick()`);
check('o agendador oferece a boa, mesmo com outra em avaria', !!(await activa(o23)));
await db.exec(candidatos);
await q(`select private.colporteur_deliveries_tick()`);
check('sem a avaria, o agendador oferece a que ficou por oferecer', !!(await activa(o22)) || (await order(o22.id)).delivery_route === 'loja');

// 6g. A loja de levantamento -----------------------------------------------------------------------
await q(`insert into public.angola_provinces (id, name, slug) values ('benguela', 'Benguela', 'benguela'), ('huila', 'Huíla', 'huila') on conflict (id) do nothing`);
await q(`insert into public.angola_municipalities (id, name, province) values ('lubango', 'Lubango', 'huila'), ('catumbela', 'Catumbela', 'benguela') on conflict (id) do nothing`);
const [loja] = await q(`insert into public.physical_stores (name, province, address, hours, maps_url, active) values ('Loja Lubango', 'Huila', 'Rua da Sé', '8h-17h', 'https://maps.example/lubango', true) returning id`);
await q(`insert into public.physical_stores (name, province, address, active) values ('Loja Fechada', 'Luanda', 'Rua Fechada', false)`);
// Em Luanda não há loja activa: quem não tem os livros não pode levantar.
const o24 = await encomenda({}, 30);
await pagar(o24);
const nomes24 = (await ofertas(o24)).map((x) => x.status);
check('sem loja por perto e sem os livros: não recebe a oferta, vai logo para a equipa', nomes24.length === 0 && (await order(o24.id)).delivery_route === 'loja', { nomes24, r: (await order(o24.id)).delivery_route });
// No Lubango há loja (província escrita sem acento): a oferta diz qual.
const E = await colportor('CPT-0005', 'Eva Colportora', 'lubango', 'huila');
const o25 = await encomenda({ delivery_province_id: 'huila', delivery_province: 'Huíla', delivery_municipality_id: 'lubango', delivery_municipality: 'Lubango', delivery_locality: 'Centro', delivery_gps_lat: 0, delivery_gps_lng: 0 }, 30);
await pagar(o25);
const d25 = await activa(o25);
check('com loja na província dele: recebe a oferta', d25?.colporteur_id === E, d25);
check('a oferta guarda a loja', d25?.pickup_store_id === loja.id, d25);
const aviso25 = (await q(`select body from public.customer_notifications where order_id = $1 and title like 'Entrega para si%'`, [o25.id]))[0];
check('o aviso diz em que loja levanta', /Loja Lubango/.test(aviso25?.body || ''), aviso25);
const meus25 = (await asUser(perfil['CPT-0005'], `select public.colporteur_my_deliveries() b`))[0].b.deliveries.find((x) => x.id === d25.id);
check('a área dele mostra a loja, com morada e horário', meus25?.pickup_store?.name === 'Loja Lubango' && meus25.pickup_store.address === 'Rua da Sé' && meus25.pickup_store.hours === '8h-17h', meus25?.pickup_store);
await respond(d25, 'CPT-0005', true);
const prep25 = (await q(`select body from public.staff_notifications where order_id = $1 and title like 'Preparar para o colportor%'`, [o25.id]))[0];
check('a equipa sabe em que loja preparar', /Loja Lubango/.test(prep25?.body || ''), prep25);
const quadro25 = (await asUser(admin, `select public.colporteur_deliveries_board(30) b`))[0].b.active.find((x) => x.id === d25.id);
check('o quadro mostra a loja', quadro25?.pickup_store === 'Loja Lubango', quadro25);
const painel25 = (await asUser(admin, `select public.order_colporteur_deliveries($1) b`, [o25.id]))[0].b.deliveries.find((x) => x.id === d25.id);
check('o painel da encomenda mostra a loja', painel25?.pickup_store === 'Loja Lubango', painel25);
// Com os livros consigo não precisa de loja nenhuma, mesmo sem loja por perto.
await q(`delete from public.colporteur_stock_moves where colporteur_id = $1`, [B]);
await q(`insert into public.colporteur_stock_moves (colporteur_id, book_id, qty, kind, unit_price) values ($1, $2, 40, 'entrega', 5000)`, [B, livro.id]);
const o26 = await encomenda({}, 30);
await pagar(o26);
const d26 = await activa(o26);
check('com os livros consigo recebe a oferta, sem loja', d26?.colporteur_id === B && d26?.has_stock === true && d26?.pickup_store_id === null, d26);

// 6h. Encomenda com impressos e edição digital: o colportor só leva os impressos ----------------------
const [revista] = await q(`insert into public.stock_books (title, price, stock, digital) values ('Revista em PDF', 1200, 0, true) returning id`);
await q(`insert into public.downloads (title, access, book_id, file_path, file_name, published) values ('Revista', 'paid', $1, 'files/r.pdf', 'r.pdf', true)`, [revista.id]);
const mista = await svc(`select public.place_order($1::jsonb, $2::jsonb, $3::jsonb) as o`, [JSON.stringify({
  order_number: 'ENC-MISTA', customer_email: 'cliente@exemplo.ao', customer_name: 'Cliente Teste', customer_id: cliente, phone: '923000000',
  payment_method_code: 'transferencia', payment_method_name: 'Transferência', delivery_status: 'received', status: 'pending', shipping_method: 'delivery',
  delivery_province_id: 'luanda', delivery_province: 'Luanda', delivery_municipality_id: 'viana', delivery_municipality: 'Viana', delivery_locality: 'Zango',
  delivery_street: 'Rua 1', delivery_address_full: 'Rua 1, Zango, Viana, Luanda', delivery_gps_lat: -8.90, delivery_gps_lng: 13.37,
}), JSON.stringify([{ book_id: livro.id, quantity: 2 }, { book_id: revista.id, quantity: 1 }]), JSON.stringify({ method: 'delivery', free_threshold: 20000, cost: 1500, express_cost: 0 })]);
const o27 = mista[0].o;
await pagar(o27);
const d27 = await activa(o27);
check('encomenda mista: o digital não conta para ter os livros', d27?.has_stock === true, d27);
const c27 = d27 && await codigo(d27.colporteur_id);
const meus27 = d27 && (await asUser(perfil[c27], `select public.colporteur_my_deliveries() b`))[0].b.deliveries.find((x) => x.id === d27.id);
check('o colportor só vê os impressos para entregar', meus27?.items.length === 1 && meus27.items[0].title === 'Livro A', meus27?.items);
const quadro27 = (await asUser(admin, `select public.colporteur_deliveries_board(30) b`))[0].b.active.find((x) => x.id === d27?.id);
check('o quadro conta só os impressos', quadro27?.items === 2, quadro27?.items);
if (d27) {
  await respond(d27, c27, true);
  const antes27 = (await q(`select private.colporteur_in_hand($1, $2) n`, [d27.colporteur_id, livro.id]))[0].n;
  const fonte27 = (await q(`select source from public.colporteur_deliveries where id = $1`, [d27.id]))[0].source;
  if (fonte27 === 'loja') await svc(`select public.colporteur_delivery_handover($1::uuid)`, [d27.id], admin);
  await step(d27, c27, 'delivered', { name: 'Maria', sig: 'data:image/png;base64,AAAA' });
  const fim27 = (await q(`select status from public.colporteur_deliveries where id = $1`, [d27.id]))[0].status;
  check('entrega do stock dele com um digital à mistura: conclui', fim27 === 'delivered' && fonte27 === 'stock', { fim27, fonte27 });
  check('a guia só devolve os impressos', Number((await q(`select private.colporteur_in_hand($1, $2) n`, [d27.colporteur_id, livro.id]))[0].n) === Number(antes27) - 2 && Number((await q(`select stock from public.stock_books where id = $1`, [revista.id]))[0].stock) === 0);
}

// 6i. A posição de quem entrega pára quando a entrega deixa de ser dele ------------------------------
const posicao = async (o) => (await q(`select stopped_at from public.delivery_positions where order_id = $1`, [o.id]))[0];
const emCaminho = async () => {
  const o = await encomenda();
  await pagar(o);
  const d = await activa(o);
  const c = await codigo(d.colporteur_id);
  await respond(d, c, true);
  const fonte = (await q(`select source from public.colporteur_deliveries where id = $1`, [d.id]))[0].source;
  if (fonte === 'loja') await svc(`select public.colporteur_delivery_handover($1::uuid)`, [d.id], admin);
  await step(d, c, 'out_for_delivery');
  await asUser(perfil[c], `select public.delivery_share_position($1, -8.9, 13.37, 10)`, [o.id]);
  return { o, d, c };
};
const p1 = await emCaminho();
check('a caminho: a posição é partilhada', (await posicao(p1.o))?.stopped_at === null, await posicao(p1.o));
await devolver(p1.o, Number(p1.o.total), `DEV-${p1.o.order_number}`);
check('reembolsada: a partilha pára', !!(await posicao(p1.o))?.stopped_at, await posicao(p1.o));
const p2 = await emCaminho();
await estado(p2.d.colporteur_id, 'suspenso');
check('suspenso: a partilha pára', !!(await posicao(p2.o))?.stopped_at, await posicao(p2.o));
await volta(p2.d.colporteur_id);

// 7. Segurança, localização e prazo em horário de funcionamento ----------------------------------------
const d8 = await activa(o8);
await raises('o colportor não chama a função directamente', () => asUser(perfil['CPT-0002'], `select public.colporteur_delivery_respond($1::uuid, $2::uuid, true)`, [d8.id, perfil['CPT-0002']]), /permission denied/);
check('cada colportor só vê as suas entregas', (await asUser(perfil['CPT-0004'], `select count(*)::int n from public.colporteur_deliveries`))[0].n === 0);
check('o cliente não vê entregas', (await asUser(cliente, `select count(*)::int n from public.colporteur_deliveries`))[0].n === 0);
await raises('localização fora de Angola recusada', () => asUser(perfil['CPT-0002'], `select public.colporteur_set_location(38.72, -9.14)`), /fora de Angola/);
await asUser(perfil['CPT-0002'], `select public.colporteur_set_location(-8.9012, 13.3712)`);
check('localização registada pelo próprio', Number((await q(`select latitude from public.colporteurs where id = $1`, [B]))[0].latitude) === -8.9012);
await asUser(perfil['CPT-0003'], `select public.colporteur_set_accepts_deliveries(false)`);
check('quem não aceita entregas sai dos candidatos', !(await q(`select colporteur_id from private.delivery_candidates($1)`, [o8.id])).some((x) => x.colporteur_id === C));
await q(`update public.staff_ops_settings set open_days = '{1,2,3,4,5,6}', open_hour = 8, close_hour = 18 where id = 1`);
const prazo = (await q(`select to_char(private.business_deadline('2026-11-06 17:50:00+01', 120) at time zone 'Africa/Luanda', 'YYYY-MM-DD HH24:MI') p`))[0].p;
check('prazo: sexta 17h50 + 2 h de funcionamento = sábado 9h50', prazo === '2026-11-07 09:50', prazo);
const prazo2 = (await q(`select to_char(private.business_deadline('2026-11-07 17:00:00+01', 120) at time zone 'Africa/Luanda', 'YYYY-MM-DD HH24:MI') p`))[0].p;
check('prazo: sábado 17h + 2 h, domingo fechado = segunda 9h', prazo2 === '2026-11-09 09:00', prazo2);

// 8. Quadro das entregas para a equipa ----------------------------------------------------------------
const quadro = (await asUser(admin, `select public.colporteur_deliveries_board(30) b`))[0].b;
const emCurso = (await q(`select count(*)::int n from public.colporteur_deliveries where status in ('offered', 'accepted')`))[0].n;
check('quadro: todas as entregas em curso', quadro.active.length === emCurso && emCurso > 0, { quadro: quadro.active.length, emCurso });
const ordem = quadro.active.map((x) => x.sort[0]).join('');
check('quadro: primeiro as por preparar, depois as à espera, depois as que estão com o colportor', ordem === [...ordem].sort().join(''), ordem);
const comEquipa = (await q(`select count(*)::int n from public.orders where delivery_route = 'loja'
  and coalesce(status, '') not in ('cancelled', 'delivered') and coalesce(delivery_status, '') not in ('cancelled', 'delivered')`))[0].n;
check('quadro: as encomendas que ficaram com a equipa', quadro.to_team.length === comEquipa && comEquipa > 0, { comEquipa, n: quadro.to_team.length });
check('quadro: com o motivo de terem ficado com a equipa', quadro.to_team.some((x) => x.reason), quadro.to_team);
const feitas = (await q(`select count(*)::int n, coalesce(sum(fee), 0)::float s from public.colporteur_deliveries where status = 'delivered'`))[0];
check('quadro: entregas e ganhos do período', quadro.totals.delivered === feitas.n && Number(quadro.totals.fees) === feitas.s && feitas.n > 0, { t: quadro.totals, feitas });
check('quadro: por colportor soma o total', quadro.by_colporteur.reduce((s, x) => s + x.delivered, 0) === quadro.totals.delivered
  && quadro.by_colporteur.reduce((s, x) => s + x.offered, 0) === quadro.totals.offered);
check('quadro: sem os dados do cliente', !quadro.active.some((x) => x.customer) && !JSON.stringify(quadro).includes('923000000'));
const vazio = (await asUser(admin, `select public.colporteur_deliveries_board(0) b`))[0].b;
check('quadro: o período fica entre 1 e 366 dias', vazio.days === 1 && (await asUser(admin, `select public.colporteur_deliveries_board(9999) b`))[0].b.days === 366);
await raises('quadro: o cliente não vê', () => asUser(cliente, `select public.colporteur_deliveries_board(30)`), /Sem acesso/);
await raises('quadro: o colportor não vê', () => asUser(perfil['CPT-0002'], `select public.colporteur_deliveries_board(30)`), /Sem acesso/);

// 9. Sinais em tempo real: ao painel e à conta do colportor, sem dados --------------------------------
await db.exec(`create schema if not exists realtime;
  create table public._sinais (topic text, event text, payload jsonb);
  create function realtime.send(p_payload jsonb, p_event text, p_topic text, p_private boolean default true) returns void
    language sql as $$ insert into public._sinais values (p_topic, p_event, p_payload) $$;`);
const o12 = await encomenda();
await pagar(o12);
const d12 = await activa(o12);
const dono12 = (await q(`select profile_id from public.colporteurs where id = $1`, [d12.colporteur_id]))[0].profile_id;
const sinais = async () => (await q(`select topic, payload from public._sinais where event = 'entregas'`));
let s12 = await sinais();
check('oferta nova: sinal ao painel e à conta do colportor', s12.some((x) => x.topic === 'painel') && s12.some((x) => x.topic === `conta:${dono12}`), s12);
check('o sinal não leva dados', s12.every((x) => JSON.stringify(x.payload) === '{}'), s12);
await q(`delete from public._sinais`);
await svc(`select public.colporteur_delivery_respond($1::uuid, $2::uuid, true)`, [d12.id, dono12]);
s12 = await sinais();
check('resposta do colportor: novo sinal', s12.some((x) => x.topic === 'painel') && s12.some((x) => x.topic === `conta:${dono12}`), s12);

console.log(`\n${ok} cenários certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
