// Cenários dos tokens de notificações da app de colportores (migração 20261115090000_app_push_tokens),
// com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/app-push.mjs supabase/migrations
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
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const user = async (email) => (await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]))[0].id;

const ana = await user('ana@colportor.ao');
const rui = await user('rui@colportor.ao');
const T1 = 'dQw4w9WgXcQ:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx_um';
const T2 = 'dQw4w9WgXcQ:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx_dois';

// A Edge Function (service role) grava; a conta nunca chega à tabela pela API.
await as('service_role', null, `insert into public.app_push_tokens (user_id, token, app_version) values ($1, $2, '1.0.0')`, [ana, T1]);
check('o servidor regista o token', (await q(`select count(*)::int n from public.app_push_tokens`))[0].n === 1);
await raises('a própria conta não lê os tokens pela API', () => as('authenticated', ana, `select * from public.app_push_tokens`), /permission denied/);
await raises('nem os escreve', () => as('authenticated', ana, `insert into public.app_push_tokens (user_id, token) values ($1, $2)`, [ana, T2]), /permission denied/);
await raises('sem sessão também não', () => as('anon', null, `select * from public.app_push_tokens`), /permission denied/);

// O mesmo aparelho com outra conta: o token passa para ela (upsert pelo token, como na rota).
await as('service_role', null, `insert into public.app_push_tokens (user_id, token) values ($1, $2)
  on conflict (token) do update set user_id = excluded.user_id, updated = now()`, [rui, T1]);
const [linha] = await q(`select user_id, count(*) over ()::int n from public.app_push_tokens`);
check('um token é de um aparelho só: passa para a conta que entrou', linha.user_id === rui && linha.n === 1, linha);

await raises('um token com espaços é recusado', () => q(`insert into public.app_push_tokens (user_id, token) values ($1, 'tem espaços no meio do token')`, [ana]), /check/);
await raises('plataforma desconhecida é recusada', () => q(`insert into public.app_push_tokens (user_id, token, platform) values ($1, $2, 'windows')`, [ana, T2]), /check/);

await q(`insert into public.app_push_tokens (user_id, token) values ($1, $2)`, [ana, T2]);
await q(`delete from auth.users where id = $1`, [ana]);
check('apagar a conta apaga os seus aparelhos', (await q(`select count(*)::int n from public.app_push_tokens where token = $1`, [T2]))[0].n === 0);

console.log(`app-push: ${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
