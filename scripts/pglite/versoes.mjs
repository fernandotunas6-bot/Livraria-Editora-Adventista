// Cenários das novidades da app e do aviso por push (migração versoes_da_app), com as
// migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/versoes.mjs supabase/migrations
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
const gestor = await user('gestor@loja.ao', 'manager', { manage_settings: true });
const vendas = await user('vendas@loja.ao', 'manager', { manage_orders: true });
const cliente = await user('cliente@exemplo.ao');

// --- 1. Quem escreve ---------------------------------------------------------------------
const [r1] = await as('authenticated', gestor, `insert into public.app_releases (version, title, notes)
  values ('2026.11.08-ab12cd3', '  Entrar   mais rápido  ', E'Entra sozinho ao abrir a app\r\nAviso de versão nova') returning *`);
check('a equipa com Configurações cria uma novidade', !!r1?.id);
check('o título fica limpo', r1.title === 'Entrar mais rápido', r1.title);
check('as notas perdem os \\r', r1.notes === 'Entra sozinho ao abrir a app\nAviso de versão nova', r1.notes);
check('o autor é quem a criou', r1.created_by === gestor);
check('nasce por publicar', r1.published_at === null);

await raises('o cliente não cria', () => as('authenticated', cliente, `insert into public.app_releases (title) values ('Olá a todos')`), /row-level security/);
await raises('o anónimo não cria', () => as('anon', null, `insert into public.app_releases (title) values ('Olá a todos')`), /permission denied/);
await raises('quem só gere encomendas não cria', () => as('authenticated', vendas, `insert into public.app_releases (title) values ('Olá a todos')`), /row-level security/);
await raises('título curto de mais', () => as('authenticated', gestor, `insert into public.app_releases (title) values ('Oi')`), /app_releases_title_len/);
await raises('versão com caracteres estranhos', () => as('authenticated', gestor, `insert into public.app_releases (title, version) values ('Versão nova', 'v1; drop')`), /app_releases_version_fmt/);
await raises('notas compridas de mais', () => as('authenticated', gestor, `insert into public.app_releases (title, notes) values ('Versão nova', repeat('x', 2001))`), /app_releases_notes_len/);

// As colunas do envio são do servidor.
await raises('a equipa não marca o envio por push pela API', () => as('authenticated', gestor,
  `update public.app_releases set push_requested_at = now() where id = $1`, [r1.id]), /permission denied/);
await raises('a equipa não mexe no progresso do envio', () => as('authenticated', gestor,
  `update public.app_releases set push_sent = 999 where id = $1`, [r1.id]), /permission denied/);
await raises('nem cria uma já "enviada"', () => as('authenticated', gestor,
  `insert into public.app_releases (title, push_finished_at) values ('Versão nova', now())`), /permission denied/);
await raises('o autor não se troca', () => as('authenticated', gestor,
  `update public.app_releases set created_by = $2 where id = $1`, [r1.id, admin]), /permission denied/);

// --- 2. Quem lê --------------------------------------------------------------------------
const publicas = async (role = 'anon', sub = null) => as(role, sub, `select * from public.app_releases_published(20)`);
check('por publicar, ninguém de fora a vê', (await publicas()).length === 0);
await raises('o anónimo não lê a tabela', () => as('anon', null, `select * from public.app_releases`), /permission denied/);
check('o cliente não vê a tabela (só a função)', (await as('authenticated', cliente, `select id from public.app_releases`)).length === 0);
check('a equipa vê os rascunhos', (await as('authenticated', gestor, `select id from public.app_releases`)).length === 1);

await as('authenticated', gestor, `update public.app_releases set published_at = now() where id = $1`, [r1.id]);
const [pub] = await publicas();
check('publicada, aparece a todos', pub?.id === r1.id);
check('a função só dá o que se mostra', JSON.stringify(Object.keys(pub).sort()) === JSON.stringify(['id', 'notes', 'published_at', 'title', 'version']), Object.keys(pub));
check('o cliente com sessão também a vê', (await publicas('authenticated', cliente)).length === 1);

const [futura] = await as('authenticated', gestor, `insert into public.app_releases (title, published_at) values ('Para amanhã', now() + interval '1 day') returning id`);
check('agendada para amanhã ainda não aparece', (await publicas()).every((r) => r.id !== futura.id));
await q(`insert into public.app_releases (title, published_at) select 'Antiga ' || g, now() - (g || ' days')::interval from generate_series(1, 60) g`);
const lista = await publicas();
check('no máximo 20 de cada vez (pedido)', lista.length === 20, lista.length);
check('da mais recente para a mais antiga', lista[0].id === r1.id && lista[1].title === 'Antiga 1', lista.slice(0, 2).map((r) => r.title));
check('nunca mais de 50', (await as('anon', null, `select * from public.app_releases_published(500)`)).length === 50);

// --- 3. O envio por push -----------------------------------------------------------------
// O servidor (Edge Function) marca o pedido, com quem pediu no cabeçalho.
await svc(`update public.app_releases set push_requested_at = now() where id = $1`, [r1.id], gestor);
const [audit] = await q(`select * from public.security_audit_log where table_name = 'app_releases' and row_id = $1`, [r1.id]);
check('o aviso a todos fica no registo de segurança, com quem pediu', audit?.actor_id === gestor && /push a todos os aparelhos: Entrar mais rápido/.test(audit.summary), audit);
await raises('anunciada por push, não volta a rascunho', () => as('authenticated', gestor,
  `update public.app_releases set published_at = null where id = $1`, [r1.id]), /app_releases_push_after_publish/);
const apagadas = await as('authenticated', gestor, `delete from public.app_releases where id = $1 returning id`, [r1.id]);
check('anunciada por push, não se apaga', apagadas.length === 0);
check('…e continua lá', (await q(`select id from public.app_releases where id = $1`, [r1.id])).length === 1);
const corrigida = await as('authenticated', gestor, `update public.app_releases set title = 'Entrar mais depressa' where id = $1 returning title`, [r1.id]);
check('o texto ainda se corrige depois de anunciada', corrigida[0]?.title === 'Entrar mais depressa');
const [rascunho] = await as('authenticated', gestor, `insert into public.app_releases (title) values ('Rascunho a apagar') returning id`);
check('um rascunho apaga-se', (await as('authenticated', gestor, `delete from public.app_releases where id = $1 returning id`, [rascunho.id])).length === 1);
await raises('sem publicar não se anuncia (nem o servidor)', () => svc(
  `insert into public.app_releases (title, push_requested_at) values ('Por publicar', now())`), /app_releases_push_after_publish/);

// Progresso: só o servidor, e somado.
await svc(`select public.app_release_push_progress($1, 120, 3)`, [r1.id]);
await svc(`select public.app_release_push_progress($1, 30, -5)`, [r1.id]);
const [prog] = await q(`select push_sent, push_failed from public.app_releases where id = $1`, [r1.id]);
check('o progresso soma os lotes (e ignora números negativos)', prog.push_sent === 150 && prog.push_failed === 3, prog);
await raises('a equipa não chama o progresso', () => as('authenticated', admin, `select public.app_release_push_progress($1, 1, 0)`, [r1.id]), /permission denied/);

// Preferência por aparelho.
await svc(`insert into public.push_subscriptions (endpoint, keys) values ('https://push.exemplo/a', '{}')`);
const [sub] = await q(`select app_updates from public.push_subscriptions where endpoint = 'https://push.exemplo/a'`);
check('cada aparelho recebe as novidades por omissão', sub.app_updates === true);

// --- 4. O agendador acorda a função enquanto o envio não acabar ---------------------------
await q(`insert into vault.secrets (name, secret) values ('email_queue_url', 'https://x.supabase.co/functions/v1/app/cron/email-queue'), ('email_queue_token', 't')`);
// Tudo o resto vazio: só o envio de novidades fica por acabar.
await q(`update public.staff_notifications set dispatched_at = now() where dispatched_at is null`);
await q(`update public.customer_notifications set dispatched_at = now() where dispatched_at is null`);
let calls = 0;
await q(`create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language plpgsql as $$
  begin perform set_config('teste.chamadas', (coalesce(nullif(current_setting('teste.chamadas', true), ''), '0')::int + 1)::text, false); return 1; end $$`);
const run = async () => {
  await q(`select set_config('teste.chamadas', '0', false)`);
  await q(`select private.run_staff_dispatch()`);
  return Number((await q(`select current_setting('teste.chamadas', true) as n`))[0].n);
};
calls = await run();
check('com um envio por acabar, o agendador acorda a função', calls === 1, calls);
await svc(`update public.app_releases set push_finished_at = now() where id = $1`, [r1.id]);
calls = await run();
check('acabado o envio, não acorda por nada', calls === 0, calls);
await svc(`update public.app_releases set push_finished_at = null, push_requested_at = now() - interval '3 days' where id = $1`, [r1.id]);
calls = await run();
check('um envio parado há mais de 2 dias não acorda a função para sempre', calls === 0, calls);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
