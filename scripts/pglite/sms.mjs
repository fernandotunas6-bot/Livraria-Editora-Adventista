// Cenários da confirmação do telefone por SMS, com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/sms.mjs supabase/migrations
// Instruções em base.mjs e em docs/SMS.md.
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
const svc = (sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true),
                         set_config('request.headers', '{}', true)`);
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
const perfil = async (id) => (await q(`select phone, phone_verified_at from public.profiles where id = $1`, [id]))[0];
const start = async (id, phone, hash) => (await svc(`select public.phone_verification_start($1::uuid, $2, $3) as r`, [id, phone, hash]))[0].r;
const confirm = async (id, hash) => (await svc(`select public.phone_verification_confirm($1::uuid, $2) as r`, [id, hash]))[0].r;
const NUMERO = '244923000111';
const NORMAL = '+244 923 000 111';

const ana = await user('ana@exemplo.ao');
const bento = await user('bento@exemplo.ao');
const admin = await user('admin@loja.ao', 'admin');

// 1. O caminho normal ---------------------------------------------------------------------------------
check('o código fica guardado', (await start(ana, NUMERO, 'certo')) === 0);
check('sabe-se o número por confirmar', (await svc(`select public.phone_verification_pending($1::uuid) as r`, [ana]))[0].r === NUMERO);
check('sem resumo em claro no perfil', (await perfil(ana)).phone_verified_at === null);
let r = await confirm(ana, 'certo');
check('o código certo confirma', r.ok === true && r.phone === NORMAL, r);
let p = await perfil(ana);
check('o perfil fica com o número e confirmado', p.phone === NORMAL && p.phone_verified_at !== null, p);
check('o código só serve uma vez', (await confirm(ana, 'certo')).reason === 'none');

// 2. Pedir outro: espera 60 segundos ------------------------------------------------------------------
check('logo a seguir, recusa e diz quanto falta', (await start(bento, NUMERO, 'b1')) === 0 && (await start(bento, NUMERO, 'b2')) > 0);
check('o código antigo continua a valer durante a espera', (await q(`select code_hash from public.phone_verifications where user_id = $1`, [bento]))[0].code_hash === 'b1');
await svc(`select public.phone_verification_cancel($1::uuid)`, [bento]);
check('se a SMS não sai, pode tentar logo', (await start(bento, NUMERO, 'b3')) === 0);
await q(`update public.phone_verifications set sent_at = now() - interval '61 seconds' where user_id = $1`, [bento]);
check('passado o minuto, pode pedir outro', (await start(bento, NUMERO, 'b4')) === 0);
check('e só vale o último', (await confirm(bento, 'b3')).reason === 'wrong');

// 3. Adivinhar o código ------------------------------------------------------------------------------
await q(`update public.phone_verifications set sent_at = now() - interval '61 seconds' where user_id = $1`, [bento]);
await start(bento, NUMERO, 'b5');
const respostas = [];
for (let i = 0; i < 5; i++) respostas.push(await confirm(bento, `errado${i}`));
check('diz quantas tentativas faltam', respostas[0].left === 4 && respostas[3].left === 1, respostas);
check('à quinta errada o código deixa de valer', respostas[4].reason === 'attempts', respostas[4]);
check('e nem o certo já entra', (await confirm(bento, 'b5')).reason === 'none');
check('sem confirmar', (await perfil(bento)).phone_verified_at === null);

// 4. Expirado ----------------------------------------------------------------------------------------
await start(bento, NUMERO, 'b6');
await q(`update public.phone_verifications set expires_at = now() - interval '1 second' where user_id = $1`, [bento]);
check('depois do prazo não vale', (await confirm(bento, 'b6')).reason === 'expired');

// 5. Um número, uma conta confirmada -------------------------------------------------------------------
await start(bento, NUMERO, 'b7');
check('o Bento prova que tem o número', (await confirm(bento, 'b7')).ok === true);
p = await perfil(ana);
check('a conta anterior perde a confirmação, e não o número', p.phone === NORMAL && p.phone_verified_at === null, p);
check('o Bento fica confirmado', (await perfil(bento)).phone_verified_at !== null);

// 6. Quem usa o site não marca à mão --------------------------------------------------------------------
const carla = await user('carla@exemplo.ao');
await asUser(carla, `update public.profiles set phone_verified_at = now(), phone = '+244 923 000 222' where id = $1`, [carla]);
p = await perfil(carla);
check('marcar a confirmação pela API não pega', p.phone === '+244 923 000 222' && p.phone_verified_at === null, p);
await asUser(bento, `update public.profiles set phone = '+244 923 000 333' where id = $1`, [bento]);
p = await perfil(bento);
check('mudar o telefone tira a confirmação', p.phone === '+244 923 000 333' && p.phone_verified_at === null, p);
await start(carla, '244923000222', 'c1');
await confirm(carla, 'c1');
await asUser(carla, `update public.profiles set name = 'Carla' where id = $1`, [carla]);
check('mudar outra coisa mantém a confirmação', (await perfil(carla)).phone_verified_at !== null);
await asUser(admin, `select public.users_admin_update($1::uuid, 'Carla', '+244 923 000 444', 'member', '{}'::jsonb)`, [carla]);
p = await perfil(carla);
check('a equipa mudar o telefone também tira a confirmação', p.phone === '+244 923 000 444' && p.phone_verified_at === null, p);

// 7. Só a Edge Function lhe chega ------------------------------------------------------------------------
await start(ana, '244923000555', 'a2');
for (const [nome, sql] of [
  ['start', `select public.phone_verification_start($1::uuid, '244923000666', 'x')`],
  ['confirm', `select public.phone_verification_confirm($1::uuid, 'a2')`],
  ['pending', `select public.phone_verification_pending($1::uuid)`],
  ['cancel', `select public.phone_verification_cancel($1::uuid)`],
]) {
  await raises(`quem usa o site não chama ${nome}`, () => asUser(ana, sql, [ana]), /permission denied/);
}
await raises('quem usa o site não lê os códigos', () => asUser(ana, `select * from public.phone_verifications`), /permission denied/);
await raises('nem a equipa', () => asUser(admin, `select * from public.phone_verifications`), /permission denied/);
await raises('nem quem não entrou', () => db.transaction(async (tx) => {
  await tx.exec('set local role anon');
  await tx.query(`select * from public.phone_verifications`);
}), /permission denied/);

// 8. O registo aceita as SMS ------------------------------------------------------------------------------
await svc(`insert into public.notification_logs (type, context, status, provider, recipient) values ('sms', 'otp', 'sent', 'twilio', '244923000111')`);
check('o registo aceita SMS de código', (await q(`select count(*)::int n from public.notification_logs where type = 'sms' and context = 'otp'`))[0].n === 1);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
