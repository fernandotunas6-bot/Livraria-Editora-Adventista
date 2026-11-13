#!/usr/bin/env node
// Gera a migração que dá descrição e capa aos produtos vindos do KiGest e os publica.
//
//   node scripts/kigest/descricoes.mjs docs/catalogo/mapa-kigest-<data>.json \
//     --sql supabase/migrations/<AAAAMMDDHHMMSS>_kigest_descricoes_e_publicacao.sql
//
// Os artigos do KiGest chegam só com nome, preço e existência. Faltam-lhes as duas coisas sem
// as quais um produto não se põe à venda:
//
//  - A **descrição**. É o texto da página do produto, é a `meta description` que o Google
//    mostra e é o que aparece quando alguém partilha o livro numa conversa. Sem ela o
//    seo-catalogo.mjs cai para o título e as três coisas ficam a repetir a mesma linha. Estão
//    escritas à mão em `docs/catalogo/descricoes-kigest.json`, uma a uma.
//  - A **capa**. Não há fotografia de nenhum destes produtos. Em vez de repetir a mesma
//    `capa-por-definir.webp` 189 vezes — uma grelha onde o cliente não distingue um produto do
//    outro — o `scripts/catalogo/capa_tipografica.py` gera uma capa tipográfica por produto, no
//    desenho da casa, com o título no lugar onde aquela diz «Capa por definir». Vê-se que é
//    tipográfica: não imita a arte da editora. Quando houver fotografia, substitui-se no painel.
//
// E publica. Quem entra à venda tem de ter as quatro coisas: preço acima de zero, capa,
// descrição e um nome que um cliente consiga ler. Os que não têm ficam ocultos e vão no
// relatório — ver a secção `sem_nome` do ficheiro das descrições.
//
// Publica também os que a migração das fotografias (20261110090000) deixou ocultos à espera de
// preço: capa e descrição já tinham, e o KiGest acabou de lhes dar o preço.
//
// O vestuário fica de fora de propósito, com ou sem descrição: uma t-shirt sem tamanhos
// compra-se sem escolher o tamanho. Põem-se os tamanhos no painel, como variantes, e depois
// publica-se.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESCRICOES = 'docs/catalogo/descricoes-kigest.json';
// Qual é a capa de qual produto. Escrito pelo scripts/catalogo/capa_tipografica.py, que é quem
// as gera: dois títulos diferentes podem dar o mesmo nome de ficheiro, e sem este índice o
// segundo produto ficava com a capa do primeiro.
const INDICE_CAPAS = 'docs/catalogo/capas-kigest.json';
const CAPAS = 'app/web/public/images/capas/kigest';
const SITE = 'https://livrariaadventista.com/images/capas/kigest';

const lit = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;

// O mesmo nome de ficheiro que o capa_tipografica.py escreve.
export function ficheiroDaCapa(titulo) {
  const semAcento = String(titulo ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return `${semAcento.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 70).replace(/-$/, '')}.webp`;
}

export function gerarDescricoes({ mapa, descricoes, capas = {}, capaExiste = () => true }) {
  const semNome = new Set((descricoes.sem_nome ?? []).map((x) => x.kigest_ref));
  const linhas = [];
  const semCapa = [];
  const semTexto = [];
  for (const n of mapa.novos) {
    const texto = descricoes.descricoes?.[n.kigest_ref];
    const capa = capas[n.kigest_ref];
    if (semNome.has(n.kigest_ref)) continue;
    if (!texto) { semTexto.push(n); continue; }
    if (!capa || !capaExiste(capa)) { semCapa.push(n); continue; }
    linhas.push({ ref: n.kigest_ref, titulo: n.titulo, tipo: n.tipo, capa: `${SITE}/${capa}`, texto });
  }

  const sql = [];
  sql.push(`-- Descrição, capa e publicação dos produtos que vieram do KiGest.
--
-- A migração 20261112140000 trouxe ${mapa.novos.length} artigos da loja com preço e existência, ocultos,
-- porque lhes faltava o que nenhum catálogo pode dispensar: uma descrição e uma capa.
--
-- A descrição é o texto da página do produto, é a meta description que o Google mostra e é o que
-- aparece quando alguém partilha o livro numa conversa — sem ela o seo-catalogo.mjs cai para o
-- título e as três coisas ficam a repetir a mesma linha. As ${linhas.length} descrições estão escritas à
-- mão, uma a uma, em docs/catalogo/descricoes-kigest.json: dizem o que o produto é, para que
-- serve e quem o usa, e nada mais — nenhum número que não esteja na ficha, nenhuma promessa de
-- conteúdo que ninguém confirmou.
--
-- A capa é tipográfica, gerada pelo scripts/catalogo/capa_tipografica.py no desenho da casa (o
-- gradiente, o emblema e a moldura da capa-por-definir.webp), com o título no lugar onde aquela
-- diz «Capa por definir». Nenhum destes produtos tem fotografia; repetir a mesma capa genérica
-- ${mapa.novos.length} vezes dava uma grelha onde o cliente não distingue um produto do outro. Vê-se que é
-- tipográfica: não imita a arte da editora. Quando houver fotografia, substitui-se no painel.
--
-- ${(descricoes.sem_nome ?? []).length} artigos ficam de fora, e ficam ocultos: o nome com que estão lançados no KiGest não se
-- lê («POR QUE NAO MAS ESTPITA», «REGRAS PARA QUE») ou não diz que produto é («CARTÃO»,
-- «FOLHETOS», «BROCHURAS»). Um cliente não compra o que não consegue ler. Corrige-se o nome no
-- KiGest e entram na exportação seguinte.`);

  sql.push(`
-- 1 de 3 — descrição e capa, pela referência do artigo no KiGest.
with textos(kigest_ref, capa, descricao) as (values
${linhas.map((l, i) => {
    const cast = i === 0 ? ['::text', '::text', '::text'] : ['', '', ''];
    return `  (${lit(l.ref)}${cast[0]}, ${lit(l.capa)}${cast[1]}, ${lit(l.texto)}${cast[2]})`;
  }).join(',\n')}
)
update public.stock_books b
   set description = t.descricao,
       -- A capa só se escreve onde não há nenhuma: se alguém já pôs a fotografia verdadeira no
       -- painel, não se troca por uma capa tipográfica.
       cover = case when coalesce(b.cover, '') = '' then t.capa else b.cover end,
       updated = now()
  from textos t
 where b.kigest_ref = t.kigest_ref
   and coalesce(btrim(regexp_replace(b.description, '<[^>]*>', '', 'g')), '') = '';`);

  // Os que a migração das fotografias trouxe sem texto: a ronda anterior só conseguiu sinopse
  // da editora para 44 dos 93. Estes não têm referência do KiGest — ligam-se pelo título.
  const porTitulo = Object.entries(descricoes.por_titulo ?? {});
  if (porTitulo.length > 0) {
    sql.push(`
-- 2 de 3 — os ${porTitulo.length} que a migração das fotografias (20261110090000) trouxe sem descrição: dos 93,
-- só 44 tinham sinopse da editora. Capa já têm; o que lhes faltava era o texto. Os que também
-- já têm preço são publicados no passo seguinte; os outros esperam o preço no painel.
with textos(titulo, descricao) as (values
${porTitulo.map(([t, d], i) => {
    const cast = i === 0 ? ['::text', '::text'] : ['', ''];
    return `  (${lit(t)}${cast[0]}, ${lit(d)}${cast[1]})`;
  }).join(',\n')}
)
update public.stock_books b
   set description = t.descricao, updated = now()
  from textos t
 where lower(btrim(b.title)) = lower(btrim(t.titulo))
   and coalesce(btrim(regexp_replace(b.description, '<[^>]*>', '', 'g')), '') = '';`);
  }

  sql.push(`
-- 3 de 3 — publicar.
--
-- Entra à venda quem tem as quatro coisas: preço acima de zero, capa, descrição e nome legível.
-- Isto apanha dois grupos ao mesmo tempo: os que acabaram de receber descrição e capa aqui, e os
-- que a migração das fotografias deixou ocultos à espera de preço e que o KiGest acabou de
-- apreçar — capa e descrição esses já tinham.
--
-- O vestuário fica de fora com ou sem descrição: uma t-shirt sem tamanhos compra-se sem escolher
-- o tamanho. Põem-se os tamanhos no painel, como variantes, e publica-se então:
--   update public.stock_books set active = true
--    where product_type = 'vestuario' and price > 0
--      and jsonb_array_length(coalesce(versions, '[]'::jsonb)) > 0;
update public.stock_books
   set active = true, updated = now()
 where not active
   and coalesce(price, 0) > 0
   and coalesce(btrim(cover), '') <> ''
   and coalesce(btrim(regexp_replace(description, '<[^>]*>', '', 'g')), '') <> ''
   and product_type <> 'vestuario';`);

  return {
    sql: `${sql.join('\n')}\n`, linhas, semCapa, semTexto,
    porTitulo: Object.keys(descricoes.por_titulo ?? {}), semNome: descricoes.sem_nome ?? [],
  };
}

const corrido = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (corrido) {
  const args = process.argv.slice(2);
  const ficheiro = args.find((a) => !a.startsWith('--'));
  const opcao = (nome) => (args.indexOf(nome) >= 0 ? args[args.indexOf(nome) + 1] : null);
  if (!ficheiro) {
    console.error('uso: descricoes.mjs <mapa.json> [--sql <saída>]');
    process.exit(2);
  }
  const mapa = JSON.parse(readFileSync(ficheiro, 'utf8'));
  const descricoes = JSON.parse(readFileSync(path.join(RAIZ, DESCRICOES), 'utf8'));
  const indice = path.join(RAIZ, INDICE_CAPAS);
  if (!existsSync(indice)) {
    console.error(`falta o ${INDICE_CAPAS} — corra primeiro o scripts/catalogo/capa_tipografica.py`);
    process.exit(1);
  }
  const feito = gerarDescricoes({
    mapa,
    descricoes,
    capas: JSON.parse(readFileSync(indice, 'utf8')),
    capaExiste: (f) => existsSync(path.join(RAIZ, CAPAS, f)),
  });
  if (feito.semTexto.length > 0 || feito.semCapa.length > 0) {
    for (const n of feito.semTexto) console.error(`sem descrição: ${n.kigest_ref} ${n.titulo}`);
    for (const n of feito.semCapa) console.error(`sem capa: ${n.kigest_ref} ${n.titulo}`);
    console.error('a migração não é escrita enquanto faltar descrição ou capa a algum produto');
    process.exit(1);
  }
  const alvo = opcao('--sql');
  if (alvo) writeFileSync(alvo, feito.sql);
  else process.stdout.write(feito.sql);
  console.error(`${feito.linhas.length} produtos com descrição e capa · ${feito.porTitulo.length} descrições pelo título`
    + ` · ${feito.semNome.length} ficam ocultos por não terem nome legível`);
}
