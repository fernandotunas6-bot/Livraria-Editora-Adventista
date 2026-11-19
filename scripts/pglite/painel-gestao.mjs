// Cenários do Painel de Gestão (migração 20261119140000_painel_gestao), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/painel-gestao.mjs supabase/migrations
// O que se confere: vendas ao vivo pelo caminho real do pagamento, quem vê o quê (direcção, gerente de loja,
// cliente), metas (soma das lojas ou a da empresa), aviso da meta atingida, fecho do mês e a publicidade da TV.
// Instruções em base.mjs e em docs/PAINEL-GESTAO.md.
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
const como = (sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '']);
  await tx.exec('set local role authenticated');
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};
const painel = async (sub, alvo = null, canal = null) => (await como(sub, `select public.painel_gestao($1, $2) p`, [alvo, canal]))[0].p;
const num = (v) => Number(v ?? 0);

// --- lojas, pessoas e um livro ---------------------------------------------------------------------------------
const [h] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [l] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Lubango', 'Huíla', 'Lubango', true) returning id`);
const [livro] = await q(`insert into public.stock_books (title, book_code, price, stock, active, kigest_ref, cover_image) values ('O Desejado', 'LIV-901', 5700, 50, true, 'LIV-001', 'https://x.ao/capa.jpg') returning id`);
const admin = await pessoa('admin@x.ao', 'admin');
const direccao = await pessoa('direccao@x.ao', 'manager', { view_reports: true });
const gerente = await pessoa('gerente@x.ao', 'manager', { view_store_dashboard: true });
const cliente = await pessoa('cliente@x.ao');
await q(`insert into public.staff_members (full_name, profile_id, store_id) values ('Gerente do Lubango', $1, $2)`, [gerente, l.id]).catch(async (e) => {
  // o nome da coluna do nome pode variar: tenta só com o essencial
  const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'staff_members' and is_nullable = 'NO' and column_default is null`)).map((r) => r.column_name);
  throw new Error(`staff_members: ${e.message} (obrigatórias: ${cols.join(', ')})`);
});

check('a permissão nova está na lista', (await q(`select 'view_store_dashboard' = any (private.permission_keys()) ok`))[0].ok);

// --- vendas: balcão (como a Edge Function as escreve) e online (pelo pagamento real) ------------------------------
const venda = (origem, alvo, total, quando = 'now()', qtd = 1) => q(
  `insert into public.vendas_ao_vivo (origem, quando, alvo, canal, tipo, numero, total, itens)
   values ($1, ${quando}, $2, 'balcao', 'FR', $1, $3, jsonb_build_array(jsonb_build_object('chave', 'LIV-001', 'referencia', 'LIV-001', 'titulo', 'O DESEJADO', 'quantidade', $4::numeric, 'total', $3::numeric)))`,
  [origem, alvo, total, qtd]);
await venda('kangest:c:1', h.id, 10000);
await venda('kangest:c:2', l.id, 4000);
await venda('kangest:c:3', h.id, -1000, 'now()', -1); // nota de crédito
const [o] = await q(`insert into public.orders (order_number, customer_email, customer_name, items, total, shipping_cost, shipping_method)
  values ('LIV-0100', 'c@x.ao', 'C', $1::jsonb, 7200, 1500, 'delivery') returning id`, [JSON.stringify([{ book_id: livro.id, title: 'O Desejado', quantity: 1, price: 5700 }])]);
await db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set amount_paid = total, payment_status = payment_status where id = $1`, [o.id]);
});
const online = await q(`select alvo, canal, total::float8 total, itens from public.vendas_ao_vivo where origem = $1`, ['site:' + o.id]);
check('encomenda paga: venda online sem os portes', online.length === 1 && online[0].alvo === 'online' && online[0].total === 5700, online);
check('o livro do site junta-se ao do balcão pela referência', online[0]?.itens?.[0]?.chave === 'LIV-001', online[0]?.itens);

// encomenda antiga com o preço em texto estragado: conta 0, não rebenta
check('preço estragado numa encomenda antiga conta 0', (await q(`select private.itens_da_encomenda('[{"book_id":"x","title":"Velho","quantity":"2","price":"5.700,00 Kz"}]'::jsonb) i`))[0].i[0].total === 0);
check('quantidade em texto lê-se', (await q(`select private.itens_da_encomenda('[{"book_id":"x","quantity":"3","price":10}]'::jsonb) i`))[0].i[0].quantidade === 3);

// --- quem vê o quê -----------------------------------------------------------------------------------------------
await recusa('cliente não abre o painel', () => painel(cliente), /Sem permissão/);
const pa = await painel(admin);
check('direcção: o mês de todas as lojas e do online', num(pa.resumo.mes) === 18700, pa.resumo);
check('direcção: vendas de hoje (sem a nota de crédito no número de vendas)', pa.resumo.hoje_vendas === 3, pa.resumo);
check('direcção: as lojas e o online para escolher', pa.alvos.map((a) => a.id).sort().join() === [h.id, l.id, 'online'].sort().join(), pa.alvos);
const pd = await painel(direccao);
check('quem tem «Ver relatórios» vê o mesmo', num(pd.resumo.mes) === 18700);
const pg = await painel(gerente);
check('gerente de loja: só a sua', num(pg.resumo.mes) === 4000 && pg.alvos.length === 1 && pg.alvos[0].id === l.id, { resumo: pg.resumo, alvos: pg.alvos });
check('gerente de loja: as lojas do quadro são só a sua', pg.lojas.length === 1 && pg.lojas[0].id === l.id, pg.lojas);
await recusa('gerente de loja não abre outra loja', () => painel(gerente, h.id), /Sem permissão/);
check('gerente de loja: lê só as vendas da sua loja', (await como(gerente, `select alvo from public.vendas_ao_vivo`)).every((r) => r.alvo === l.id));
check('cliente não lê vendas', (await como(cliente, `select * from public.vendas_ao_vivo`)).length === 0);
const canal = await painel(admin, null, 'online');
check('canal online: só a loja online', num(canal.resumo.mes) === 5700 && canal.lojas.length === 1 && canal.lojas[0].id === 'online', canal.lojas);
check('mais vendidos de hoje com a capa do site', pa.mais_vendidos_hoje[0]?.capa === 'https://x.ao/capa.jpg' && num(pa.mais_vendidos_hoje[0]?.quantidade) === 2, pa.mais_vendidos_hoje);
check('últimas vendas', pa.ultimas.length === 4 && pa.ultimas.some((u) => u.loja === 'A loja online'), pa.ultimas);
check('hora a hora: 24 horas', pa.horas.length === 24);
check('dias do mês', pa.dias.length === pa.dias_mes);

// --- metas --------------------------------------------------------------------------------------------------------
const { ano, mes } = pa;
await recusa('gerente de loja não define metas', () => como(gerente, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ [l.id]: 1 })]), /Sem permissão/);
await recusa('loja desconhecida', () => como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ nada: 1 })]), /desconhecida/);
await como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ [h.id]: 100000, [l.id]: 50000, online: 20000 })]);
check('meta da empresa = soma das lojas e do online', num((await painel(admin)).resumo.meta) === 170000);
check('meta do gerente = a da sua loja', num((await painel(gerente)).resumo.meta) === 50000);
check('meta do balcão = soma das lojas', num((await painel(admin, null, 'balcao')).resumo.meta) === 150000);
await como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ '': 200000 })]);
check('uma meta própria da empresa manda', num((await painel(admin)).resumo.meta) === 200000);
await como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ '': null })]);
check('apagar a meta da empresa volta à soma', num((await painel(admin)).resumo.meta) === 170000);

// --- aviso da meta atingida (uma vez) --------------------------------------------------------------------------------
await como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ [l.id]: 5000 })]);
await venda('kangest:c:4', l.id, 1500);
const avisos = await q(`select staff_id, title from public.staff_notifications where kind = 'meta_atingida'`);
const para = new Set(avisos.map((a) => a.staff_id));
check('meta do Lubango passada: avisa a direcção e o gerente da loja', para.has(admin) && para.has(direccao) && para.has(gerente) && !para.has(cliente), avisos);
check('o aviso diz a loja', avisos.every((a) => /Lubango passou a meta/.test(a.title)), avisos);
await venda('kangest:c:5', l.id, 1500);
check('só um aviso por mês', (await q(`select count(*)::int n from public.staff_notifications where kind = 'meta_atingida'`))[0].n === avisos.length);

// --- loja atrasada (do dia 7 em diante; no máximo um aviso por semana) ---------------------------------------------------
if (pa.dia >= 7) {
  await como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [ano, mes, JSON.stringify({ [h.id]: 999999999 })]);
  check('projecção abaixo da meta: aviso', (await q(`select private.painel_avisos_atraso() n`))[0].n >= 1);
  const atraso = await q(`select staff_id, title, body from public.staff_notifications where kind = 'meta_atrasada'`);
  check('o aviso de atraso diz a loja e o ritmo necessário', atraso.some((a) => /Huambo está atrás da meta/.test(a.title) && /por dia/.test(a.body)), atraso);
  check('o gerente do Lubango não recebe o atraso do Huambo', !atraso.some((a) => a.staff_id === gerente && /Huambo/.test(a.title)));
  check('uma vez por semana', (await q(`select private.painel_avisos_atraso() n`))[0].n === 0);
} else {
  console.log('(dia < 7: o aviso de atraso não se confere hoje)');
}
await q(`select private.painel_diario()`);
ok++;

// --- fecho do mês ---------------------------------------------------------------------------------------------------
const anterior = await q(`select extract(year from d)::int ano, extract(month from d)::int mes
  from (select (date_trunc('month', private.hora_luanda(now())) - interval '1 month')::date d) x`);
const [{ ano: a2, mes: m2 }] = anterior;
await venda('kangest:c:10', h.id, 30000, `private.de_luanda(make_timestamp(${a2}, ${m2}, 10, 12, 0, 0))`, 3);
await venda('kangest:c:11', h.id, 20000, `private.de_luanda(make_timestamp(${a2}, ${m2}, 11, 12, 0, 0))`, 2);
await q(`insert into public.metas (alvo, ano, mes, valor) values ($1, $2, $3, 40000)`, [h.id, a2, m2]);
await q(`select private.fechar_mes($1, $2)`, [a2, m2]);
const fechos = await q(`select alvo, vendido::float8 vendido, meta::float8 meta, percentagem::float8 pct, vendas, melhor_dia_total::float8 melhor, top_quantidade::float8 top
  from public.fechos where ano = $1 and mes = $2 order by alvo`, [a2, m2]);
const empresa = fechos.find((f) => f.alvo === '');
const huambo = fechos.find((f) => f.alvo === h.id);
check('fecho da loja: vendido, meta e %', huambo?.vendido === 50000 && huambo?.meta === 40000 && huambo?.pct === 125, huambo);
check('fecho da loja: melhor dia e artigo', huambo?.melhor === 30000 && huambo?.top === 5, huambo);
check('fecho da empresa', empresa?.vendido === 50000 && empresa?.vendas === 2, empresa);
await q(`select private.fechar_mes($1, $2)`, [a2, m2]);
check('fechar outra vez não muda nada', (await q(`select count(*)::int n from public.fechos where ano = $1 and mes = $2`, [a2, m2]))[0].n === fechos.length);
await recusa('mês fechado: as metas não mudam', () => como(admin, `select public.definir_metas($1, $2, $3::jsonb)`, [a2, m2, JSON.stringify({ [h.id]: 1 })]), /já fechou/);
const proposta = (await como(admin, `select public.metas_proposta($1, $2) p`, [ano, mes]))[0].p;
check('proposta de meta: média dos fechos + 5 %', num(proposta[h.id]) === 53000, proposta);
check('o histórico do painel tem o mês fechado e o mês em curso', (await painel(admin)).meses.some((m) => m.fechado && m.mes === m2) && (await painel(admin)).meses.at(-1).fechado === false);
check('fechos: o gerente só vê os da sua loja', (await como(gerente, `select alvo from public.fechos`)).length === 0);

// --- reembolso: a venda online deixa de contar --------------------------------------------------------------------
await db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set amount_refunded = amount_paid, payment_status = payment_status where id = $1`, [o.id]);
});
check('reembolsada: anulada no painel', (await q(`select anulado from public.vendas_ao_vivo where origem = $1`, ['site:' + o.id]))[0].anulado === true);

// --- publicidade da TV --------------------------------------------------------------------------------------------
await como(admin, `insert into public.painel_tv_midia (tipo, url, titulo) values ('video', 'https://x.supabase.co/storage/v1/object/public/media/promo.mp4', 'Promoção')`);
await recusa('cliente não muda a publicidade', () => como(cliente, `insert into public.painel_tv_midia (tipo, url) values ('imagem', 'https://x.ao/a.jpg')`), /row-level security|permission/);
await recusa('só endereços https', () => como(admin, `insert into public.painel_tv_midia (tipo, url) values ('imagem', 'http://x.ao/a.jpg')`), /check/);
check('o gerente vê a publicidade (a TV da loja)', (await como(gerente, `select * from public.painel_tv_midia`)).length === 1);
check('o cliente não vê a publicidade da TV', (await como(cliente, `select * from public.painel_tv_midia`)).length === 0);

console.log(`painel-gestao: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
