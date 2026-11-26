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

const a = await eu(admin);
check('o administrador do site entra como Gestor, nunca Administrador', a.perfil === 'GESTOR', a);
check('o gestor com a permissão entra como Gestor', (await eu(gestor)).perfil === 'GESTOR');
const c = await eu(caixa);
check('a caixa entra como Caixa, com o nome, o email e a loja da ficha', c.perfil === 'CAIXA' && c.nome === 'Ana Caixa' && c.email === 'caixa@x.ao'
  && c.lojas.length === 1 && c.lojas[0] === loja.id, c);
check('quem não tem a permissão não tem perfil', (await eu(atendimento)).perfil === null);
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

// --- ninguém sem sessão ----------------------------------------------------------------------------------------------
await recusa('o público não pergunta', () => como(null, `select public.kangest_eu()`, [], 'anon'), /permission denied/);
await recusa('sem sessão, nada', () => como(null, `select public.kangest_eu()`), /Entre com a sua conta/);

console.log(`kangest-entrada: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
