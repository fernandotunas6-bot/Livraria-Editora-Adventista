// Cenários da migração dos 93 produtos novos da loja (20261110090000_produtos_novos_da_loja),
// com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/produtos-novos.mjs supabase/migrations
// Instruções em base.mjs e em docs/catalogo/NOVOS-PRODUTOS.md.
//
// Uma base vazia não chega: em produção o catálogo já tem 102 produtos (LIV-001…LIV-100,
// COL-001 e COL-002), os contadores dos códigos vão adiantados e alguns títulos podem repetir-se.
// Por isso aplicam-se as migrações até à anterior, põe-se lá um catálogo como o de produção, e só
// então corre esta — duas vezes, porque o cabeçalho promete que pode correr mais de uma.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb, migrationSql } from './base.mjs';

const dir = process.argv[2];
const MIGRACAO = '20261110090000_produtos_novos_da_loja.sql';
const ANTERIOR = migrationFiles(dir).filter((f) => f < MIGRACAO).at(-1).slice(0, 14);
const CAPAS = 'app/web/public/images/capas/novos';
const mapa = JSON.parse(readFileSync('docs/catalogo/mapa-novos-produtos.json', 'utf8'));

function migrationFiles(d) { return readdirSync(d).filter((f) => f.endsWith('.sql')).sort(); }

let ok = 0;
let fail = 0;
const check = (name, cond, extra) => {
  if (cond) ok++;
  else { fail++; console.log('FALHOU:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};

const db = await freshDb(dir, { upTo: ANTERIOR });
const q = async (s, p = []) => (await db.query(s, p)).rows;
const anon = (sql) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.role', 'anon', true), set_config('request.jwt.claim.sub', '', true)`);
  await tx.exec('set local role anon');
  return (await tx.query(sql)).rows;
});

// O catálogo de produção: 100 livros e 2 colecções, com os códigos que já têm. Um dos títulos é o
// de um produto da lista nova, escrito com outra caixa e espaços à volta: não pode entrar outra vez.
const repetido = mapa.find((p) => p.tipo === 'livro').titulo;
await q(`insert into public.stock_books (title, book_code, product_type, price, stock, active, cover)
         select 'Livro existente ' || n, 'LIV-' || lpad(n::text, 3, '0'), 'livro', 5000, 3, true,
                'https://livrariaadventista.com/images/capas/LIV-' || lpad(n::text, 3, '0') || '.jpg'
           from generate_series(1, 100) n`);
await q(`insert into public.stock_books (title, book_code, product_type, price, stock, active)
         values ('Colecção A', 'COL-001', 'livro', 30000, 1, true), ('Colecção B', 'COL-002', 'livro', 30000, 1, true)`);
await q(`update public.stock_books set title = $1 where book_code = 'LIV-050'`, [`  ${repetido.toUpperCase()}  `]);
// Os contadores, como em produção: a migração tipos_de_produto calculou-os a partir dos códigos
// que já existiam, e aqui a tabela estava vazia quando ela correu.
await q(`update private.product_code_counters c set last_value = greatest(c.last_value, x.n)
           from (select left(book_code, 4) prefix, max(substr(book_code, 5)::int) n from public.stock_books group by 1) x
          where c.prefix = x.prefix`);

const sql = migrationSql(readFileSync(join(dir, MIGRACAO), 'utf8'));
await db.exec(sql);
const novos = () => q(`select title, book_code, product_type, cover, description, price, stock, active
                         from public.stock_books where cover like '%/images/capas/novos/%' order by book_code`);
const depoisDaPrimeira = await novos();

// 1. Entram todos menos o que já existia, e nenhum dos antigos muda.
check('entram os 92 que faltavam (93 menos o título que já existia)', depoisDaPrimeira.length === 92, depoisDaPrimeira.length);
check('o título repetido não entra outra vez, mesmo com outra caixa e espaços',
  (await q(`select count(*)::int n from public.stock_books where lower(btrim(title)) = lower($1)`, [repetido]))[0].n === 1);
const [antigos] = await q(`select count(*)::int n, count(*) filter (where active)::int activos,
                                  min(book_code) primeiro, max(book_code) ultimo
                             from public.stock_books where cover not like '%/images/capas/novos/%' or cover is null`);
check('os 102 produtos antigos ficam como estavam', antigos.n === 102 && antigos.activos === 102, antigos);

// 2. Entram ocultos, sem preço nem stock: ninguém compra um livro a 0 Kz.
check('todos ocultos', depoisDaPrimeira.every((r) => r.active === false));
check('preço e stock a zero', depoisDaPrimeira.every((r) => Number(r.price) === 0 && Number(r.stock) === 0));
const [visiveis] = await anon(`select count(*)::int n from public.stock_books where cover like '%/images/capas/novos/%'`);
check('um visitante não os vê na loja', visiveis.n === 0, visiveis);

// 3. Códigos: o prefixo do tipo, a seguir aos que já existem, sem repetir.
const prefixos = { livro: 'LIV-', biblia: 'BIB-', musica: 'MUS-', desbravadores: 'DBV-', vestuario: 'VES-' };
for (const r of depoisDaPrimeira) {
  if (!r.book_code.startsWith(prefixos[r.product_type])) check(`prefixo de ${r.title}`, false, r);
}
const livrosNovos = depoisDaPrimeira.filter((r) => r.product_type === 'livro').map((r) => r.book_code).sort();
check('os livros novos continuam a numeração (LIV-101 em diante)', livrosNovos[0] === 'LIV-101', livrosNovos.slice(0, 3));
const [codigos] = await q(`select count(*)::int n, count(distinct book_code)::int distintos from public.stock_books`);
check('nenhum código repetido no catálogo', codigos.n === codigos.distintos, codigos);
const porTipo = Object.fromEntries((await q(`select product_type, count(*)::int n from public.stock_books
                                               where cover like '%/images/capas/novos/%' group by 1`)).map((r) => [r.product_type, r.n]));
check('tipos: 54 livros (um já existia), 23 bíblias, 3 hinários, 9 de Desbravadores, 3 de vestuário',
  porTipo.livro === 54 && porTipo.biblia === 23 && porTipo.musica === 3 && porTipo.desbravadores === 9 && porTipo.vestuario === 3, porTipo);

// 4. Correr outra vez não muda nada.
await db.exec(sql);
const depoisDaSegunda = await novos();
check('segunda vez: nada de novo', depoisDaSegunda.length === depoisDaPrimeira.length, depoisDaSegunda.length);
check('segunda vez: os códigos ficam os mesmos',
  JSON.stringify(depoisDaSegunda.map((r) => r.book_code)) === JSON.stringify(depoisDaPrimeira.map((r) => r.book_code)));

// 5. A migração e os ficheiros batem certo: cada capa existe, e o mapa é o que a migração insere.
const daMigracao = [...sql.matchAll(/\/images\/capas\/novos\/([a-z0-9-]+\.jpg)\$t\$/g)].map((m) => m[1]);
check('a migração tem as 93 capas, sem repetir', daMigracao.length === 93 && new Set(daMigracao).size === 93, daMigracao.length);
const emFalta = daMigracao.filter((f) => !existsSync(join(CAPAS, f)));
check('todas as capas existem em app/web/public/images/capas/novos', emFalta.length === 0, emFalta);
const naPasta = readdirSync(CAPAS);
const sobram = naPasta.filter((f) => !daMigracao.includes(f));
check('não há capas na pasta que nenhum produto usa', sobram.length === 0, sobram);
const doMapa = mapa.map((p) => `${p.slug}.jpg`);
check('o mapa (docs/catalogo) lista as mesmas capas que a migração',
  JSON.stringify([...doMapa].sort()) === JSON.stringify([...daMigracao].sort()),
  doMapa.filter((f) => !daMigracao.includes(f)));

// 6. Publicar com a consulta do cabeçalho da migração (copiada de lá, para o teste não divergir):
// só sai o que tem preço, e o vestuário só com tamanhos.
const publicar = sql.match(/--\s+(update public\.stock_books set active = true[\s\S]*?;)/)[1].replace(/\n--\s*/g, ' ');
await q(`update public.stock_books set price = 4500, stock = 5
          where cover like '%/images/capas/novos/%' and product_type in ('biblia', 'vestuario')`);
await q(publicar);
const vendaveis = async () => Object.fromEntries((await anon(`select product_type, count(*)::int n from public.stock_books
                                   where cover like '%/images/capas/novos/%' group by 1`)).map((r) => [r.product_type, r.n]));
let aVenda = await vendaveis();
check('a publicação só põe à venda o que tem preço, e o vestuário sem tamanhos fica de fora',
  aVenda.biblia === 23 && Object.keys(aVenda).length === 1, aVenda);
// Com os tamanhos postos no painel, a t-shirt já sai.
await q(`update public.stock_books set versions = '[{"label":"M","stock":"3"},{"label":"L","stock":"2"}]'
          where cover like '%/images/capas/novos/%' and product_type = 'vestuario' and title like 'T-shirt preta%'`);
await q(publicar);
aVenda = await vendaveis();
check('o vestuário com tamanhos já é publicado', aVenda.vestuario === 1 && aVenda.biblia === 23, aVenda);

console.log(`produtos-novos: ${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
