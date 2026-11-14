// Cenários das lojas donas dos seus dados (migração 20261114120000_lojas_donas_dos_dados): a loja
// de cada encomenda, de cada colportor e de cada guia, e o «temos / não temos» por loja. Corre as
// migrações reais até à anterior, põe dados como os da produção, e só então aplica esta e as
// seguintes — para provar também o preenchimento do que já existia:
//   PGLITE_MODULE=… node scripts/pglite/lojas.mjs supabase/migrations
// Instruções em base.mjs e em docs/PAGAMENTOS.md ("Testes").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb, migrationFiles, migrationSql } from './base.mjs';

const dir = process.argv[2];
const VERSAO = '20261114120000';
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

const versoes = migrationFiles(dir).map((f) => f.slice(0, 14));
const anterior = versoes.filter((v) => v < VERSAO).pop();
const db = await freshDb(dir, { upTo: anterior });
const q = async (s, p = []) => (await db.query(s, p)).rows;
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

// --- Antes da migração: lojas, encomendas, colportores e uma guia, como na produção -------------------
await q(`insert into public.angola_provinces (id, name, slug) values
  ('huambo', 'Huambo', 'huambo'), ('huila', 'Huíla', 'huila'), ('benguela', 'Benguela', 'benguela'), ('luanda', 'Luanda', 'luanda'),
  ('namibe', 'Namibe', 'namibe'), ('cuanza-sul', 'Cuanza Sul', 'cuanza-sul'), ('cuando', 'Cuando', 'cuando')
  on conflict (id) do nothing`);
// A migração painel_vendas_por_loja já criou a do Huambo (inactiva); fica activa, como na produção.
let [huambo] = await q(`select id from public.physical_stores where name ilike '%huambo%' limit 1`);
if (!huambo) [huambo] = await q(`insert into public.physical_stores (name, province, address) values ('Livraria Adventista — Huambo', 'Huambo', 'Huambo') returning id`);
await q(`update public.physical_stores set name = 'Livraria Adventista — Huambo', active = true where id = $1`, [huambo.id]);
const H = huambo.id;
const L = 'lojalubango0001';
const C = 'lojacatumbela01';
// A província do Lubango escrita sem acento, como pode estar na produção.
await q(`insert into public.physical_stores (id, name, province, address, active) values
  ($1, 'Livraria Adventista — Lubango', 'Huila', 'Lubango', true),
  ($2, 'Livraria Adventista — Catumbela', 'Benguela', 'Catumbela', true)`, [L, C]);
// Como na produção: o telefone da do Huambo (20261113103000) e o horário da porta da do Lubango (20261113143000).
const PORTA = 'Seg–Qui 8h–17h30 · Sex, Dom e feriados 8h–13h';
await q(`update public.physical_stores set phone = '+244 923 428 459', whatsapp = '+244 923 428 459' where id = $1`, [H]);
await q(`update public.physical_stores set hours = $2 where id = $1`, [L, PORTA]);

let seq = 0;
const encomenda = async (campos) => {
  seq++;
  const cols = { order_number: `ENC-L${seq}`, customer_email: 'c@exemplo.ao', customer_name: 'Cliente', items: '[]', total: 1000, status: 'pending', ...campos };
  const nomes = Object.keys(cols);
  const [o] = await q(`insert into public.orders (${nomes.join(', ')}) values (${nomes.map((_, i) => `$${i + 1}`).join(', ')}) returning id`, Object.values(cols));
  return o.id;
};
const antes = {
  pickupL: await encomenda({ shipping_method: 'pickup', pickup_store: 'Livraria Adventista — Lubango' }),
  pickupLmaiusc: await encomenda({ shipping_method: 'pickup', pickup_store: '  LIVRARIA ADVENTISTA — LUBANGO ' }),
  entregaBenguela: await encomenda({ shipping_method: 'delivery', delivery_province: 'Benguela' }),
  expressaHuila: await encomenda({ shipping_method: 'express', delivery_province: 'Huíla' }),
  entregaLuanda: await encomenda({ shipping_method: 'delivery', delivery_province: 'Luanda' }),
  digital: await encomenda({ shipping_method: 'digital' }),
  antigaHuambo: await encomenda({ shipping_method: '', pickup_store: 'Livraria Adventista — Huambo' }),
  lojaQueJaNaoExiste: await encomenda({ shipping_method: 'pickup', pickup_store: 'Loja de Talatona' }),
  // As províncias que cada loja serve (pedido do dono, 2026-11-14).
  cuanzaSul: await encomenda({ shipping_method: 'delivery', delivery_province: 'Cuanza Sul' }),
  namibe: await encomenda({ shipping_method: 'delivery', delivery_province: 'Namibe' }),
  cunene: await encomenda({ shipping_method: 'express', delivery_province: 'Cunene' }),
  bie: await encomenda({ shipping_method: 'delivery', delivery_province: 'Bié' }),
  cuando: await encomenda({ shipping_method: 'delivery', delivery_province: 'Cuando' }),
  cubango: await encomenda({ shipping_method: 'delivery', delivery_province: 'Cubango' }),
};
// Uma data antiga, para ver se o preenchimento a muda (os gatilhos da tabela poriam a de hoje).
await db.exec(`alter table public.orders disable trigger user;
  update public.orders set updated = '2026-01-01T00:00:00Z';
  alter table public.orders enable trigger user;`);

const colportor = async (nome, telefone, provincia) => {
  const [c] = await q(`insert into public.colporteurs (full_name, phone, province_id) values ($1, $2, $3) returning id`, [nome, telefone, provincia]);
  return c.id;
};
const kHuila = await colportor('Paulo do Lubango', '923100001', 'huila');
const kLuanda = await colportor('Rosa de Luanda', '923100002', 'luanda');
const kSem = await colportor('Sem Província', '923100003', null);
const kNamibe = await colportor('Marta do Namibe', '923100005', 'namibe');
const kCuando = await colportor('Pedro do Cuando', '923100006', 'cuando');
await db.exec(`alter table public.colporteurs disable trigger user;
  update public.colporteurs set updated = '2026-01-01T00:00:00Z';
  alter table public.colporteurs enable trigger user;`);
await q(`insert into public.colporteur_documents (number, colporteur_id, kind) values ('GUI-TESTE1', $1, 'entrega')`, [kHuila]);

// --- A migração (e as seguintes) --------------------------------------------------------------------
for (const f of migrationFiles(dir).filter((f) => f.slice(0, 14) >= VERSAO)) {
  await db.exec(migrationSql(readFileSync(join(dir, f), 'utf8')));
}

const loja = async (id) => (await q(`select store_id from public.orders where id = $1`, [id]))[0].store_id;

// --- 0. As províncias que cada loja serve, e a loja nova do Bié ------------------------------------
const areas = async (id) => (await q(`select service_provinces from public.physical_stores where id = $1`, [id]))[0].service_provinces;
check('Catumbela serve Benguela e o Cuanza Sul', JSON.stringify(await areas(C)) === JSON.stringify(['Benguela', 'Cuanza Sul']));
check('a da Huíla serve a Huíla, o Namibe e o Cunene', JSON.stringify(await areas(L)) === JSON.stringify(['Huíla', 'Namibe', 'Cunene']));
check('a do Huambo serve só o Huambo', JSON.stringify(await areas(H)) === JSON.stringify(['Huambo']));
const [B] = await q(`select id, name, province, address, phone, whatsapp, hours, latitude, longitude, maps_url, active, pickup_enabled, service_provinces
  from public.physical_stores where name ilike '%Bié%'`);
check('a loja do Bié foi criada no Cuito, escondida e sem levantamento (ainda não abriu)',
  !!B && B.name === 'Livraria Adventista — Bié' && B.address === 'Cuito' && B.active === false && B.pickup_enabled === false, B);
check('a do Bié serve o Bié, o Cuando e o Cubango', JSON.stringify(B?.service_provinces) === JSON.stringify(['Bié', 'Cuando', 'Cubango']));
check('com o telefone e o horário das outras lojas', B.phone === '+244 923 428 459' && B.whatsapp === '+244 923 428 459' && B.hours === PORTA, B);
check('com as coordenadas do centro do Cuito', Math.abs(B.latitude + 12.383333) < 1e-6 && Math.abs(B.longitude - 16.933333) < 1e-6 && /-12\.383333,16\.933333/.test(B.maps_url), B);
await raises('uma província vazia na lista é recusada', () => q(`update public.physical_stores set service_provinces = array['Bié', ''] where id = $1`, [B.id]), /service_provinces_check/);

// --- 1. A loja de cada encomenda ----------------------------------------------------------------------
check('levantamento no Lubango → Lubango', await loja(antes.pickupL) === L);
check('o nome escrito com outras maiúsculas e espaços também serve', await loja(antes.pickupLmaiusc) === L);
check('entrega em Benguela → Catumbela (a loja da província)', await loja(antes.entregaBenguela) === C);
check('expressa para a Huíla → Lubango, com a província da loja escrita sem acento', await loja(antes.expressaHuila) === L);
check('entrega em Luanda, sem loja → nenhuma', await loja(antes.entregaLuanda) === null);
check('só digital → nenhuma', await loja(antes.digital) === null);
check('encomenda antiga sem método de envio, com a loja escrita → essa loja', await loja(antes.antigaHuambo) === H);
check('loja que já não existe → nenhuma', await loja(antes.lojaQueJaNaoExiste) === null);
check('entrega no Cuanza Sul → Catumbela', await loja(antes.cuanzaSul) === C);
check('entrega no Namibe → Lubango', await loja(antes.namibe) === L);
check('expressa para o Cunene → Lubango', await loja(antes.cunene) === L);
check('entrega no Bié → a loja do Bié (mesmo escondida, a venda é dela)', await loja(antes.bie) === B.id);
check('entrega no Cuando → Bié', await loja(antes.cuando) === B.id);
check('entrega no Cubango → Bié', await loja(antes.cubango) === B.id);
{
  const [o] = await q(`select updated, pickup_store from public.orders where id = $1`, [antes.pickupL]);
  check('o preenchimento não acorda os outros gatilhos (a data de alteração fica)', new Date(o.updated).toISOString() === '2026-01-01T00:00:00.000Z', o.updated);
  check('o nome escrito fica como o cliente o escolheu', o.pickup_store === 'Livraria Adventista — Lubango');
}

// Encomendas novas.
const nova = await encomenda({ shipping_method: 'pickup', pickup_store: 'Livraria Adventista — Catumbela' });
check('encomenda nova com levantamento em Catumbela → Catumbela', await loja(nova) === C);
await q(`update public.orders set pickup_store = 'Livraria Adventista — Lubango' where id = $1`, [nova]);
check('mudar a loja do levantamento muda a loja da encomenda', await loja(nova) === L);
await q(`update public.orders set status = 'confirmed' where id = $1`, [nova]);
check('mudar só o estado não mexe na loja', await loja(nova) === L);
await q(`update public.orders set shipping_method = 'delivery', pickup_store = '', delivery_province = 'Benguela' where id = $1`, [nova]);
check('passar a entrega em Benguela → Catumbela', await loja(nova) === C);
const escolhida = await encomenda({ shipping_method: 'delivery', delivery_province: 'Benguela', store_id: H });
check('quem cria a encomenda já com a loja fica com ela', await loja(escolhida) === H);
await q(`update public.physical_stores set name = 'Livraria Adventista — Lubango (Centro)' where id = $1`, [L]);
check('mudar o nome da loja não a separa das suas encomendas', await loja(antes.pickupL) === L);
await q(`update public.physical_stores set name = 'Livraria Adventista — Lubango' where id = $1`, [L]);

// --- 2. A loja de cada colportor ----------------------------------------------------------------------
const lojaK = async (id) => (await q(`select store_id from public.colporteurs where id = $1`, [id]))[0].store_id;
check('colportor da Huíla → Lubango', await lojaK(kHuila) === L);
check('colportor de Luanda (sem loja) → nenhuma', await lojaK(kLuanda) === null);
check('colportor sem província → nenhuma', await lojaK(kSem) === null);
check('colportor do Namibe → Lubango (a loja que serve a província)', await lojaK(kNamibe) === L);
check('colportor do Cuando → Bié', await lojaK(kCuando) === B.id);
{
  const [k] = await q(`select updated from public.colporteurs where id = $1`, [kHuila]);
  check('o preenchimento dos colportores não mexe na data de alteração', new Date(k.updated).toISOString() === '2026-01-01T00:00:00.000Z', k.updated);
}
const kNovo = await colportor('Teresa de Benguela', '923100004', 'benguela');
check('colportor novo de Benguela → Catumbela', await lojaK(kNovo) === C);
await q(`update public.colporteurs set province_id = 'huambo' where id = $1`, [kSem]);
check('quem recebe a província depois recebe a loja dela', await lojaK(kSem) === H);
await q(`update public.colporteurs set store_id = $2 where id = $1`, [kNovo, H]);
await q(`update public.colporteurs set province_id = 'huila' where id = $1`, [kNovo]);
check('a loja escolhida pela equipa fica, mesmo mudando a província', await lojaK(kNovo) === H);

// A equipa da colportagem muda a loja pela API; um cliente não.
const admin = await user('admin@loja.ao', 'admin');
const colp = await user('colportagem@loja.ao', 'manager', { manage_colporteurs: true });
const cliente = await user('cliente@exemplo.ao');
await as('authenticated', colp, `update public.colporteurs set store_id = $2 where id = $1`, [kLuanda, C]);
check('a equipa da colportagem muda a loja na ficha', await lojaK(kLuanda) === C);
await as('authenticated', cliente, `update public.colporteurs set store_id = $2 where id = $1`, [kLuanda, H]);
check('um cliente não muda a loja de ninguém', await lojaK(kLuanda) === C);

// Entregas por colportor: onde levanta os livros quem não os tem consigo. Antes, o do Namibe não
// tinha loja na província nem a menos de 50 km, e não recebia a oferta.
const levanta = async (k, provinciaDaEncomenda) => (await q(`select private.delivery_pickup_store($1, $2) as s`, [k, provinciaDaEncomenda]))[0].s;
check('o colportor do Namibe levanta no Lubango (a sede da Missão Sul)', await levanta(kNamibe, 'Namibe') === L);
check('quem a equipa pôs noutra loja levanta nessa', await levanta(kLuanda, 'Luanda') === C);
const kSemLoja = await colportor('Zé de Luanda', '923100007', 'luanda');
check('sem loja dele, nem na província, nem perto: nenhuma (a oferta não lhe chega)', await levanta(kSemLoja, 'Luanda') === null);
check('a loja do Bié ainda não abriu: o colportor do Cuando não levanta lá', await levanta(kCuando, 'Cuando') === null);

// --- 3. A loja de cada guia -----------------------------------------------------------------------------
{
  const [g] = await q(`select store_id from public.colporteur_documents where number = 'GUI-TESTE1'`);
  check('a guia antiga fica com a loja do colportor', g.store_id === L, g);
  await q(`insert into public.colporteur_documents (number, colporteur_id, kind) values ('GUI-TESTE2', $1, 'devolucao')`, [kLuanda]);
  const [g2] = await q(`select store_id from public.colporteur_documents where number = 'GUI-TESTE2'`);
  check('uma guia nova fica com a loja do colportor', g2.store_id === C, g2);
  await q(`insert into public.colporteur_documents (number, colporteur_id, kind, store_id) values ('GUI-TESTE3', $1, 'entrega', $2)`, [kLuanda, H]);
  const [g3] = await q(`select store_id from public.colporteur_documents where number = 'GUI-TESTE3'`);
  check('uma guia com a loja escolhida fica com ela', g3.store_id === H, g3);
}

// --- 4. «Temos / não temos» por loja ----------------------------------------------------------------------
const [A] = await q(`insert into public.stock_books (title, price, stock, active) values ('Livro à vista', 5000, 10, true) returning id`);
const [O] = await q(`insert into public.stock_books (title, price, stock, active) values ('Livro oculto', 5000, 10, false) returning id`);
const catalogo = await user('catalogo@loja.ao', 'manager', { manage_catalog: true });
const lubango = await user('gerente.lubango@loja.ao', 'manager', { manage_store_stock: true });
const semFicha = await user('sem.ficha@loja.ao', 'manager', { manage_store_stock: true });
const saiu = await user('saiu@loja.ao', 'manager', { manage_store_stock: true });
const soEncomendas = await user('encomendas@loja.ao', 'manager', { manage_orders: true });
await q(`insert into public.staff_members (full_name, profile_id, store_id, status) values
  ('Gerente do Lubango', $1, $3, 'activo'),
  ('Antigo do Lubango', $2, $3, 'saiu')`, [lubango, saiu, L]);
// Quem gere encomendas tem ficha no Lubango, mas não a permissão.
await q(`insert into public.staff_members (full_name, profile_id, store_id) values ('Vendas do Lubango', $1, $2)`, [soEncomendas, L]);

const set = (who, store, books, available) => as('authenticated', who, `select public.store_stock_set($1, $2::text[], $3) as n`, [store, books, available]);
const marca = async (store, book) => (await q(`select available from public.store_stock where store_id = $1 and book_id = $2`, [store, book]))[0]?.available ?? null;

check('o gerente do Lubango marca «temos» na sua loja', (await set(lubango, L, [A.id, O.id], true))[0].n === 2);
check('ficou marcado', await marca(L, A.id) === true && await marca(L, O.id) === true);
check('marcar outra vez o mesmo não conta como mudança', (await set(lubango, L, [A.id], true))[0].n === 0);
await raises('o gerente do Lubango não marca Catumbela', () => set(lubango, C, [A.id], true), /permissão/);
await raises('com a permissão mas sem ficha numa loja, não marca nenhuma', () => set(semFicha, L, [A.id], true), /permissão/);
await raises('a ficha de quem saiu já não conta', () => set(saiu, L, [A.id], false), /permissão/);
await raises('ficha na loja sem a permissão não chega', () => set(soEncomendas, L, [A.id], false), /permissão/);
await raises('um cliente não marca', () => set(cliente, L, [A.id], false), /permissão/);
await raises('sem sessão nem se chama a função', () => as('anon', null, `select public.store_stock_set($1, $2::text[], true)`, [L, [A.id]]), /permission denied/);
check('o catálogo marca qualquer loja', (await set(catalogo, C, [A.id], false))[0].n === 1 && await marca(C, A.id) === false);
check('o administrador também', (await set(admin, H, [A.id, 'nao-existe'], true))[0].n === 1 && await marca(H, A.id) === true);
await raises('loja desconhecida', () => set(admin, 'loja-inventada', [A.id], true), /desconhecida/);
check('null volta a «por marcar»', (await set(catalogo, C, [A.id], null))[0].n === 1 && await marca(C, A.id) === null);
await raises('ninguém escreve na tabela sem a função', () => as('authenticated', catalogo, `insert into public.store_stock (store_id, book_id, available) values ($1, $2, true)`, [C, A.id]), /permission denied/);
await raises('nem apaga', () => as('authenticated', admin, `delete from public.store_stock`), /permission denied/);
{
  const [r] = await q(`select updated_by from public.store_stock where store_id = $1 and book_id = $2`, [L, A.id]);
  check('fica quem marcou', r.updated_by === lubango, r);
}

// As lojas que cada um pode marcar.
const minhas = async (who) => (await as('authenticated', who, `select id from public.store_stock_my_stores()`)).map((r) => r.id).sort();
check('o gerente do Lubango só vê o Lubango', JSON.stringify(await minhas(lubango)) === JSON.stringify([L]));
check('o catálogo vê as quatro, a do Bié também', (await minhas(catalogo)).length === 4);
check('o cliente não vê nenhuma', (await minhas(cliente)).length === 0);

// Quem lê.
const lidas = async (role, who, book) => (await as(role, who, `select store_id from public.store_stock where book_id = $1 order by store_id`, [book])).map((r) => r.store_id);
check('o público vê a disponibilidade de um livro à vista', JSON.stringify(await lidas('anon', null, A.id)) === JSON.stringify([H, L].sort()));
check('o público não vê a de um livro oculto', (await lidas('anon', null, O.id)).length === 0);
check('o gerente do Lubango vê a do livro oculto que marcou', (await lidas('authenticated', lubango, O.id)).length === 1);
await q(`update public.physical_stores set active = false where id = $1`, [L]);
check('uma loja desactivada sai do que o público vê', JSON.stringify(await lidas('anon', null, A.id)) === JSON.stringify([H]));
await q(`update public.physical_stores set active = true where id = $1`, [L]);
await q(`delete from public.stock_books where id = $1`, [O.id]);
check('apagar um produto apaga as suas marcas', (await q(`select count(*)::int n from public.store_stock where book_id = $1`, [O.id]))[0].n === 0);

// --- 5. A permissão nova ---------------------------------------------------------------------------------------
{
  const keys = (await q(`select private.permission_keys() as k`))[0].k;
  check('a lista de chaves tem manage_store_stock', keys.includes('manage_store_stock'), keys);
  await as('authenticated', admin, `select public.users_admin_update($1, null, null, 'manager', '{"manage_store_stock":true,"inventada":true}'::jsonb)`, [semFicha]);
  const [p] = await q(`select permissions from public.profiles where id = $1`, [semFicha]);
  check('users_admin_update guarda manage_store_stock e deita fora chaves inventadas', p.permissions.manage_store_stock === true && !('inventada' in p.permissions), p.permissions);
}

console.log(`lojas: ${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
