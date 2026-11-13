// Cenários das duas migrações do KiGest (20261112140000_catalogo_do_kigest e
// 20261112141000_descricoes_que_faltavam), com as migrações reais:
//   PGLITE_MODULE=… node scripts/pglite/kigest.mjs supabase/migrations
// Instruções em base.mjs e em docs/catalogo/KIGEST.md.
//
// Uma base vazia não diria nada: estas migrações mexem num catálogo que já existe, e que tem
// duas camadas que contam as duas:
//
//  - os 124 produtos à venda, que a chave pública lê;
//  - os 93 que a migração 20261110090000 trouxe das fotografias da loja, dos quais o dono já
//    publicou 21 (são parte dos 124) e 72 continuam ocultos, sem preço.
//
// Os 93 já estão na base quando este cenário começa: foram criados pelas migrações que correram
// acima. O que se faz aqui é afastar-lhes o código — em produção o gatilho deu-lhes LIV-101 e
// seguintes, porque o contador ia nos 100, e aqui deu-lhes LIV-001, que colide com os códigos
// verdadeiros — tirar os 21 que já estão publicados (esses entram pela lista de cima, com o
// código e o preço que têm) e escrever os 124 à venda. Ficam 196 produtos, como em produção.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb, migrationSql } from './base.mjs';

const dir = process.argv[2];
const CATALOGO = '20261112140000_catalogo_do_kigest.sql';
const DESCRICOES = '20261112141000_descricoes_que_faltavam.sql';
const PUBLICACAO = '20261112142000_kigest_descricoes_e_publicacao.sql';
const ANTERIOR = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().filter((f) => f < CATALOGO).at(-1).slice(0, 14);
const mapa = JSON.parse(readFileSync('docs/catalogo/mapa-kigest-20261112.json', 'utf8'));
const textos = JSON.parse(readFileSync('docs/catalogo/descricoes-kigest.json', 'utf8'));
// No mapa, quem tem book_code está à venda; quem não tem é um dos que ficaram ocultos.
const aVenda = mapa.catalogo.filter((p) => p.book_code);
const ocultos = mapa.catalogo.filter((p) => !p.book_code);

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

const jaNaBase = await q('select id, title from public.stock_books order by title');
check('as migrações anteriores deixam os 93 produtos das fotografias', jaNaBase.length === 93, jaNaBase.length);
for (const [i, r] of jaNaBase.entries()) {
  await q('update public.stock_books set book_code = $1 where id = $2', [`PRE-${String(i + 1).padStart(3, '0')}`, r.id]);
}
await q('delete from public.stock_books where lower(btrim(title)) = any($1::text[])',
  [aVenda.map((p) => p.title.trim().toLowerCase())]);
check(`sobram os ${ocultos.length} que continuam ocultos`,
  (await q('select count(*)::int n from public.stock_books'))[0].n === ocultos.length);

for (const p of aVenda) {
  await q(`insert into public.stock_books (title, book_code, product_type, genre, price, stock, isbn, description, active, cover)
                values ($1, $2, $3, $4, $5, $6, $7, $8, true, 'https://livrariaadventista.com/images/capas/' || $2 || '.jpg')
           on conflict (book_code) where book_code <> '' do update
              set title = excluded.title, product_type = excluded.product_type, genre = excluded.genre,
                  price = excluded.price, stock = excluded.stock, isbn = excluded.isbn,
                  description = excluded.description, active = true, cover = excluded.cover`,
  [p.title, p.book_code, p.product_type, p.genre, p.price, p.stock, p.isbn,
    p.description === 'ESCRITA' ? `<p>Descrição escrita pela equipa para o ${p.book_code}, com mais de sessenta caracteres de texto a sério.</p>` : p.description]);
}
// O retrato do catálogo, pelo título: é a chave que serve às duas camadas. A coluna kigest_ref
// só existe depois da migração, por isso o retrato de partida não a pede.
const retratoPorTitulo = async (comRef = true) => Object.fromEntries(
  (await q(`select title, book_code, price, stock, isbn, description, active${comRef ? ', kigest_ref' : ''} from public.stock_books`))
    .map((r) => [r.title.trim().toLowerCase(), r]),
);
const antes = await retratoPorTitulo(false);
check(`o catálogo de partida tem os ${aVenda.length} à venda e os ${ocultos.length} ocultos`,
  Object.keys(antes).length === mapa.catalogo.length, Object.keys(antes).length);
check('e só os à venda estão activos',
  (await q('select count(*) filter (where active)::int n from public.stock_books'))[0].n === aVenda.length);

const catalogo = migrationSql(readFileSync(join(dir, CATALOGO), 'utf8'));
const descricoes = migrationSql(readFileSync(join(dir, DESCRICOES), 'utf8'));
const publicacao = migrationSql(readFileSync(join(dir, PUBLICACAO), 'utf8'));
await db.exec(catalogo);
await db.exec(descricoes);

const chave = (t) => String(t).trim().toLowerCase();
const depois = await retratoPorTitulo();

// 1. A coluna nova e a sua unicidade.
const [coluna] = await q(`select data_type, is_nullable from information_schema.columns
                           where table_schema = 'public' and table_name = 'stock_books' and column_name = 'kigest_ref'`);
check('a coluna kigest_ref existe, é texto e não aceita nulos', coluna?.data_type === 'text' && coluna?.is_nullable === 'NO', coluna);
await q(`insert into public.stock_books (title, product_type, kigest_ref, active) values ('Teste A', 'livro', 'ref-de-teste', false)`);
let duplicou = false;
try {
  await q(`insert into public.stock_books (title, product_type, kigest_ref, active) values ('Teste B', 'livro', 'ref-de-teste', false)`);
  duplicou = true;
} catch { /* é o que se espera */ }
check('dois produtos não podem apontar para o mesmo artigo do KiGest', !duplicou);
await q(`insert into public.stock_books (title, product_type, active) values ('Só do site 1', 'livro', false), ('Só do site 2', 'livro', false)`);
check('produtos sem artigo no KiGest não colidem entre si',
  (await q(`select count(*)::int n from public.stock_books where kigest_ref = ''`))[0].n >= 2);
await q(`delete from public.stock_books where title in ('Teste A', 'Só do site 1', 'Só do site 2')`);

// 2. Os produtos emparelhados: ligados, com o preço e o stock da loja.
const errados = mapa.ligados.filter((l) => {
  const r = depois[chave(l.titulo_site)];
  return !r || r.kigest_ref !== l.kigest_ref || Number(r.price) !== l.preco_depois || Number(r.stock) !== l.stock_depois;
});
check(`os ${mapa.ligados.length} produtos emparelhados ficaram com a referência, o preço e o stock do KiGest`,
  errados.length === 0, errados.slice(0, 3));

// Os que estavam ocultos sem preço são os que mais ganham: passam a ter preço e stock, que era
// o que lhes faltava para poderem ser publicados.
const ocultosLigados = mapa.ligados.filter((l) => !l.book_code);
check(`os ${ocultosLigados.length} ocultos que a loja também vende ganharam preço`,
  ocultosLigados.length > 0 && ocultosLigados.every((l) => Number(depois[chave(l.titulo_site)].price) > 0), ocultosLigados.length);
check('e continuam ocultos — publicá-los é decisão do dono',
  ocultosLigados.every((l) => depois[chave(l.titulo_site)].active === false));
check('os ligados pelo id da loja da editora ficaram certos',
  mapa.ligados.filter((l) => l.via === 'cpb').every((l) => depois[chave(l.titulo_site)].kigest_ref === l.kigest_ref),
  mapa.ligados.filter((l) => l.via === 'cpb').length);

// O caso que custa dinheiro: estava à venda no site e não havia na loja.
const vendiaSemTer = mapa.ligados.filter((l) => l.stock_antes > 0 && l.stock_depois === 0);
check('os que o site vendia sem haver na loja ficaram a zero',
  vendiaSemTer.length > 0 && vendiaSemTer.every((l) => Number(depois[chave(l.titulo_site)].stock) === 0), vendiaSemTer.length);

// O ISBN entra onde faltava e não pisa o que já estava lá.
const comIsbnNovo = mapa.ligados.filter((l) => l.isbn_novo && !l.isbn_antes);
check('o ISBN foi preenchido onde faltava',
  comIsbnNovo.length > 0 && comIsbnNovo.every((l) => depois[chave(l.titulo_site)].isbn === l.isbn_novo), comIsbnNovo.length);
const jaTinhaIsbn = mapa.ligados.filter((l) => l.isbn_antes);
check('o ISBN que já estava preenchido não foi tocado',
  jaTinhaIsbn.every((l) => depois[chave(l.titulo_site)].isbn === l.isbn_antes), jaTinhaIsbn.map((l) => l.book_code));

// Os produtos que o KiGest não conhece ficam exactamente como estavam.
const intocados = mapa.so_no_site.map((bc) => aVenda.find((p) => p.book_code === bc)).filter(Boolean);
check('os produtos que só existem no site não mudaram de preço nem de stock',
  intocados.every((p) => {
    const r = depois[chave(p.title)];
    return Number(r.price) === p.price && Number(r.stock) === p.stock && r.kigest_ref === '';
  }), intocados.length);

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
// A guarda que apanha o que o emparelhamento em JavaScript não pode ver: nenhum produto novo
// repete um título que já existia na base.
const titulosRepetidos = await q(`select lower(btrim(title)) t, count(*)::int n from public.stock_books
                                   group by 1 having count(*) > 1`);
check('nenhum título ficou duplicado no catálogo', titulosRepetidos.length === 0, titulosRepetidos.slice(0, 5));

// 4. Nada disto chega à loja: um visitante continua a ver os mesmos produtos.
const activos = await anon(`select count(*)::int n from public.stock_books where active`);
check(`o visitante continua a ver só os ${aVenda.length} produtos de sempre`, activos[0].n === aVenda.length, activos[0].n);

// 5. As descrições.
const semDescricao = mapa.catalogo.filter((p) => p.book_code && p.description !== 'ESCRITA');
check(`os ${semDescricao.length} produtos à venda sem descrição ficaram com uma`,
  semDescricao.length === 24 && semDescricao.every((p) => (depois[chave(p.title)].description ?? '').length > 120), semDescricao.length);
check('nenhuma descrição nova é o título repetido',
  semDescricao.every((p) => !/^<p>[^<]{0,80}<\/p>$/.test(depois[chave(p.title)].description)));
const comDescricao = mapa.catalogo.filter((p) => p.description === 'ESCRITA');
check('as descrições que já estavam escritas ficaram como estavam',
  comDescricao.every((p) => depois[chave(p.title)].description === antes[chave(p.title)].description),
  comDescricao.filter((p) => depois[chave(p.title)].description !== antes[chave(p.title)].description).map((p) => p.title).slice(0, 3));
check('as funções auxiliares da migração não ficaram na base',
  (await q(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'private' and p.proname in ('chave_texto', 'texto_simples')`))[0].n === 0);

// 6. A terceira migração: descrição, capa e publicação.
const ocultosAntes = (await q('select count(*) filter (where not active)::int n from public.stock_books'))[0].n;
await db.exec(publicacao);
const semNome = new Set(textos.sem_nome.map((x) => x.kigest_ref));
const comTexto = await q(`select kigest_ref, title, product_type, description, cover, active, price
                            from public.stock_books where kigest_ref <> ''`);
const novosAgora = comTexto.filter((r) => mapa.novos.some((n) => n.kigest_ref === r.kigest_ref));
check(`os ${mapa.novos.length} produtos do KiGest estão todos na base`, novosAgora.length === mapa.novos.length, novosAgora.length);
const comDescricaoNova = novosAgora.filter((r) => !semNome.has(r.kigest_ref));
check('cada um ficou com descrição e com capa',
  comDescricaoNova.every((r) => (r.description ?? '').length > 60 && (r.cover ?? '').includes('/capas/kigest/')),
  comDescricaoNova.filter((r) => !(r.description ?? '').length).map((r) => r.kigest_ref).slice(0, 3));
check('a descrição não é o título repetido',
  comDescricaoNova.every((r) => !new RegExp(`^<p>${r.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</p>$`).test(r.description)));
check(`os ${semNome.size} sem nome legível ficaram sem descrição e ocultos`,
  novosAgora.filter((r) => semNome.has(r.kigest_ref)).every((r) => (r.description ?? '') === '' && r.active === false),
  [...semNome].length);
check('publicaram-se os que têm preço, capa, descrição e nome',
  comDescricaoNova.filter((r) => r.product_type !== 'vestuario').every((r) => r.active === true),
  comDescricaoNova.filter((r) => r.product_type !== 'vestuario' && !r.active).map((r) => r.kigest_ref).slice(0, 5));
check('o vestuário ficou oculto — uma t-shirt sem tamanhos compra-se sem escolher o tamanho',
  comDescricaoNova.filter((r) => r.product_type === 'vestuario').every((r) => r.active === false));
// Os que a migração das fotografias deixou ocultos à espera de preço: capa e descrição já
// tinham, e agora que o KiGest lhes deu preço entram à venda.
const ocultosComPreco = mapa.ligados.filter((l) => !l.book_code && l.preco_depois > 0);
const estadoDeles = await q('select title, active, price from public.stock_books where lower(btrim(title)) = any($1::text[])',
  [ocultosComPreco.map((l) => l.titulo_site.trim().toLowerCase())]);
check(`os ${ocultosComPreco.length} que esperavam preço desde a migração das fotografias foram publicados`,
  estadoDeles.length === ocultosComPreco.length && estadoDeles.every((r) => r.active === true),
  estadoDeles.filter((r) => !r.active).map((r) => r.title).slice(0, 3));
// E os que continuam sem preço continuam ocultos: ninguém compra um livro a 0 Kz.
check('quem continua sem preço continua oculto',
  (await q('select count(*)::int n from public.stock_books where active and coalesce(price, 0) <= 0'))[0].n === 0);
check('o catálogo à venda cresceu', (await q('select count(*) filter (where active)::int n from public.stock_books'))[0].n > aVenda.length);
const ocultosDepois = (await q('select count(*) filter (where not active)::int n from public.stock_books'))[0].n;
check('e o que ficou oculto foi menos do que antes', ocultosDepois < ocultosAntes, { ocultosAntes, ocultosDepois });
// Uma capa verdadeira posta no painel não é trocada pela tipográfica.
const [umNovo] = comDescricaoNova;
await q(`update public.stock_books set cover = 'https://livrariaadventista.com/images/capas/foto-real.jpg', description = '' where kigest_ref = $1`, [umNovo.kigest_ref]);
await db.exec(publicacao);
const [reposto] = await q('select cover, description from public.stock_books where kigest_ref = $1', [umNovo.kigest_ref]);
check('a capa posta à mão fica, e a descrição em falta volta a ser escrita',
  reposto.cover.endsWith('foto-real.jpg') && reposto.description.length > 60, reposto.cover);

// 7. O registo da importação.
const [registo] = await q(`select origem, ligados, criados from private.kigest_import order by id desc limit 1`);
check('a importação ficou registada', registo?.ligados === mapa.ligados.length && registo?.criados === mapa.novos.length, registo);

// 8. Correr outra vez não muda nada nem duplica nada.
const retrato = async () => JSON.stringify(await q(`select book_code, title, kigest_ref, price, stock, isbn, description, active
                                                      from public.stock_books order by book_code`));
const antesDaSegunda = await retrato();
await db.exec(catalogo);
await db.exec(descricoes);
await db.exec(publicacao);
check('as três migrações podem correr outra vez sem mudar nada', (await retrato()) === antesDaSegunda);
check('e sem duplicar nenhum produto',
  (await q(`select count(*)::int n from public.stock_books`))[0].n === mapa.catalogo.length + mapa.novos.length);

console.log(`kigest: ${ok} ok, ${fail} falhas`);
if (fail) process.exit(1);
