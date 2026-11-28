// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Entrar no KanGest Livraria com a conta do site (migração 20261126100000_kangest_entrada_com_a_conta), com as
// migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kangest-entrada.mjs supabase/migrations
// O que se confere: o perfil de cada pessoa (Gestor, Caixa ou nenhum), pelas permissões e pelos cargos; o administrador
// do site entra como Gestor (nunca Administrador); as lojas da ficha; e que ninguém sem sessão pergunta.
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
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email, nome, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  await q(`update public.profiles set name = $2, role = $3, permissions = coalesce($4::jsonb, permissions) where id = $1`,
    [u.id, nome, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};
const eu = async (sub) => (await como(sub, `select public.kangest_eu() e`))[0].e;

// --- as permissões novas -----------------------------------------------------------------------------------------
const keys = (await q(`select private.permission_keys() k`))[0].k;
check('as duas chaves do KanGest estão na lista', keys.includes('kangest_caixa') && keys.includes('kangest_gestor'), keys);

// --- as pessoas ----------------------------------------------------------------------------------------------------
const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const admin = await pessoa('admin@x.ao', 'Direcção', 'admin');
const gestor = await pessoa('gestor@x.ao', 'Gerente', 'manager', { kangest_gestor: true, view_reports: true });
const caixa = await pessoa('caixa@x.ao', 'Ana Caixa', 'manager', { kangest_caixa: true });
const atendimento = await pessoa('atendimento@x.ao', 'Rui Atendimento', 'manager', { manage_orders: true });
const cliente = await pessoa('cliente@x.ao', 'Cliente', 'member', { kangest_gestor: true });
await q(`insert into public.staff_members (full_name, profile_id, store_id) values ('Ana Caixa', $1, $2)`, [caixa, loja.id]);

// o mesmo papel do site (20261127172000): o administrador é Administrador e o gestor é Gestor
const a = await eu(admin);
check('o administrador do site entra como Administrador', a.perfil === 'ADMIN', a);
check('o gestor com a permissão entra como Gestor', (await eu(gestor)).perfil === 'GESTOR');
const c = await eu(caixa);
check('a caixa entra como Caixa, com o nome, o email e a loja da ficha', c.perfil === 'CAIXA' && c.nome === 'Ana Caixa' && c.email === 'caixa@x.ao'
  && c.lojas.length === 1 && c.lojas[0] === loja.id, c);
check('o gestor do site sem as permissões do KanGest entra como Gestor', (await eu(atendimento)).perfil === 'GESTOR');
await q(`update public.profiles set phone = '923 000 111' where id = $1`, [gestor]);
check('os mesmos dados: o telefone do perfil do site', (await eu(gestor)).telefone === '923 000 111');
check('um cliente nunca entra (as permissões só valem nos gestores)', (await eu(cliente)).perfil === null);

// --- os cargos levam as permissões ---------------------------------------------------------------------------------
const [cargo] = await q(`insert into public.staff_roles (name, permissions) values ('Caixa da loja', '{"kangest_caixa": true, "inventada": true}'::jsonb) returning id, permissions`);
check('o cargo guarda a chave do KanGest e deita fora as inventadas', cargo.permissions.kangest_caixa === true && !('inventada' in cargo.permissions), cargo.permissions);
await como(admin, `select public.staff_role_assign($1, $2)`, [atendimento, cargo.id]).catch(async () => {
  // o nome dos argumentos pode variar entre versões: o essencial é a pessoa receber o cargo
  await q(`select public.staff_role_assign($1, $2)`, [atendimento, cargo.id]);
});
const r = await eu(atendimento);
check('com o cargo, entra como Caixa', r.perfil === 'CAIXA' && r.cargo === 'Caixa da loja', r);

// --- o posto e a loja da ficha (20261126120000) ---------------------------------------------------------------------
const [outra] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Lubango', 'Huíla', 'Lubango', true) returning id`);
const postoDaLoja = (await q(`select public.kangest_posto_criar('Caixa do Huambo', $1, 'r-ent-1', null) id`, [loja.id]))[0].id;
const postoDeOutra = (await q(`select public.kangest_posto_criar('Caixa do Lubango', $1, 'r-ent-2', null) id`, [outra.id]))[0].id;
const euNo = async (sub, posto) => (await como(sub, `select public.kangest_eu($1) e`, [posto]))[0].e;
check('a caixa no posto da loja da ficha: sim', (await euNo(caixa, postoDaLoja)).posto_na_ficha === true);
check('a caixa no posto de outra loja: não', (await euNo(caixa, postoDeOutra)).posto_na_ficha === false);
check('sem ficha com loja: não se sabe (null)', (await euNo(gestor, postoDeOutra)).posto_na_ficha === null);
check('sem posto: null, e os dois passos cumpridos', (await eu(caixa)).posto_na_ficha === null && (await eu(caixa)).mfa === true);

// --- ninguém sem sessão ----------------------------------------------------------------------------------------------
await recusa('o público não pergunta', () => como(null, `select public.kangest_eu()`, [], 'anon'), /permission denied/);
await recusa('sem sessão, nada', () => como(null, `select public.kangest_eu()`), /Entre com a sua conta/);

// --- «Entrar com o site» (migração 20261127170000): o código de uso único ------------------------------------------
const resumo = (c) => c.repeat(64).slice(0, 64);
const DESAFIO = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const ESTADO = 'aBcDeFgHiJkLmNoPqRsTuVwX';
const criar = (sub, r, desafio = DESAFIO, estado = ESTADO, role = 'service_role') =>
  como(null, `select public.kangest_entrada_criar($1, $2, $3, $4)`, [sub, r, desafio, estado], role);
const usar = (r, role = 'service_role') => como(null, `select public.kangest_entrada_usar($1) e`, [r], role);
for (const role of ['anon', 'authenticated']) {
  await recusa(`${role}: não cria códigos`, () => criar(caixa, resumo('a'), DESAFIO, ESTADO, role), /permission denied/);
  await recusa(`${role}: não gasta códigos`, () => usar(resumo('a'), role), /permission denied/);
  await recusa(`${role}: não lê a tabela`, () => como(null, `select * from private.kangest_entradas`, [], role), /permission denied/);
}
await criar(caixa, resumo('a'));
const gasto = (await usar(resumo('a')))[0].e;
check('o código dá a conta, o desafio e o estado', gasto.user_id === caixa && gasto.desafio === DESAFIO && gasto.estado === ESTADO, gasto);
check('o mesmo código não serve duas vezes', (await usar(resumo('a')))[0].e === null);
check('um código que ninguém pediu', (await usar(resumo('b')))[0].e === null);
await criar(caixa, resumo('c'));
await q(`update private.kangest_entradas set expira = now() - interval '1 second' where codigo_resumo = $1`, [resumo('c')]);
check('passados os dois minutos, não', (await usar(resumo('c')))[0].e === null);
check('e sai da tabela, mesmo fora do prazo', (await q(`select count(*)::int n from private.kangest_entradas where codigo_resumo = $1`, [resumo('c')]))[0].n === 0);
await recusa('um resumo que não é SHA-256', () => criar(caixa, 'abc'), /inválido/);
await recusa('um desafio que não é S256', () => criar(caixa, resumo('d'), 'curto'), /inválido/);
await recusa('um estado com caracteres estranhos', () => criar(caixa, resumo('d'), DESAFIO, 'aaaaaaaaaaaaaaaaaaaaaaaa&x=1'), /inválido/);
await criar(caixa, resumo('e'));
await q(`update private.kangest_entradas set expira = now() - interval '1 second' where codigo_resumo = $1`, [resumo('e')]);
await criar(caixa, resumo('f'));
check('os códigos fora do prazo saem quando se cria outro', (await q(`select count(*)::int n from private.kangest_entradas`))[0].n === 1);

console.log(`kangest-entrada: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
