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

console.log(`\n${ok} cenários certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
