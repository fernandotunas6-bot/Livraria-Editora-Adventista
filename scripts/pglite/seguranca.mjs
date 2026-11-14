// Verificações à base de dados inteira, com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/seguranca.mjs supabase/migrations
// Instruções em base.mjs. Cada verificação apanha uma classe de erros, não um caso: uma migração
// nova que caia numa delas fica com o PR vermelho, com o nome do que falta.
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

// 1. Contactos: criar ou mudar o email pelo painel (o gatilho corria como quem chama) -------------------
const admin = await user('admin@loja.ao', 'admin');
const novo = (await asUser(admin, `insert into public.contacts (email, name, owner, source) values ('novo@exemplo.ao', 'Novo', $1, 'manual')
  returning id, unsubscribe_token`, [admin]))[0];
check('a equipa cria um contacto com email, e ele ganha o token', /^[0-9a-f]{64}$/.test(novo.unsubscribe_token || ''), novo);
const semEmail = (await asUser(admin, `insert into public.contacts (name, owner, source) values ('Sem email', $1, 'manual') returning id, unsubscribe_token`, [admin]))[0];
check('sem email não ganha token', semEmail.unsubscribe_token === null, semEmail);
const comEmail = (await asUser(admin, `update public.contacts set email = 'agora@exemplo.ao' where id = $1 returning unsubscribe_token`, [semEmail.id]))[0];
check('ao ganhar email, ganha o token', /^[0-9a-f]{64}$/.test(comEmail.unsubscribe_token || ''), comEmail);
await raises('o token continua a não se poder gerar à mão', () => asUser(admin, `select private.new_unsubscribe_token()`), /permission denied/);

// 2. Gatilhos que correm como quem chama e usam uma função fechada a quem usa o site ---------------------
// Falham só quando alguém os aciona pela API: em testes com service role, tudo parece bem. Na lista
// ficam os que se sabe que só correm dentro de funções do servidor.
const SO_DENTRO_DO_SERVIDOR = ['order_payments_guarda'];
const gatilhos = await q(`
  with fns as (
    select distinct p.proname, p.prosrc from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid join pg_namespace cn on cn.oid = c.relnamespace
    where not t.tgisinternal and cn.nspname = 'public' and not p.prosecdef
  )
  select distinct f.proname as funcao, (m.m)[1] as chama
  from fns f, lateral regexp_matches(f.prosrc, 'private\\.([a-z_0-9]+)\\s*\\(', 'g') as m(m)
  where not exists (
    select 1 from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace
    where n2.nspname = 'private' and p2.proname = (m.m)[1] and has_function_privilege('authenticated', p2.oid, 'execute')
  )`);
const avariados = gatilhos.filter((g) => !SO_DENTRO_DO_SERVIDOR.includes(g.funcao));
check('nenhum gatilho corre como quem chama e usa uma função fechada', avariados.length === 0, avariados);

// 3. Funções SECURITY DEFINER abertas pela API sem nenhuma verificação --------------------------------
// É uma procura de palavras, por isso uma função pode ter a palavra e estar errada. Serve para que
// uma função nova sem verificação não passe sem alguém decidir que é mesmo pública.
// colporteur_verify: a página pública do QR do cartão; só responde com o número e o código de
// verificação certos (40 bits ao acaso) e nunca devolve o telefone.
const PUBLICAS = ['app_releases_published', 'church_directory', 'colporteur_verify', 'community_current_club',
  'community_reader', 'community_reader_levels', 'community_sidebar', 'support_update_thread'];
const abertas = (await q(`
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
    and p.prosrc !~* '(auth\\.uid|auth\\.role|has_permission|is_staff|is_admin|assert_|can_manage|can_view|private\\.can_|private\\.is_|private\\.require|current_user)'
  order by 1`)).map((r) => r.proname).filter((n) => !PUBLICAS.includes(n));
check('nenhuma função do servidor fica aberta sem verificação', abertas.length === 0, abertas);

// 4. Tabelas sem RLS ---------------------------------------------------------------------------------
const semRls = (await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`)).map((r) => r.relname);
check('todas as tabelas públicas têm RLS', semRls.length === 0, semRls);

// 5. Chaves estrangeiras sem índice ------------------------------------------------------------------
const semIndice = (await q(`
  select c.conrelid::regclass::text as tabela, c.conname as chave
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
  where c.contype = 'f' and n.nspname = 'public'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid
        and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
    )
  order by 1, 2`));
check('todas as chaves estrangeiras têm índice', semIndice.length === 0, semIndice);

// 6. Privilégios que a API nunca usa (migração privilegios_minimos) -----------------------------------
// O RLS não cobre o TRUNCATE: anon e authenticated não o têm em nenhuma tabela, nem nas que vierem.
const PRIVILEGIOS_A_MAIS = `
  select table_name as tabela, grantee as papel, privilege_type as privilegio
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
  order by 1, 2, 3`;
const aMais = await q(PRIVILEGIOS_A_MAIS);
check('anon e authenticated sem TRUNCATE, TRIGGER nem REFERENCES', aMais.length === 0, aMais.slice(0, 10));
await db.exec('create table public.zz_tabela_nova (id int primary key)');
const naNova = await q(PRIVILEGIOS_A_MAIS);
check('uma tabela nova já nasce sem eles', naNova.length === 0, naNova);
await db.exec('drop table public.zz_tabela_nova');
await raises('authenticated não consegue esvaziar uma tabela', () => db.transaction(async (tx) => {
  await tx.exec('set local role authenticated');
  await tx.exec('truncate public.newsletter');
}), /permission denied/);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
