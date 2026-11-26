// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// As sessões abertas em cada KanGest (KANGEST ONE, fase A3; migração 20261126180000_kangest_sessoes), com as
// migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kangest-sessoes.mjs supabase/migrations
// O que se confere: a volta grava as sessões e marca as que deixaram de vir; o ADMIN de recurso fica no registo de
// segurança e avisa os administradores (uma vez por entrada); o painel pede o fim de uma sessão e a volta seguinte
// devolve-a; quando deixa de vir, fica «revogada»; e ninguém de fora lê a tabela nem chama as funções.
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
// como a Edge Function: a service role, com quem pediu no x-actor-id
const servidor = (sql, params = [], actor = null) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true),
                         set_config('request.headers', $1, true)`, [JSON.stringify(actor ? { 'x-actor-id': actor } : {})]);
  await tx.exec(`set local role service_role`);
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email, nome, role = 'member') => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  await q(`update public.profiles set name = $2, role = $3 where id = $1`, [u.id, nome, role]);
  return u.id;
};
const receber = async (posto, sessoes) => (await servidor(`select public.kangest_sessoes_receber($1, $2::jsonb) r`, [posto, sessoes === null ? null : JSON.stringify(sessoes)]))[0].r;
const sessao = async (posto, id) => (await q(`select * from public.kangest_sessoes where posto_id = $1 and sessao = $2`, [posto, id]))[0];

const admin = await pessoa('direccao@x.ao', 'Direcção', 'admin');
const cliente = await pessoa('cliente@x.ao', 'Cliente');
const posto = (await q(`select public.kangest_posto_criar('Caixa do Huambo', null, 'r-sess-1', null) id`))[0].id;
await recusa('um posto por emparelhar não grava sessões', () => receber(posto, []), /não está ligado/);
await q(`update public.kangest_postos set estado = 'activo', chave_publica = 'x' where id = $1`, [posto]);

const ADMIN = { id: '0123456789abcdef', nome: 'Admin', login: 'admin', perfil: 'ADMIN', conta_site: false, recurso: true, aparelho: 'Programa KanGest (Posto#1)', inicio: '2026-11-26T09:00:00Z' };
const ANA = { id: 'fedcba9876543210', nome: 'Ana', login: 'ana@x.ao', perfil: 'CAIXA', conta_site: true, recurso: false, aparelho: 'Chrome (Windows)', offline: true, inicio: '2026-11-26T08:00:00Z' };

// --- um KanGest antigo (sem a lista) não mexe em nada ---------------------------------------------------------------
check('sem lista: null', (await receber(posto, null)) === null);

// --- a primeira volta ---------------------------------------------------------------------------------------------
const avisosAntes = Number((await q(`select count(*) n from public.staff_notifications where staff_id = $1 and kind = 'security'`, [admin]))[0].n);
const r1 = await receber(posto, [ADMIN, ANA, { id: 'invalida', nome: 'x' }, ADMIN]);
check('nada a terminar', Array.isArray(r1) && r1.length === 0, r1);
check('duas sessões gravadas (a inválida e a repetida não contam)', Number((await q(`select count(*) n from public.kangest_sessoes where posto_id = $1`, [posto]))[0].n) === 2);
const a = await sessao(posto, ADMIN.id);
check('o ADMIN de recurso fica marcado, com a hora de entrada', a.recurso === true && a.fim === null && new Date(a.inicio).toISOString() === '2026-11-26T09:00:00.000Z', a);
check('a Ana sem Internet', (await sessao(posto, ANA.id)).offline === true);
const registo = await q(`select * from public.security_audit_log where table_name = 'kangest_sessoes' and action = 'insert'`);
check('a entrada do ADMIN de recurso fica no registo de segurança, com alerta', registo.length === 1 && registo[0].alerted === true
  && registo[0].summary.includes('ADMIN local de recurso') && registo[0].summary.includes('Caixa do Huambo'), registo);
const avisos = Number((await q(`select count(*) n from public.staff_notifications where staff_id = $1 and kind = 'security'`, [admin]))[0].n);
check('o administrador do site é avisado', avisos === avisosAntes + 1, { avisosAntes, avisos });

// --- a mesma sessão na volta seguinte não avisa outra vez ----------------------------------------------------------
await receber(posto, [ADMIN, ANA]);
check('uma entrada, um registo', Number((await q(`select count(*) n from public.security_audit_log where table_name = 'kangest_sessoes' and action = 'insert'`))[0].n) === 1);

// --- o painel termina a da Ana ---------------------------------------------------------------------------------------
const pedido = (await servidor(`select public.kangest_sessao_revogar($1, $2, $3) r`, [posto, ANA.id, admin], admin))[0].r;
check('o pedido fica registado', pedido.sessao === ANA.id && !!pedido.revogar_em, pedido);
const quem = await q(`select * from public.security_audit_log where table_name = 'kangest_sessoes' and action = 'update'`);
check('no registo de segurança, com quem pediu', quem.length === 1 && quem[0].actor_id === admin && quem[0].summary.includes('Ana'), quem);
const r2 = await receber(posto, [ADMIN, ANA]);
check('a volta seguinte devolve a chave da Ana', JSON.stringify(r2) === JSON.stringify([ANA.id]), r2);
const r3 = await receber(posto, [ADMIN]);
check('quando deixa de vir, nada mais a terminar', r3.length === 0, r3);
const ana = await sessao(posto, ANA.id);
check('a da Ana fica revogada', !!ana.fim && ana.motivo === 'revogada', ana);
await recusa('terminar uma sessão que já terminou', () => servidor(`select public.kangest_sessao_revogar($1, $2, $3)`, [posto, ANA.id, admin], admin), /já terminou/);

// --- o ADMIN saiu: fica «terminou» ---------------------------------------------------------------------------------
await receber(posto, []);
const a2 = await sessao(posto, ADMIN.id);
check('a do ADMIN fica terminada (saiu)', !!a2.fim && a2.motivo === 'terminou', a2);

// --- de fora, nada ---------------------------------------------------------------------------------------------------
await recusa('um cliente não lê as sessões', () => como(cliente, `select * from public.kangest_sessoes`), /permission denied/);
await recusa('um administrador também não lê directamente (só pela Edge Function)', () => como(admin, `select * from public.kangest_sessoes`), /permission denied/);
await recusa('ninguém de fora grava sessões', () => como(admin, `select public.kangest_sessoes_receber($1, '[]'::jsonb)`, [posto]), /permission denied/);
await recusa('ninguém de fora termina sessões', () => como(admin, `select public.kangest_sessao_revogar($1, $2, $3)`, [posto, ADMIN.id, admin]), /permission denied/);

console.log(`kangest-sessoes: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
