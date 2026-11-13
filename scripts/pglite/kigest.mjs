// Cenários das duas migrações do KiGest (20261112140000_catalogo_do_kigest e
// 20261112141000_descricoes_que_faltavam), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kigest.mjs supabase/migrations
// Instruções em base.mjs e em docs/catalogo/KIGEST.md.
//
// Uma base vazia não diria nada: estas migrações mexem num catálogo que já existe. Aplicam-se
// por isso as migrações até à anterior, monta-se o catálogo tal como estava em produção quando
// a exportação foi feita (docs/catalogo/mapa-kigest-20261112.json, secção "catalogo") e só
// então correm as duas — duas vezes, porque o cabeçalho promete que podem correr outra vez.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb, migrationSql } from './base.mjs';

const dir = process.argv[2];
const CATALOGO = '20261112140000_catalogo_do_kigest.sql';
const DESCRICOES = '20261112141000_descricoes_que_faltavam.sql';
const ficheiros = () => readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const ANTERIOR = ficheiros().filter((f) => f < CATALOGO).at(-1).slice(0, 14);
const mapa = JSON.parse(readFileSync('docs/catalogo/mapa-kigest-20261112.json', 'utf8'));

let ok = 0;
let fail = 0;
const check = (nome, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', nome, extra === undefined ? '' : JSON.stringify(extra)); }
};

const db = await freshDb(dir, { upTo: ANTERIOR });
const q = async (s, p = []) => (await db.query(s, p)).rows;
const anon = (sql) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'anon', true), set_config('request.jwt.claim.sub', '', true)`);
  await tx.exec('set local role anon');
  return (await tx.query(sql)).rows;
});

// O catálogo de produção: os 124 produtos com o código, o título, o preço, o stock, o ISBN e a
// descrição que tinham, todos activos, como estavam.
//
// As migrações anteriores já deixam produtos na base (os 93 da loja, da 20261110090000, entre
// outros), por isso não se insere por cima: escreve-se o retrato de produção sobre o que lá
// está — pelo código, que é o mesmo nas duas — e apaga-se o que produção não tem. Fica uma
// base igual à que a exportação encontrou.
for (const p of mapa.catalogo) {
  await q(`insert into public.stock_books (title, book_code, product_type, genre, price, stock, isbn, description, active, cover)
                values ($1, $2, $3, $4, $5, $6, $7, $8, true, 'https://livrariaadventista.com/images/capas/' || $2 || '.jpg')
           on conflict (book_code) where book_code <> '' do update
              set title = excluded.title, product_type = excluded.product_type, genre = excluded.genre,
                  price = excluded.price, stock = excluded.stock, isbn = excluded.isbn,
                  description = excluded.description, active = true, cover = excluded.cover`,
  [p.title, p.book_code, p.product_type, p.genre, p.price, p.stock, p.isbn,
    p.description === 'ESCRITA' ? `<p>Descrição escrita pela equipa para o ${p.book_code}, com mais de sessenta caracteres de texto a sério.</p>` : p.description]);
}
await q('delete from public.stock_books where not (book_code = any($1::text[]))', [mapa.catalogo.map((p) => p.book_code)]);
await q(`update private.product_code_counters c set last_value = greatest(c.last_value, x.n)
           from (select left(book_code, 4) prefix, max(nullif(regexp_replace(substr(book_code, 5), '\\D', '', 'g'), '')::int) n
                   from public.stock_books group by 1) x
          where c.prefix = x.prefix`);
const antes = Object.fromEntries((await q(`select book_code, price, stock, isbn, description from public.stock_books`))
  .map((r) => [r.book_code, r]));
check('o catálogo de partida tem os 124 produtos de produção', Object.keys(antes).length === 124, Object.keys(antes).length);

const catalogo = migrationSql(readFileSync(join(dir, CATALOGO), 'utf8'));
const descricoes = migrationSql(readFileSync(join(dir, DESCRICOES), 'utf8'));
await db.exec(catalogo);
await db.exec(descricoes);

// 1. A coluna nova e a sua unicidade.
const [coluna] = await q(`select data_type, is_nullable, column_default from information_schema.columns
                           where table_schema = 'public' and table_name = 'stock_books' and column_name = 'kigest_ref'`);
check('a coluna kigest_ref existe, é texto e não aceita nulos', coluna?.data_type === 'text' && coluna?.is_nullable === 'NO', coluna);
await q(`insert into public.stock_books (title, product_type, kigest_ref, active) values ('Teste A', 'livro', 'ref-de-teste', false)`);
let duplicou = false;
try {
  await q(`insert into public.stock_books (title, product_type, kigest_ref, active) values ('Teste B', 'livro', 'ref-de-teste', false)`);
  duplicou = true;
} catch { /* é o que se espera */ }
check('dois produtos não podem apontar para o mesmo artigo do KiGest', !duplicou);
// Mas vários produtos só do site (kigest_ref vazio) continuam a poder existir.
await q(`insert into public.stock_books (title, product_type, active) values ('Só do site 1', 'livro', false), ('Só do site 2', 'livro', false)`);
check('produtos sem artigo no KiGest não colidem entre si',
  (await q(`select count(*)::int n from public.stock_books where kigest_ref = ''`))[0].n >= 2);
await q(`delete from public.stock_books where title in ('Teste A', 'Só do site 1', 'Só do site 2')`);

// 2. Os produtos que já existiam: ligados, com o preço e o stock da loja.
const ligados = await q(`select book_code, kigest_ref, price, stock, isbn from public.stock_books where kigest_ref <> '' and book_code in (
                           select unnest($1::text[]))`, [mapa.ligados.map((l) => l.book_code)]);
check(`os ${mapa.ligados.length} produtos emparelhados ficaram ligados`, ligados.length === mapa.ligados.length, ligados.length);
const porCodigo = Object.fromEntries(ligados.map((r) => [r.book_code, r]));
const errados = mapa.ligados.filter((l) => {
  const r = porCodigo[l.book_code];
  return !r || r.kigest_ref !== l.kigest_ref || Number(r.price) !== l.preco_depois || Number(r.stock) !== l.stock_depois;
});
check('cada um ficou com a referência, o preço e o stock do KiGest', errados.length === 0, errados.slice(0, 3));

// O caso que custa dinheiro: estava à venda no site e não havia na loja.
const vendiaSemTer = mapa.ligados.filter((l) => l.stock_antes > 0 && l.stock_depois === 0);
check('os que o site vendia sem haver na loja ficaram a zero',
  vendiaSemTer.length > 0 && vendiaSemTer.every((l) => Number(porCodigo[l.book_code].stock) === 0), vendiaSemTer.length);

// O ISBN entra onde faltava e não pisa o que já estava lá.
const comIsbnNovo = mapa.ligados.filter((l) => l.isbn_novo && !l.isbn_antes);
check('o ISBN foi preenchido onde faltava',
  comIsbnNovo.length > 0 && comIsbnNovo.every((l) => porCodigo[l.book_code].isbn === l.isbn_novo), comIsbnNovo.length);
const jaTinhaIsbn = mapa.ligados.filter((l) => l.isbn_antes);
check('o ISBN que já estava preenchido não foi tocado',
  jaTinhaIsbn.every((l) => porCodigo[l.book_code].isbn === l.isbn_antes), jaTinhaIsbn.map((l) => l.book_code));

// Os produtos que o KiGest não conhece ficam exactamente como estavam.
const intocados = await q(`select book_code, price, stock from public.stock_books where book_code = any($1::text[])`, [mapa.so_no_site]);
check('os produtos que só existem no site não mudaram de preço nem de stock',
  intocados.every((r) => Number(r.price) === antes[r.book_code].price && Number(r.stock) === antes[r.book_code].stock));
check('e nenhum deles ficou com referência do KiGest',
  (await q(`select count(*)::int n from public.stock_books where book_code = any($1::text[]) and kigest_ref <> ''`, [mapa.so_no_site]))[0].n === 0);

// 3. Os produtos novos: entram ocultos, com preço e stock, e sem capa.
const novos = await q(`select title, product_type, genre, kigest_ref, price, stock, active, cover, description, book_code
                         from public.stock_books where kigest_ref = any($1::text[]) order by title`,
[mapa.novos.map((n) => n.kigest_ref)]);
check(`entram os ${mapa.novos.length} artigos que o site não tinha`, novos.length === mapa.novos.length, novos.length);
check('todos ocultos', novos.every((r) => r.active === false));
check('todos sem capa e sem descrição', novos.every((r) => (r.cover ?? '') === '' && (r.description ?? '') === ''));
check('todos com o preço e o stock do KiGest', novos.every((r) => {
  const n = mapa.novos.find((x) => x.kigest_ref === r.kigest_ref);
  return Number(r.price) === n.preco && Number(r.stock) === n.stock;
}));
check('o código foi atribuído pelo gatilho, com o prefixo do tipo',
  novos.every((r) => r.book_code?.startsWith({ livro: 'LIV-', biblia: 'BIB-', musica: 'MUS-', vestuario: 'VES-', papelaria: 'MAT-', desbravadores: 'DBV-', revista: 'REV-', uniforme: 'UNI-' }[r.product_type])),
  novos.filter((r) => !r.book_code).slice(0, 3));
check('nenhum título ficou em maiúsculas', novos.every((r) => r.title !== r.title.toUpperCase()));
check('os repetidos do KiGest não entraram',
  (await q(`select count(*)::int n from public.stock_books where kigest_ref = any($1::text[])`,
    [mapa.repetidos.flatMap((g) => g.sai)]))[0].n === 0);

// 4. Nada disto chega à loja: um visitante continua a ver os mesmos produtos.
const activos = await anon(`select count(*)::int n from public.stock_books where active`);
check('o visitante continua a ver só os 124 produtos de sempre', activos[0].n === 124, activos[0].n);

// 5. As descrições.
const comDescricao = await q(`select book_code, description from public.stock_books where book_code = any($1::text[])`,
  [mapa.catalogo.filter((p) => p.description !== 'ESCRITA').map((p) => p.book_code)]);
check('os 24 produtos sem descrição ficaram com uma',
  comDescricao.length === 24 && comDescricao.every((r) => (r.description ?? '').length > 120), comDescricao.length);
check('nenhuma descrição nova é o título repetido',
  comDescricao.every((r) => !/^<p>[^<]{0,80}<\/p>$/.test(r.description)));
const escritas = await q(`select book_code, description from public.stock_books where book_code = any($1::text[])`,
  [mapa.catalogo.filter((p) => p.description === 'ESCRITA').map((p) => p.book_code)]);
check('as descrições que já estavam escritas ficaram como estavam',
  escritas.every((r) => r.description === antes[r.book_code].description), escritas.filter((r) => r.description !== antes[r.book_code].description).map((r) => r.book_code));
check('as funções auxiliares da migração não ficaram na base',
  (await q(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'private' and p.proname in ('chave_texto', 'texto_simples')`))[0].n === 0);

// 6. O registo da importação.
const [registo] = await q(`select origem, ligados, criados from private.kigest_import order by id desc limit 1`);
check('a importação ficou registada', registo?.ligados === mapa.ligados.length && registo?.criados === mapa.novos.length, registo);

// 7. Correr outra vez não muda nada nem duplica nada.
const retrato = async () => JSON.stringify(await q(`select book_code, title, kigest_ref, price, stock, isbn, description, active
                                                      from public.stock_books order by book_code`));
const antesDaSegunda = await retrato();
await db.exec(catalogo);
await db.exec(descricoes);
check('as duas migrações podem correr outra vez sem mudar nada', (await retrato()) === antesDaSegunda);
check('e sem duplicar nenhum produto',
  (await q(`select count(*)::int n from public.stock_books`))[0].n === 124 + mapa.novos.length);

console.log(`kigest: ${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
