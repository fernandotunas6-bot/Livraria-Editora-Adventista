// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cenários dos artigos novos do KanGest (migração 20261124190000_kangest_artigos_novos), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kangest-artigos.mjs supabase/migrations
// Instruções em base.mjs e em docs/KANGEST.md §4.1.
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
const como = (role, sub, sql, params = []) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', $2, true), set_config('request.jwt.claim.sub', $1, true),
                         set_config('request.headers', '{}', true)`, [sub || '', role]);
  await tx.exec(`set local role ${role}`);
  return (await tx.query(sql, params)).rows;
});
const novo = async (ref, titulo, preco = 5000, ean = '') =>
  (await q(`select public.kangest_artigo_novo($1, $2, $3, $4) r`, [ref, titulo, preco, ean]))[0].r;
const produto = async (ref) => (await q(
  `select id, title, active, price::float8 price, stock::float8 stock, isbn, publisher, kangest_novo_em, kangest_parecido_com
     from public.stock_books where kigest_ref = $1`, [ref]))[0];

// --- só o servidor cria; a lista das vistas não se lê de fora ---------------------------------------------
await recusa('kangest_artigo_novo: o público não executa', () => como('anon', null, `select public.kangest_artigo_novo('X', 'Y', 1, '')`), /permission denied/);
await recusa('kangest_artigo_novo: as contas não executam', () => como('authenticated', null, `select public.kangest_artigo_novo('X', 'Y', 1, '')`), /permission denied/);
await recusa('referências vistas: as contas não lêem', () => como('authenticated', null, `select * from private.kangest_referencias_vistas`), /permission denied/);

// --- as referências decididas à mão a 12/11 já estão vistas ---------------------------------------------
const vistas = (await q(`select count(*)::int n from private.kangest_referencias_vistas where origem = 'kigest-20261112'`))[0].n;
check('as 397 referências da importação de 12/11 entram como vistas', vistas === 397, vistas);

// --- um artigo novo entra oculto, com o nome, o preço, o código de barras e o stock do KanGest -----------
const [loja] = await q(`insert into public.physical_stores (name, province, address, active) values ('Livraria — Huambo', 'Huambo', 'Huambo', true) returning id`);
await q(`insert into public.kangest_stock (ligacao, referencia, armazem_id, quantidade, reservado, disponivel, online, store_id)
         values ('central', 'NOVO-1', 1, 12, 2, 10, true, $1)`, [loja.id]);
const r1 = await novo('NOVO-1', '  Um   Livro Novo da Loja ', 7500, '978-65-86391-99-9');
const p1 = await produto('NOVO-1');
check('criado', r1.feito === 'criado' && r1.book_id === p1?.id, r1);
check('oculto: não se publica sozinho', p1?.active === false, p1);
check('nome sem espaços a mais, preço do KanGest, código de barras só com algarismos', p1?.title === 'Um Livro Novo da Loja' && p1?.price === 7500 && p1?.isbn === '9786586391999', p1);
check('marcado como novo do KanGest, sem parecido', p1?.kangest_novo_em !== null && p1?.kangest_parecido_com === null, p1);
check('o stock que o KanGest já tinha mandado (o disponível dos armazéns online)', p1?.stock === 10, p1);
const loja1 = await q(`select available from public.store_stock where book_id = $1`, [p1.id]);
check('«temos» na loja do armazém', loja1.length === 1 && loja1[0].available === true, loja1);
const publico = await como('anon', null, `select id from public.stock_books where kigest_ref = 'NOVO-1'`);
check('o público não vê o rascunho', publico.length === 0, publico);

// --- uma vez só ---------------------------------------------------------------------------------------------
const r1b = await novo('NOVO-1', 'Outro nome', 9999);
check('a mesma referência outra vez: existe, nada muda', r1b.feito === 'existe' && (await produto('NOVO-1')).price === 7500, r1b);
await q(`delete from public.stock_books where kigest_ref = 'NOVO-1'`);
const r1c = await novo('NOVO-1', 'Um Livro Novo da Loja', 7500);
check('apagado por alguém: não volta a ser criado', r1c.feito === 'já visto' && !(await produto('NOVO-1')), r1c);

// --- o que foi decidido à mão a 12/11 não volta ----------------------------------------------------------
// 00007 foi ligado a um produto do site (que esta base de testes não tem): sem as vistas, voltava como novo
const r2 = await novo('00007', 'VIAJEM AO SOBRENATURAL', 10000);
check('referência da importação de 12/11 sem produto: já vista, nada criado', r2.feito === 'já visto' && !(await produto('00007')), r2);
const r3 = await novo('00006', '101 SEGREDOS', 22000);
check('referência com produto (um dos 201 da importação): existe', r3.feito === 'existe', r3);

// --- parecidos: ficam marcados para uma pessoa decidir, nada se liga sozinho ------------------------------
const [caminho] = await q(`insert into public.stock_books (title, price, stock, active) values ('Caminho a Cristo', 900, 3, true) returning id`);
const r4 = await novo('NOVO-2', 'CAMINHO A CRISTO!', 1000);
const p4 = await produto('NOVO-2');
check('mesmo nome (sem caixa nem pontuação): criado e marcado como parecido', r4.feito === 'criado' && p4?.kangest_parecido_com === caminho.id && r4.parecido_com === caminho.id, { r4, p4 });
check('o produto do site fica como estava (sem referência, com o preço dele)',
  (await q(`select kigest_ref, price::float8 price from public.stock_books where id = $1`, [caminho.id]))[0].kigest_ref === '', caminho);

const [educacao] = await q(`insert into public.stock_books (title, price, stock, active) values ('Crónicas da Colportagem no Bié', 15000, 2, true) returning id`);
const r5 = await novo('NOVO-3', 'CRONICAS DA COLPORTAGEM NO BIE', 15000);
check('sem acentos também é o mesmo nome', (await produto('NOVO-3'))?.kangest_parecido_com === educacao.id, r5);

const [biblia] = await q(`insert into public.stock_books (title, price, stock, active, isbn) values ('Bíblia de Estudo Andrews', 45000, 1, true, '978-85-345-1111-1') returning id`);
const r6 = await novo('NOVO-4', 'BIBLIA ANDREWS CAPA DURA', 46000, '9788534511111');
check('mesmo código de barras com outro nome: parecido', (await produto('NOVO-4'))?.kangest_parecido_com === biblia.id, r6);

await q(`delete from public.stock_books where id = $1`, [educacao.id]);
check('apagado o parecido, o rascunho fica sem a marca', (await produto('NOVO-3'))?.kangest_parecido_com === null);

// --- entradas que não dão produto ----------------------------------------------------------------------------
check('sem referência', (await novo('', 'Livro', 1000)).feito === 'sem referência ou sem nome');
check('sem nome', (await novo('NOVO-5', '   ', 1000)).feito === 'sem referência ou sem nome');
const r7 = await novo('NOVO-6', 'Caneta', null, '123');
const p7 = await produto('NOVO-6');
check('sem preço fica a 0 (oculto); código de barras curto não conta', r7.feito === 'criado' && p7?.price === 0 && p7?.isbn === '', p7);

console.log(`kangest-artigos: ${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
