// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários das lojas novas sem colisões (migração 20261128130000_lojas_novas_sem_colisoes), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/lojas-novas.mjs supabase/migrations
// O que se confere: o código único de cada loja (automático e à mão), o nome repetido, o prefixo das séries de cada
// posto do KanGest (único na rede, nunca reutilizado), a loja com dados que não se apaga e o detector das séries
// repetidas entre postos. Instruções em base.mjs e em docs/LOJAS.md.
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
const como = (sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '']);
  await tx.exec('set local role authenticated');
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  if (role !== 'member') await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};
const loja = async (sub, name, province, codigo = '') =>
  (await como(sub, `insert into public.physical_stores (name, province, address, active, codigo) values ($1, $2, $1, true, $3) returning id, codigo`, [name, province, codigo]))[0];

const admin = await pessoa('admin@x.ao', 'admin');
const membro = await pessoa('membro@x.ao');

// --- o código de cada loja (as migrações já trazem o Huambo, HUA, e o Bié, BIE) -----------------------------------
const namibe = await loja(admin, 'Livraria — Namibe', 'Namibe');
check('o código sai sozinho da província', namibe.codigo === 'NAM', namibe);
const lubango = await loja(admin, 'Livraria — Lubango', 'Huíla');
check('sem acentos', lubango.codigo === 'HUI', lubango);
const tombwa = await loja(admin, 'Livraria — Tômbwa', 'Namibe');
check('na mesma província, outro código', tombwa.codigo === 'NAM2', tombwa);
const huambo = await loja(admin, 'Livraria — Huambo (Bairro Académico)', 'Huambo');
check('o HUA já é da loja do Huambo: HUA2', huambo.codigo === 'HUA2', huambo);
const cunene = await loja(admin, 'Livraria — Ondjiva', 'Cunene', ' cun ');
check('à mão: em maiúsculas', cunene.codigo === 'CUN', cunene);
await recusa('um código de outra loja não se repete', () => loja(admin, 'Livraria — Catumbela', 'Benguela', 'HUA'), /já é de outra loja/);
await recusa('um código mal escrito não entra', () => loja(admin, 'Livraria — Catumbela', 'Benguela', '1AB'), /codigo_check/);
await recusa('o mesmo nome de outra loja não entra (sem contar maiúsculas, acentos e espaços)', () => loja(admin, 'livraria namibe', 'Namibe'), /Já existe uma loja/);
await recusa('mudar o nome para o de outra loja também não', () => como(admin, `update public.physical_stores set name = 'Livraria — Lubango' where id = $1`, [cunene.id]), /Já existe uma loja/);
await como(admin, `update public.physical_stores set codigo = '' where id = $1`, [cunene.id]);
check('o código apagado volta a sair sozinho', (await q(`select codigo from public.physical_stores where id = $1`, [cunene.id]))[0].codigo === 'CUN');
await recusa('um cliente não cria lojas', () => loja(membro, 'Livraria — Malanje', 'Malanje'), /row-level security|permission denied/);

// --- o prefixo das séries de cada posto do KanGest ----------------------------------------------------------------
const posto = async (nome, store) => (await q(`select public.kangest_posto_criar($1, $2, $3, null) id`, [nome, store, `resumo-${nome}`]))[0].id;
const prefixo = async (id) => (await q(`select serie_prefixo from public.kangest_postos where id = $1`, [id]))[0].serie_prefixo;
const p1 = await posto('Namibe 1', namibe.id);
check('o primeiro posto da loja recebe o código dela', (await prefixo(p1)) === 'NAM', await prefixo(p1));
const p2 = await posto('Namibe 2', namibe.id);
check('o segundo posto, NAM2', (await prefixo(p2)) === 'NAM2', await prefixo(p2));
const p3 = await posto('Tômbwa', tombwa.id);
check('a outra loja do Namibe (código NAM2, já usado por um posto) recebe outro', (await prefixo(p3)) === 'NAM22', await prefixo(p3));
const p4 = await posto('Sem loja', null);
check('um posto sem loja recebe PST', (await prefixo(p4)) === 'PST', await prefixo(p4));
await recusa('à mão, um prefixo de outro posto não se repete', () => q(`update public.kangest_postos set serie_prefixo = 'nam' where id = $1`, [p4]), /já é de outro posto/);
await q(`update public.kangest_postos set serie_prefixo = 'ond' where id = $1`, [p4]);
check('à mão: em maiúsculas', (await prefixo(p4)) === 'OND');
await q(`select public.kangest_posto_revogar($1)`, [p2]);
const p5 = await posto('Namibe 3', namibe.id);
check('o prefixo de um posto revogado nunca se reutiliza', (await prefixo(p5)) === 'NAM3', await prefixo(p5));

// --- a loja com dados não se apaga --------------------------------------------------------------------------------
await recusa('uma loja com postos do KanGest não se apaga', () => q(`delete from public.physical_stores where id = $1`, [namibe.id]), /postos do KanGest.*Desactive-a/);
const vazia = await loja(admin, 'Livraria — Teste vazia', 'Namibe');
await q(`delete from public.physical_stores where id = $1`, [vazia.id]);
check('uma loja sem dados apaga-se', (await q(`select count(*)::int n from public.physical_stores where id = $1`, [vazia.id]))[0].n === 0);
await q(`insert into public.staff_members (full_name, store_id) values ('Rui', $1)`, [cunene.id]);
await recusa('uma loja com funcionários também não', () => q(`delete from public.physical_stores where id = $1`, [cunene.id]), /funcionários/);

// --- o detector das séries repetidas -------------------------------------------------------------------------------
await q(`select public.kangest_emparelhar($1, $2, '1.4.11 Livraria')`, ['resumo-Namibe 1', Buffer.alloc(32, 1).toString('base64')]);
await q(`select public.kangest_emparelhar($1, $2, '1.4.11 Livraria')`, ['resumo-Tômbwa', Buffer.alloc(32, 2).toString('base64')]);
const doc = (id, serie, numero) => ({
  tipo: 'documento',
  documento: {
    documento_id: id, tipo_codigo: 'FR', grupo: 'VENDAS', serie, numero, numero_doc: `FR ${serie}/${numero}`, data_emissao: '2026-11-28',
    data_hora: '2026-11-28T10:00:00', consumidor_final: true, total_liquido: 100, total_iva: 14, total: 114, estado: 'N', hash: `H${id}${serie}`,
    hash_anterior: '', hash_controlo: 'abcd', hash_versao: 1,
  },
  linhas: [],
});
const receber = async (p, lote) => (await q(`select public.kangest_receber($1, $2::jsonb) r`, [p, JSON.stringify(lote)]))[0].r;
await receber(p1, [doc(1, 'NAM2026', 1)]);
await receber(p3, [doc(1, 'NAM222026', 1)]);
check('séries diferentes: nada a avisar', (await como(admin, `select * from public.kangest_series_em_colisao()`)).length === 0);
// dois KanGest com o prefixo antigo (o «N» do KIGEST, igual nos dois): o aviso aparece
await receber(p1, [doc(2, 'N2026', 1)]);
await receber(p3, [doc(2, 'N2026', 1)]);
const colisoes = await como(admin, `select * from public.kangest_series_em_colisao()`);
check('a mesma série em dois postos: o aviso, com os dois', colisoes.length === 1 && colisoes[0].serie === 'N2026' && colisoes[0].postos.length === 2, colisoes);
await recusa('o detector só para quem gere as configurações', () => como(membro, `select * from public.kangest_series_em_colisao()`), /Sem permissão/);

console.log(`lojas-novas: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
