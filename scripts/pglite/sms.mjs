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
const start = async (id, phone, hash = 'resumo') => (await svc(`select public.phone_verification_start($1::uuid, $2, $3) as r`, [id, phone, hash]))[0].r;
const codeOk = async (id, hash) => (await svc(`select public.phone_verification_code_ok($1::uuid, $2) as r`, [id, hash]))[0].r;
const pending = async (id) => (await svc(`select public.phone_verification_pending($1::uuid) as r`, [id]))[0].r;
const failed = async (id) => (await svc(`select public.phone_verification_failed($1::uuid) as r`, [id]))[0].r;
const confirm = async (id) => (await svc(`select public.phone_verification_confirm($1::uuid) as r`, [id]))[0].r;
const cancel = (id) => svc(`select public.phone_verification_cancel($1::uuid)`, [id]);
const passaMinuto = (id) => q(`update public.phone_verifications set sent_at = now() - interval '61 seconds' where user_id = $1`, [id]);
const NUMERO = '244923000111';
const NORMAL = '+244 923 000 111';

const ana = await user('ana@exemplo.ao');
const bento = await user('bento@exemplo.ao');
const admin = await user('admin@loja.ao', 'admin');

// 1. O caminho normal ---------------------------------------------------------------------------------
check('o pedido fica guardado', (await start(ana, NUMERO)) === 0);
check('sabe-se o número à espera', (await pending(ana)) === NUMERO);
check('o perfil ainda não está confirmado', (await perfil(ana)).phone_verified_at === null);
let r = await confirm(ana);
check('o código certo confirma', r.ok === true && r.phone === NORMAL, r);
let p = await perfil(ana);
check('o perfil fica com o número pedido e confirmado', p.phone === NORMAL && p.phone_verified_at !== null, p);
check('só serve uma vez', (await confirm(ana)).ok === false && (await pending(ana)) === null);

// 2. Pedir outro: espera 60 segundos ------------------------------------------------------------------
check('logo a seguir, recusa e diz quanto falta', (await start(bento, NUMERO)) === 0 && (await start(bento, '244923000999')) > 0);
check('o número pedido não muda durante a espera', (await pending(bento)) === NUMERO);
await cancel(bento);
check('se a SMS não sai, pode tentar logo', (await start(bento, NUMERO)) === 0);
await passaMinuto(bento);
check('passado o minuto, pode pedir para outro número', (await start(bento, '244923000999')) === 0);
check('e passa a ser esse que se confirma', (await pending(bento)) === '244923000999');

// 3. Códigos errados ----------------------------------------------------------------------------------
await passaMinuto(bento);
await start(bento, NUMERO);
const restam = [];
for (let i = 0; i < 5; i++) restam.push(await failed(bento));
check('diz quantas tentativas restam, e à quinta acabou', JSON.stringify(restam) === '[4,3,2,1,0]', restam);
check('já não há nada à espera', (await pending(bento)) === null);
check('nem se confirma depois disso', (await confirm(bento)).ok === false && (await perfil(bento)).phone_verified_at === null);
check('errar sem pedido não rebenta', (await failed(bento)) === 0);
await start(bento, NUMERO);
await failed(bento);
await passaMinuto(bento);
await start(bento, NUMERO);
check('um pedido novo volta às 5 tentativas', (await failed(bento)) === 4);
await cancel(bento);

// 4. Expirado ----------------------------------------------------------------------------------------
await start(bento, NUMERO);
await q(`update public.phone_verifications set expires_at = now() - interval '1 second' where user_id = $1`, [bento]);
check('depois do prazo não há número à espera', (await pending(bento)) === null);
check('nem confirma, mesmo com o código certo', (await confirm(bento)).ok === false && (await perfil(bento)).phone_verified_at === null);

// 4b. O código: só o resumo fica guardado, e verifica-se aqui -------------------------------------------
const dina = await user('dina@exemplo.ao');
await start(dina, '244923000777', 'resumo-certo');
check('o código errado não passa', (await codeOk(dina, 'resumo-errado')) === false);
check('o certo passa', (await codeOk(dina, 'resumo-certo')) === true);
check('passar não confirma sozinho: o perfil não muda', (await perfil(dina)).phone_verified_at === null);
check('sem resumo não passa', (await codeOk(dina, null)) === false);
for (let k = 0; k < 5; k++) await failed(dina);
check('à quinta errada, o código certo já não entra', (await codeOk(dina, 'resumo-certo')) === false && (await pending(dina)) === null);
await start(dina, '244923000777', 'r2');
await passaMinuto(dina);
await start(dina, '244923000777', 'r3');
check('só vale o último código', (await codeOk(dina, 'r2')) === false && (await codeOk(dina, 'r3')) === true);
await q(`update public.phone_verifications set expires_at = now() - interval '1 second' where user_id = $1`, [dina]);
check('depois do prazo, o código certo não entra', (await codeOk(dina, 'r3')) === false);
await cancel(dina);
check('sem pedido não passa', (await codeOk(dina, 'r3')) === false);
await raises('um pedido sem resumo é recusado', () => start(dina, '244923000777', null), /code_hash/);

// 5. Um número, uma conta confirmada -------------------------------------------------------------------
await start(bento, NUMERO);
check('o Bento prova que tem o número', (await confirm(bento)).ok === true);
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
await start(carla, '244923000222');
await confirm(carla);
await asUser(carla, `update public.profiles set name = 'Carla' where id = $1`, [carla]);
check('mudar outra coisa mantém a confirmação', (await perfil(carla)).phone_verified_at !== null);
await asUser(admin, `select public.users_admin_update($1::uuid, 'Carla', '+244 923 000 444', 'member', '{}'::jsonb)`, [carla]);
p = await perfil(carla);
check('a equipa mudar o telefone também tira a confirmação', p.phone === '+244 923 000 444' && p.phone_verified_at === null, p);

// 7. Só a Edge Function lhe chega ------------------------------------------------------------------------
await start(ana, '244923000555');
for (const [nome, sql] of [
  ['start', `select public.phone_verification_start($1::uuid, '244923000666', 'x')`],
  ['code_ok', `select public.phone_verification_code_ok($1::uuid, 'x')`],
  ['confirm', `select public.phone_verification_confirm($1::uuid)`],
  ['failed', `select public.phone_verification_failed($1::uuid)`],
  ['pending', `select public.phone_verification_pending($1::uuid)`],
  ['cancel', `select public.phone_verification_cancel($1::uuid)`],
]) {
  await raises(`quem usa o site não chama ${nome}`, () => asUser(ana, sql, [ana]), /permission denied/);
}
await raises('quem usa o site não lê os pedidos', () => asUser(ana, `select * from public.phone_verifications`), /permission denied/);
await raises('nem a equipa', () => asUser(admin, `select * from public.phone_verifications`), /permission denied/);
await raises('nem quem não entrou', () => db.transaction(async (tx) => {
  await tx.exec('set local role anon');
  await tx.query(`select * from public.phone_verifications`);
}), /permission denied/);

// 8. O registo aceita as SMS ------------------------------------------------------------------------------
await svc(`insert into public.notification_logs (type, context, status, provider, recipient) values ('sms', 'otp', 'sent', 'pro2sms', '244923000111')`);
check('o registo aceita SMS de código', (await q(`select count(*)::int n from public.notification_logs where type = 'sms' and context = 'otp'`))[0].n === 1);

console.log(`\n${ok} certos, ${fail} falhados`);
process.exit(fail ? 1 : 0);
