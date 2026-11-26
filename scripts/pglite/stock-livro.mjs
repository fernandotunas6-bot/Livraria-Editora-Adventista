// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O livro único de stock, em sombra (KANGEST ONE, fase B1; migração 20261126190000_stock_livro), com as migrações
// reais:
//   PGLITE_MODULE=… node scripts/pglite/stock-livro.mjs supabase/migrations
// O que se confere: a abertura e os movimentos entram uma vez só (chave de idempotência); o livro não se altera nem se
// apaga; a conferência com a fotografia do posto; o resumo para o painel; e quem pode ler e escrever.
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
const servidor = (sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await tx.exec(`set local role service_role`);
  return (await tx.query(sql, params)).rows;
});
const pessoa = async (email, role = 'member', permissions = null) => {
  const [u] = await q(`insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id`, [email]);
  await q(`update public.profiles set role = $2, permissions = coalesce($3::jsonb, permissions) where id = $1`, [u.id, role, permissions ? JSON.stringify(permissions) : null]);
  return u.id;
};
const receber = async (posto, aberturas, movimentos, epoca = '20261126T090000') =>
  (await servidor(`select public.stock_livro_receber($1, $2, $3::jsonb, $4::jsonb) r`, [posto, epoca, JSON.stringify(aberturas), JSON.stringify(movimentos)]))[0].r;
const conferir = async (posto) => servidor(`select * from public.stock_livro_conferir($1)`, [posto]);

const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
const [livro] = await q(`insert into public.stock_books (title, price, stock, active, kigest_ref) values ('O Desejado', 5700, 10, true, 'LIV-001') returning id`);
const posto = (await q(`select public.kangest_posto_criar('Caixa do Huambo', $1, 'r-livro-1', null) id`, [loja.id]))[0].id;
await recusa('um posto por emparelhar não escreve no livro', () => receber(posto, [], []), /revogado/);
await q(`update public.kangest_postos set estado = 'activo', chave_publica = 'x' where id = $1`, [posto]);

// --- a abertura ------------------------------------------------------------------------------------------------------
const r1 = await receber(posto, [
  { armazem_id: 1, referencia: 'LIV-001', quantidade: 12, momento: '2026-11-26T09:00:00Z' },
  { armazem_id: 2, referencia: 'LIV-001', quantidade: 3, momento: '2026-11-26T09:00:00Z' },
  { armazem_id: 1, referencia: 'LIV-002', quantidade: 0, momento: '2026-11-26T09:00:00Z' },
], []);
check('três aberturas', r1.aberturas === 3, r1);
const ab = await q(`select * from public.stock_movimentos where tipo = 'abertura' and armazem_id = 1 and referencia = 'LIV-001'`);
check('a abertura liga ao produto e à loja do posto', ab.length === 1 && ab[0].book_id === livro.id && ab[0].store_id === loja.id && Number(ab[0].quantidade) === 12, ab);
check('a abertura repetida não conta outra vez', (await receber(posto, [{ armazem_id: 1, referencia: 'LIV-001', quantidade: 99 }], [])).aberturas === 0);

// --- os movimentos ----------------------------------------------------------------------------------------------------
const r2 = await receber(posto, [], [
  { mov_id: 101, armazem_id: 1, referencia: 'LIV-001', quantidade: -2, tipo: 'venda', documento: 'FR A/12', momento: '2026-11-26T10:00:00Z' },
  { mov_id: 102, armazem_id: 1, referencia: 'LIV-001', quantidade: 1, tipo: 'devolucao', documento: 'NC A/3', momento: '2026-11-26T10:05:00Z' },
  { mov_id: 103, armazem_id: 1, referencia: 'LIV-001', quantidade: 5, tipo: 'inventada' },
  { mov_id: 104, armazem_id: 2, referencia: 'LIV-001', quantidade: -3, tipo: 'transferencia', documento: 'TR 1' },
]);
check('três aceites, uma recusada', JSON.stringify(r2.aceites) === '[101,102,104]' && r2.erros.length === 1 && r2.erros[0].mov_id === 103, r2);
const r3 = await receber(posto, [], [{ mov_id: 101, armazem_id: 1, referencia: 'LIV-001', quantidade: -2, tipo: 'venda' }]);
check('o mesmo movimento outra vez: aceite (já está), mas não conta', JSON.stringify(r3.aceites) === '[101]' && r3.repetidos === 1, r3);
const soma = await q(`select sum(quantidade)::numeric s from public.stock_movimentos where posto_id = $1 and armazem_id = 1 and referencia = 'LIV-001'`, [posto]);
check('o livro do armazém 1: 12 − 2 + 1 = 11', Number(soma[0].s) === 11, soma);

// --- não se altera nem se apaga ------------------------------------------------------------------------------------
await recusa('mudar a quantidade', () => q(`update public.stock_movimentos set quantidade = 100 where chave like '%:mov:101'`), /não se altera/);
await recusa('apagar', () => q(`delete from public.stock_movimentos where chave like '%:mov:101'`), /não se apaga/);
await q(`delete from public.stock_books where id = $1`, [livro.id]);
const depois = await q(`select count(*) n, count(book_id) com_produto from public.stock_movimentos where posto_id = $1`, [posto]);
await recusa('uma abertura sem época', () => receber(posto, [{ armazem_id: 1, referencia: 'LIV-009', quantidade: 1 }], [], ''), /sem época/);
check('o produto sai e o livro fica inteiro (só sem a ligação ao produto)', Number(depois[0].n) === 6 && Number(depois[0].com_produto) === 0, depois);

// --- a conferência com a fotografia ----------------------------------------------------------------------------------
await q(`insert into public.kangest_stock (ligacao, referencia, armazem_id, quantidade, reservado, disponivel, online, store_id)
         values ('posto:' || $1, 'LIV-001', 1, 11, 0, 11, true, $2), ('posto:' || $1, 'LIV-001', 2, 1, 0, 1, true, $2)`, [posto, loja.id]);
const c1 = await conferir(posto);
check('o armazém 2 não bate certo (livro 0, fotografia 1); o 1 e a abertura a zero batem', c1.length === 1 && Number(c1[0].armazem_id) === 2
  && Number(c1[0].livro) === 0 && Number(c1[0].fotografia) === 1, c1);
const resumo = (await servidor(`select * from public.stock_livro_resumo()`)).find((x) => x.posto_id === posto);
check('o resumo para o painel', resumo && Number(resumo.movimentos) === 6 && resumo.aberto === true && Number(resumo.divergencias) === 1, resumo);

// --- voltar a ligar: a abertura nova só grava o que faltava ----------------------------------------------------------
// (entretanto, com o posto desligado, saíram 4 livros do armazém 1 e entraram 2 no 2, e a fotografia diz 7 e 1)
await q(`update public.kangest_stock set quantidade = 7 where ligacao = 'posto:' || $1 and armazem_id = 1`, [posto]);
const r4 = await receber(posto, [
  { armazem_id: 1, referencia: 'LIV-001', quantidade: 7 },
  { armazem_id: 2, referencia: 'LIV-001', quantidade: 1 },
], [], '20261127T080000');
check('duas aberturas novas', r4.aberturas === 2, r4);
const dif = await q(`select armazem_id, quantidade from public.stock_movimentos where tipo = 'abertura' and documento = 'abertura 20261127T080000' order by armazem_id`);
check('só a diferença: −4 no armazém 1 e +1 no 2', dif.length === 2 && Number(dif[0].quantidade) === -4 && Number(dif[1].quantidade) === 1, dif);
check('agora bate tudo certo', (await conferir(posto)).length === 0, await conferir(posto));
check('a mesma abertura outra vez não conta', (await receber(posto, [{ armazem_id: 1, referencia: 'LIV-001', quantidade: 7 }], [], '20261127T080000')).aberturas === 0);

// --- o stock negativo: uma venda sem Internet deixa o livro abaixo de zero; entra, e fica à vista para acerto ---
await receber(posto, [], [{ mov_id: 201, armazem_id: 1, referencia: 'LIV-001', quantidade: -9, tipo: 'venda', documento: 'FR A/40' }]);
const neg = await servidor(`select * from public.stock_livro_negativos($1)`, [posto]);
check('o artigo com o livro abaixo de zero', neg.length === 1 && neg[0].referencia === 'LIV-001' && Number(neg[0].livro) === -2, neg);
const rneg = (await servidor(`select * from public.stock_livro_resumo()`)).find((x) => x.posto_id === posto);
check('o resumo conta-o', Number(rneg.negativos) === 1, rneg);
await recusa('ninguém de fora lê os negativos', () => como(null, `select * from public.stock_livro_negativos($1)`, [posto], 'anon'), /permission denied/);

// --- quem lê e quem escreve --------------------------------------------------------------------------------------------
const catalogo = await pessoa('catalogo@x.ao', 'manager', { manage_catalog: true });
const cliente = await pessoa('cliente@x.ao');
check('quem gere o catálogo lê o livro', (await como(catalogo, `select count(*) n from public.stock_movimentos`))[0].n > 0);
check('um cliente não vê nada', Number((await como(cliente, `select count(*) n from public.stock_movimentos`))[0].n) === 0);
await recusa('ninguém de fora escreve', () => como(catalogo, `insert into public.stock_movimentos (referencia, tipo, quantidade, origem, chave, momento) values ('X', 'ajuste', 1, 'x', 'x', now())`), /permission denied/);
await recusa('ninguém de fora chama o receber', () => como(catalogo, `select public.stock_livro_receber($1, 'x', '[]'::jsonb, '[]'::jsonb)`, [posto]), /permission denied/);
await recusa('nem a conferência', () => como(catalogo, `select * from public.stock_livro_conferir($1)`, [posto]), /permission denied/);

console.log(`stock-livro: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
