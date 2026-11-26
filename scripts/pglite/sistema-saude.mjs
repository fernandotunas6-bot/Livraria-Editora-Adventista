// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// A última migração para a saúde do ecossistema (KANGEST ONE, fase E; migração 20261126220000_sistema_saude):
//   PGLITE_MODULE=… node scripts/pglite/sistema-saude.mjs supabase/migrations
// Numa base sem o esquema das migrações do Supabase devolve null (não falha); com ele, a versão mais alta; e só o
// servidor a chama.
import { freshDb } from './base.mjs';

const dir = process.argv[2];
let ok = 0;
let fail = 0;
const check = (nome, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', nome, extra === undefined ? '' : JSON.stringify(extra)); }
};
const db = await freshDb(dir);
const q = async (s, p = []) => (await db.query(s, p)).rows;
const como = (sql, role) => db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); return (await tx.query(sql)).rows; });

const sem = (await q(`select to_regnamespace('supabase_migrations') is not null as tem`))[0].tem;
if (!sem) check('sem o esquema das migrações, null', (await q(`select public.sistema_ultima_migracao() v`))[0].v === null);
await q(`create schema if not exists supabase_migrations`);
await q(`create table if not exists supabase_migrations.schema_migrations (version text primary key)`);
await q(`insert into supabase_migrations.schema_migrations values ('20261126210000'), ('20261126220000'), ('20261101000000') on conflict do nothing`);
check('a versão mais alta', (await q(`select public.sistema_ultima_migracao() v`))[0].v === '20261126220000');
for (const papel of ['anon', 'authenticated']) {
  try { await como(`select public.sistema_ultima_migracao()`, papel); fail++; console.log('FALHOU (devia recusar):', papel); }
  catch (e) { if (/permission denied/.test(e.message)) ok++; else { fail++; console.log('FALHOU (mensagem):', papel, e.message); } }
}
check('o servidor chama', (await como(`select public.sistema_ultima_migracao() v`, 'service_role'))[0].v === '20261126220000');

console.log(`sistema-saude: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
