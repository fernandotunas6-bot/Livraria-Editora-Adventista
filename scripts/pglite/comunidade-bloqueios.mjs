// Bloquear na comunidade (migração 20261117130000_bloquear_na_comunidade), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/comunidade-bloqueios.mjs supabase/migrations
// Instruções em base.mjs. Cada pessoa só vê, junta e tira da sua lista; quem foi bloqueado não a vê;
// sem sessão não se lê nada; apagar a conta apaga a lista.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const raises = async (name, fn) => {
  try { await fn(); fail++; console.log('FALHOU (devia recusar):', name); }
  catch { ok++; }
};

const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const como = (sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', sub ? 'authenticated' : 'anon']);
  await tx.exec(`set local role ${sub ? 'authenticated' : 'anon'}`);
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email) => (await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]))[0].id;

const ana = await pessoa('ana@exemplo.ao');
const bruno = await pessoa('bruno@exemplo.ao');
const [{ reader_key: chaveBruno }] = await q(`select reader_key from public.profiles where id = $1`, [bruno]);
const [{ reader_key: chaveAna }] = await q(`select reader_key from public.profiles where id = $1`, [ana]);

// 1. A Ana bloqueia o Bruno pela chave de leitor; o user_id vem da sessão.
await como(ana, `insert into public.community_blocks (blocked_key, blocked_name) values ($1, 'Bruno')`, [chaveBruno]);
const daAna = await como(ana, `select user_id, blocked_key, blocked_name from public.community_blocks`);
check('a Ana vê a sua lista', daAna.length === 1 && daAna[0].blocked_key === chaveBruno && daAna[0].user_id === ana, daAna);

// 2. O Bruno não vê a lista da Ana (não sabe que foi bloqueado), e sem sessão não se lê nada.
check('quem foi bloqueado não vê a lista de quem o bloqueou', (await como(bruno, `select * from public.community_blocks`)).length === 0);
await raises('sem sessão não se lê a tabela', () => como(null, `select * from public.community_blocks`));

// 3. Ninguém escreve na lista de outra pessoa nem tira da lista dela.
await raises('o Bruno não junta à lista da Ana', () => como(bruno,
  `insert into public.community_blocks (user_id, blocked_key) values ($1, $2)`, [ana, chaveAna]));
await como(bruno, `delete from public.community_blocks where blocked_key = $1`, [chaveBruno]);
check('o Bruno não tira nada da lista da Ana', (await q(`select count(*)::int as n from public.community_blocks where user_id = $1`, [ana]))[0].n === 1);

// 4. Não há alterações (só bloquear e desbloquear) e as chaves têm limites.
await raises('não se altera uma linha (só bloquear e desbloquear)', () => como(ana,
  `update public.community_blocks set blocked_name = 'Outro' where blocked_key = $1`, [chaveBruno]));
await raises('a chave não pode vir vazia', () => como(ana, `insert into public.community_blocks (blocked_key) values ('')`));
await raises('bloquear duas vezes a mesma pessoa dá o erro de duplicado (o site trata-o como já feito)', () => como(ana,
  `insert into public.community_blocks (blocked_key) values ($1)`, [chaveBruno]));

// 5. A Ana desbloqueia; e apagar a conta apaga a lista.
await como(ana, `delete from public.community_blocks where blocked_key = $1`, [chaveBruno]);
check('desbloquear tira a pessoa da lista', (await como(ana, `select * from public.community_blocks`)).length === 0);
await como(ana, `insert into public.community_blocks (blocked_key, blocked_name) values ($1, 'Bruno')`, [chaveBruno]);
await q(`delete from auth.users where id = $1`, [ana]);
check('apagar a conta apaga a lista', (await q(`select count(*)::int as n from public.community_blocks`))[0].n === 0);

console.log(`${ok} certos, ${fail} falhados`);
if (fail) process.exit(1);
