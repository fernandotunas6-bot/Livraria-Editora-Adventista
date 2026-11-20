// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Verificação em dois passos obrigatória para a equipa (migração dois_passos_obrigatorio_equipa):
//   PGLITE_MODULE=… node scripts/pglite/dois-passos.mjs supabase/migrations
// Instruções em base.mjs.
import { as, freshDb } from './base.mjs';

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
const user = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = $3 where id = $1`, [u.id, role, permissions]);
  return u.id;
};
const factor = (id) => q(`insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified')`, [id]);
const sessao = (sub, aal, sql) => as(db, { sub, aal }, async (tx) => (await tx.query(sql)).rows[0]);
const poderes = (sub, aal = 'aal1') => sessao(sub, aal, `select private.is_admin() as admin, private.is_staff() as staff,
  private.has_permission('manage_orders') as orders, public.staff_mfa_status() as estado`);
const prazo = (quando) => q(`update private.staff_mfa_policy set enforce_after = ${quando}, updated = now()`);

const admin = await user('admin@loja.ao', 'admin');
const gestor = await user('gestor@loja.ao', 'manager', { manage_orders: true });
const cliente = await user('cliente@exemplo.ao');
const adminComCodigo = await user('admin2@loja.ao', 'admin');
await factor(adminComCodigo);

// 1. A migração deixa 7 dias de adaptação ------------------------------------------------------------
const [pol] = await q(`select enforce_after > now() + interval '6 days' and enforce_after < now() + interval '8 days' as ok from private.staff_mfa_policy`);
check('o prazo fica a 7 dias da migração', pol?.ok === true, pol);

let r = await poderes(admin);
check('dentro do prazo, admin sem código mantém o painel', r.admin && r.staff && r.orders, r);
check('dentro do prazo, o site sabe que falta activar e a data', r.estado.staff === true && r.estado.has_factor === false && r.estado.enforced === false, r.estado);
r = await poderes(gestor);
check('dentro do prazo, gestor sem código mantém as permissões', r.staff && r.orders && !r.admin, r);
r = await poderes(adminComCodigo, 'aal1');
check('quem já activou continua a precisar do código (aal1 não chega)', !r.admin && !r.staff, r);

// 2. Depois do prazo -------------------------------------------------------------------------------------
await prazo(`now() - interval '1 minute'`);
r = await poderes(admin);
check('depois do prazo, admin sem código conta como cliente', !r.admin && !r.staff && !r.orders, r);
check('depois do prazo, o site mostra o ecrã de activação', r.estado.staff === true && r.estado.enforced === true && r.estado.has_factor === false, r.estado);
r = await poderes(gestor);
check('depois do prazo, gestor sem código perde as permissões', !r.staff && !r.orders, r);
r = await poderes(adminComCodigo, 'aal2');
check('com o código (aal2), o admin tem tudo', r.admin && r.staff && r.orders, r);
r = await poderes(adminComCodigo, 'aal1');
check('com factor mas sem o código, continua sem poderes', !r.admin && !r.staff, r);
r = await poderes(cliente);
check('cliente sem código continua cliente (nada muda)', !r.admin && !r.staff && r.estado.staff === false, r);
await raises('depois do prazo, admin sem código não lê as encomendas de outros', async () => {
  const [o] = await q(`insert into public.orders (order_number, customer_email, customer_name, items, total, status)
    values ('ENC-2FA', 'x@exemplo.ao', 'X', '[]'::jsonb, 100, 'pending') returning id`);
  const rows = await as(db, { sub: admin }, async (tx) => (await tx.query(`select id from public.orders where id = $1`, [o.id])).rows);
  if (rows.length === 0) throw new Error('recusado: 0 linhas');
}, /0 linhas/);
await raises('admin sem código não muda o papel de ninguém', () => as(db, { sub: admin }, (tx) =>
  tx.query(`select public.users_admin_update($1, null, null, 'admin', null)`, [cliente])), /Sem permissão|administradores/);

// 3. A configuração em falta fecha, não abre ------------------------------------------------------------
await q(`delete from private.staff_mfa_policy`);
r = await poderes(gestor);
check('sem a linha do prazo, exige-se o código já', !r.staff && r.estado.enforced === true, r);
await q(`insert into private.staff_mfa_policy (id, enforce_after) values (1, now() + interval '7 days')`);

// 4. Quem pode ler o quê ---------------------------------------------------------------------------------
await raises('o prazo não se lê pela API', () => as(db, { sub: admin }, (tx) => tx.query(`select * from private.staff_mfa_policy`)), /permission denied/);
await raises('a data para a Edge Function é só da service role', () => as(db, { sub: admin }, (tx) => tx.query(`select public.staff_mfa_deadline()`)), /permission denied/);
await raises('um visitante não pergunta pelo estado', () => as(db, { role: 'anon' }, (tx) => tx.query(`select public.staff_mfa_status()`)), /permission denied/);
const [svc] = await as(db, { role: 'service_role' }, async (tx) => (await tx.query(`select public.staff_mfa_deadline() > now() as ok`)).rows);
check('a service role lê a data', svc?.ok === true, svc);

console.log(`\n${ok} cenários certos, ${fail} falhados`);
if (fail) process.exit(1);
