// Cenários dos cargos, da permissão «Ver relatórios», dos níveis dos leitores e dos sinais em
// tempo real (migrações 20261108130000, 131000 e 132000), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/cargos-e-niveis.mjs supabase/migrations
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
const profile = async (id) => (await q(`select * from public.profiles where id = $1`, [id]))[0];

// --- 1. Ver relatórios e cargos -------------------------------------------------------------
const admin = await user('admin@loja.ao', 'admin');
const gestor = await user('gestor@loja.ao', 'manager', { manage_catalog: true });
const atendente = await user('atendente@loja.ao', 'manager', { manage_orders: true });

{
  const keys = (await q(`select private.permission_keys() as k`))[0].k;
  check('a lista de chaves tem view_reports', keys.includes('view_reports') && keys.length === 14, keys); // 10 + produção, funcionários e finanças (migração funcionarios) + stock da loja (lojas_donas_dos_dados)
  const cargos = await q(`select name, permissions from public.staff_roles order by position`);
  check('oito cargos de partida', cargos.length === 8, cargos.map((c) => c.name));
  check('o cargo Atendimento não vê relatórios', cargos.find((c) => c.name === 'Atendimento').permissions.view_reports === false);
}

// O administrador grava as permissões de um gestor com a chave nova.
await as('authenticated', admin, `select public.users_admin_update($1, null, null, 'manager', '{"manage_orders":true,"view_reports":true,"inventada":true}'::jsonb)`, [atendente]);
{
  const p = await profile(atendente);
  check('users_admin_update guarda view_reports e deita fora chaves inventadas', p.permissions.view_reports === true && !('inventada' in p.permissions), p.permissions);
}

// Relatórios de vendas: só com view_reports.
await q(`insert into public.physical_stores (id, name, province, address, active, pickup_enabled) values ('lojahuambo00001', 'Loja Huambo', 'Huambo', 'Huambo', true, false) on conflict do nothing`).catch(() => {});
const [loja] = await q(`select id from public.physical_stores limit 1`);
if (loja) {
  await q(`insert into public.vendas_anos (loja_id, ano) values ($1, 2026) on conflict do nothing`, [loja.id]).catch((e) => console.log('(vendas_anos sem dados de teste:', e.message, ')'));
  const comRel = await as('authenticated', atendente, `select count(*)::int n from public.vendas_anos`);
  const semRel = await as('authenticated', gestor, `select count(*)::int n from public.vendas_anos`);
  check('quem tem view_reports lê as vendas por loja', comRel[0].n >= 1, comRel);
  check('quem não tem view_reports não as lê', semRel[0].n === 0, semRel);
}

// Cargos: só o administrador cria e atribui.
await raises('um gestor não cria cargos', () => as('authenticated', gestor, `insert into public.staff_roles (name, permissions) values ('Chefe', '{"manage_settings":true}')`));
const [caixa] = await q(`select id from public.staff_roles where name = 'Caixa'`);
await raises('um gestor não atribui cargos', () => as('authenticated', gestor, `select public.staff_role_assign($1, $2)`, [gestor, caixa.id]), /administradores/);
await raises('cargo só para gestores', async () => {
  const membro = await user('membro@loja.ao');
  await as('authenticated', admin, `select public.staff_role_assign($1, $2)`, [membro, caixa.id]);
}, /gestores/);

await as('authenticated', admin, `select public.staff_role_assign($1, $2)`, [gestor, caixa.id]);
{
  const p = await profile(gestor);
  check('com cargo, as permissões são as do cargo', p.staff_role_id === caixa.id && p.permissions.confirm_payments === true
    && p.permissions.manage_orders === true && p.permissions.manage_catalog === false, p.permissions);
}

// O próprio não muda o cargo nem as permissões por escrita directa.
await as('authenticated', gestor, `update public.profiles set staff_role_id = null, permissions = '{"manage_settings":true}'::jsonb, name = 'Gestor Novo' where id = $1`, [gestor]);
{
  const p = await profile(gestor);
  check('escrita directa: o nome muda, o cargo e as permissões não', p.name === 'Gestor Novo' && p.staff_role_id === caixa.id
    && p.permissions.manage_settings === false, { name: p.name, role: p.staff_role_id, perms: p.permissions });
}
// Nem o administrador muda o cargo por escrita directa (só pela função).
const [contab] = await q(`select id from public.staff_roles where name = 'Contabilidade'`);
await as('authenticated', admin, `update public.profiles set staff_role_id = $2 where id = $1`, [gestor, contab.id]);
check('o cargo não muda por escrita directa, nem do administrador', (await profile(gestor)).staff_role_id === caixa.id);

// Mudar o cargo muda toda a gente que o tem.
await as('authenticated', admin, `update public.staff_roles set permissions = permissions || '{"view_reports":true}'::jsonb where id = $1`, [caixa.id]);
check('mudar o cargo muda as permissões de quem o tem', (await profile(gestor)).permissions.view_reports === true);

// Mudar as permissões de alguém com cargo: ficam as do cargo.
await as('authenticated', admin, `select public.users_admin_update($1, null, null, 'manager', '{"manage_settings":true}'::jsonb)`, [gestor]);
check('com cargo, as permissões à parte não pegam', (await profile(gestor)).permissions.manage_settings === false);

// Tirar o cargo: fica personalizado, com as permissões que tinha.
await as('authenticated', admin, `select public.staff_role_assign($1, null)`, [gestor]);
{
  const p = await profile(gestor);
  check('sem cargo, fica com as permissões que tinha', p.staff_role_id === null && p.permissions.confirm_payments === true, p);
}
// Passar a administrador tira o cargo.
await as('authenticated', admin, `select public.staff_role_assign($1, $2)`, [gestor, caixa.id]);
await as('authenticated', admin, `select public.users_admin_update($1, null, null, 'admin', null)`, [gestor]);
check('administrador não tem cargo', (await profile(gestor)).staff_role_id === null);
// Apagar um cargo deixa as pessoas com as permissões e sem cargo.
const outro = await user('outro@loja.ao', 'manager', { manage_marketing: true });
const [mkt] = await q(`select id from public.staff_roles where name = 'Marketing'`);
await as('authenticated', admin, `select public.staff_role_assign($1, $2)`, [outro, mkt.id]);
await as('authenticated', admin, `delete from public.staff_roles where id = $1`, [mkt.id]);
{
  const p = await profile(outro);
  check('apagar o cargo deixa as permissões', p.staff_role_id === null && p.permissions.manage_marketing === true, p);
}
// A equipa lê os cargos; um cliente não.
const leitorCliente = await user('cliente@exemplo.ao');
check('a equipa lê os cargos', (await as('authenticated', atendente, `select count(*)::int n from public.staff_roles`))[0].n === 7);
check('um cliente não lê os cargos', (await as('authenticated', leitorCliente, `select count(*)::int n from public.staff_roles`))[0].n === 0);

// --- 2. Níveis dos leitores ----------------------------------------------------------------
const [livro] = await q(`insert into public.stock_books (title, price, stock, product_type) values ('Livro A', 5000, 50, 'livro') returning id`);
const [tshirt] = await q(`insert into public.stock_books (title, price, stock, product_type) values ('T-shirt', 3000, 50, 'vestuario') returning id`);
// O estado do pagamento só muda pelo registo de pagamentos (migração pagamentos_registados):
// aqui simula-se esse caminho com `app.payment_sync`, mudando os montantes pagos e reembolsados.
const pagamento = (id, set) => db.transaction(async (tx) => {
  await tx.query(`select set_config('app.payment_sync', 'on', true)`);
  await tx.query(`update public.orders set ${set} where id = $1`, [id]);
});
const pagar = (id) => pagamento(id, 'amount_paid = total');
const reembolsar = (id) => pagamento(id, 'amount_refunded = amount_paid');
let seq = 0;
const encomenda = async (cliente, itens, { paid = false } = {}) => {
  seq++;
  const linhas = itens.map((i) => ({ price: 1000, ...i }));
  const total = linhas.reduce((t, i) => t + i.price * (i.quantity || 1), 0);
  const [o] = await q(`insert into public.orders (order_number, customer_email, customer_name, customer_id, items, total, status)
    values ($1, 'x@exemplo.ao', 'Cliente', $2, $3::jsonb, $4, 'pending') returning id`, [`ENC-N${seq}`, cliente, JSON.stringify(linhas), total]);
  if (paid) await pagar(o.id);
  return o.id;
};
const novo = await user('novo@exemplo.ao');
check('uma conta nova começa como Conta nova', (await profile(novo)).reader_level === 'novo');

// O próprio não sobe de nível por escrita directa.
await as('authenticated', novo, `update public.profiles set reader_level = 'honra', reader_books = 99 where id = $1`, [novo]);
check('o nível não muda por escrita directa', (await profile(novo)).reader_level === 'novo');

// Sem compra não publica; responde e gosta.
const [pubEquipa] = await as('authenticated', admin, `insert into public.community_posts (user_id, body) values ($1, 'Bem-vindos!') returning id`, [admin]);
check('a equipa publica sempre', !!pubEquipa?.id);
await raises('conta nova não cria publicações', () => as('authenticated', novo, `insert into public.community_posts (user_id, body) values ($1, 'Olá')`, [novo]), /Leitores/);
const resp = await as('authenticated', novo, `insert into public.community_posts (user_id, body, parent_id) values ($1, 'Gostei!', $2) returning id`, [novo, pubEquipa.id]);
check('conta nova responde', resp.length === 1);

// Comprar uma t-shirt não conta; o primeiro livro pago conta.
await encomenda(novo, [{ book_id: tshirt.id, title: 'T-shirt', quantity: 2, product_type: 'vestuario' }], { paid: true });
check('uma t-shirt não é livro', (await profile(novo)).reader_level === 'novo');
const pendente = await encomenda(novo, [{ book_id: livro.id, title: 'Livro A', quantity: 1, product_type: 'livro' }]);
check('encomenda por pagar não conta', (await profile(novo)).reader_level === 'novo');
await pagar(pendente);
{
  const p = await profile(novo);
  check('o primeiro livro pago faz Leitor', p.reader_level === 'leitor' && p.reader_books === 1 && p.reader_via === 'compra' && p.reader_since, p);
  const avisos = await q(`select title from public.customer_notifications where customer_id = $1 and kind = 'community'`, [novo]);
  check('e avisa: bem-vindo à Comunidade de Leitores', avisos.some((a) => /Comunidade de Leitores/.test(a.title)), avisos);
}
const pub = await as('authenticated', novo, `insert into public.community_posts (user_id, body) values ($1, 'O meu primeiro livro!') returning id`, [novo]);
check('Leitor cria publicações', pub.length === 1);

// Cinco livros: Leitor assíduo; um reembolso baixa o distintivo mas nunca tira a entrada.
const quatro = await encomenda(novo, [{ book_id: livro.id, title: 'Livro A', quantity: 4, product_type: 'livro' }], { paid: true });
check('5 livros: Leitor assíduo', (await profile(novo)).reader_level === 'assiduo');
await reembolsar(quatro);
check('reembolso baixa para Leitor', (await profile(novo)).reader_level === 'leitor');
await reembolsar(pendente);
check('sem livros pagos, continua Leitor (não se perde a entrada)', (await profile(novo)).reader_level === 'leitor');

// Itens antigos sem tipo contam como livro; Bíblias e lições também.
const velho = await user('velho@exemplo.ao');
await encomenda(velho, [{ book_id: livro.id, title: 'Antigo', quantity: 10 }, { title: 'Bíblia', quantity: 3, product_type: 'biblia' }, { title: 'Lição', quantity: 2, product_type: 'revista' }], { paid: true });
check('15 livros (sem tipo, Bíblia e lição): Leitor de honra', (await profile(velho)).reader_level === 'honra');
check('encomenda cancelada não conta', await (async () => {
  const c = await user('cancela@exemplo.ao');
  const o = await encomenda(c, [{ title: 'L', quantity: 1, product_type: 'livro' }], { paid: true });
  await q(`update public.orders set status = 'cancelled' where id = $1`, [o]);
  const p = await profile(c);
  return p.reader_books === 0 && p.reader_level === 'leitor';
})());

// Participação sem compra: 30 dias de conta e 5 dias activos.
const part = await user('participa@exemplo.ao');
let st = (await as('authenticated', part, `select public.reader_touch() as s`))[0].s;
check('o primeiro dia conta', st.level === 'novo' && st.engage.days_active === 1 && st.engage.min_days === 30, st);
for (let d = 1; d <= 5; d++) {
  await q(`insert into public.reader_activity_days (profile_id, day) values ($1, current_date - $2::int) on conflict do nothing`, [part, d]);
}
st = (await as('authenticated', part, `select public.reader_touch() as s`))[0].s;
check('com 6 dias activos mas conta de hoje, ainda não', st.level === 'novo', st);
await q(`update public.profiles set created = now() - interval '31 days' where id = $1`, [part]);
st = (await as('authenticated', part, `select public.reader_touch() as s`))[0].s;
check('30 dias de conta e 5 dias activos: Leitor por participação', st.level === 'leitor' && st.via === 'participacao', st);
check('os dias apagam-se ao entrar', (await q(`select count(*)::int n from public.reader_activity_days where profile_id = $1`, [part]))[0].n === 0);
await raises('ninguém lê os dias de outra conta', () => as('authenticated', novo, `select * from public.reader_activity_days`), /permission/);

// As regras mudam-se no painel (Gerir Catálogo); um cliente não.
await as('authenticated', leitorCliente, `update public.reader_settings set engage_min_days = 1`);
check('um cliente não muda as regras', (await q(`select engage_min_days from public.reader_settings`))[0].engage_min_days === 30);
const catalogo = await user('cat@loja.ao', 'manager', { manage_catalog: true });
await as('authenticated', catalogo, `update public.reader_settings set engage_active_days = 7, tier_assiduo = 4`);
check('quem gere o catálogo muda as regras', (await q(`select engage_active_days, tier_assiduo from public.reader_settings`))[0].tier_assiduo === 4);
await raises('regras incoerentes recusadas', () => q(`update public.reader_settings set tier_honra = 3`), /check/i);

// Distintivos na comunidade, pela chave pública; a conta nova não tem.
const chaves = await q(`select reader_key from public.profiles where id = any($1::uuid[])`, [[novo, velho, leitorCliente]]);
const niveis = await as('anon', null, `select * from public.community_reader_levels($1::text[])`, [chaves.map((c) => c.reader_key)]);
check('distintivos pela chave, sem as contas novas', niveis.length === 2 && niveis.some((n) => n.level === 'honra'), niveis);
const resumo = (await as('authenticated', admin, `select public.reader_levels_summary() as r`))[0].r;
check('a equipa vê quantos há em cada nível', resumo.honra === 1 && resumo.por_participacao === 1, resumo);
await raises('um cliente não vê o resumo', () => as('authenticated', leitorCliente, `select public.reader_levels_summary()`), /equipa/);

// --- 3. Sinais em tempo real: sem o serviço, as escritas seguem ----------------------------
await q(`update public.orders set notes = 'nota' where id = $1`, [quatro]);
await q(`insert into public.customer_notifications (customer_id, kind, title, body) values ($1, 'order', 'T', 'B')`, [novo]);
await q(`update public.stock_books set stock = stock - 1`);
check('sem o esquema realtime, as escritas não rebentam', true);

console.log(`${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
