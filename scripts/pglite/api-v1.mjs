// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// A idempotência da API v1 (KANGEST ONE, fase C; migração 20261126210000_api_v1_idempotencia), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/api-v1.mjs supabase/migrations
// O que se confere: só o servidor lê e escreve; a chave tem a forma do Idempotency-Key; uma chave por pessoa e por rota.
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
const como = (sub, sql, params = [], role = 'authenticated') => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ('admin@x.ao', now()) returning id`);
await q(`update public.profiles set role = 'admin' where id = $1`, [u.id]);

await como(u.id, `insert into public.api_idempotencia (utilizador, rota, chave, estado, resposta) values ($1, '/api/v1/x', 'chave-0001', 200, '{}')`, [u.id], 'service_role');
check('o servidor grava', (await q(`select count(*) n from public.api_idempotencia`))[0].n == 1);
await recusa('a mesma chave outra vez, na mesma rota', () => q(`insert into public.api_idempotencia (utilizador, rota, chave, estado, resposta) values ($1, '/api/v1/x', 'chave-0001', 200, '{}')`, [u.id]), /duplicate key/);
await q(`insert into public.api_idempotencia (utilizador, rota, chave, estado, resposta) values ($1, '/api/v1/y', 'chave-0001', 200, '{}')`, [u.id]);
check('noutra rota, a mesma chave serve', (await q(`select count(*) n from public.api_idempotencia`))[0].n == 2);
await recusa('uma chave curta', () => q(`insert into public.api_idempotencia (utilizador, rota, chave, estado, resposta) values ($1, '/api/v1/x', 'curta', 200, '{}')`, [u.id]), /check/);
await recusa('uma chave com espaços', () => q(`insert into public.api_idempotencia (utilizador, rota, chave, estado, resposta) values ($1, '/api/v1/x', 'com espaços aqui', 200, '{}')`, [u.id]), /check/);
await recusa('nem o administrador lê directamente', () => como(u.id, `select * from public.api_idempotencia`), /permission denied/);
await recusa('nem escreve', () => como(u.id, `insert into public.api_idempotencia (utilizador, rota, chave, estado, resposta) values ($1, '/api/v1/z', 'chave-0002', 200, '{}')`, [u.id]), /permission denied/);
await recusa('o público também não', () => como(null, `select * from public.api_idempotencia`, [], 'anon'), /permission denied/);

console.log(`api-v1: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
