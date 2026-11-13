#!/usr/bin/env node
// Gera a migração e o relatório de uma exportação do KiGest:
//
//   node scripts/kigest/migracao.mjs <ficheiro.kigest> [--sql <saída.sql>] [--relatorio <saída.md>]
//
// Lê o catálogo do site com a chave pública (o mesmo caminho do scripts/seo-catalogo.mjs: só
// o que qualquer visitante lê) e escreve SQL — não toca na base de dados. Quem publica é o
// merge no main, pelo Actions, como todas as migrações.
//
// Corre-se outra vez a cada exportação nova. Da segunda vez em diante os produtos já estão
// ligados pelo kigest_ref e o emparelhamento por palavras deixa de ser preciso.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { artigos, lerExportacao } from './exportacao.mjs';
import { aplicarDecisoes, lerDecisoes } from './decisoes.mjs';
import { catalogoOculto } from './catalogo-oculto.mjs';
import { conciliar, diferencas, duplicados, stockPorConfirmar } from './conciliar.mjs';
import { prateleira, tipoDeProduto, titulo } from './titulos.mjs';

// A editora é o que o catálogo já usa como editor por omissão nos 102 produtos da casa. Onde o
// livro é de outra editora, corrige-se no painel antes de publicar — vai no relatório.
const EDITORA = 'Livraria e Editora Adventista';

// Literal de texto com o escape do SQL padrão: a plica duplica-se. Dólares não servem de
// delimitador — um título com «$kg$» lá dentro fechava o literal a meio e o resto da migração
// passava a ser interpretado como SQL.
const lit = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const num = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) throw new Error(`número inválido: ${v}`);
  return String(Math.round(n * 100) / 100);
};

export function catalogoDoSite() {
  const env = existsSync('app/web/.env') ? readFileSync('app/web/.env', 'utf8') : '';
  const de = (nome) => process.env[nome]
    ?? env.split('\n').find((l) => l.startsWith(`${nome}=`))?.slice(nome.length + 1).trim().replace(/^["']|["']$/g, '');
  const url = de('VITE_SUPABASE_URL');
  const chave = de('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!url || !chave) throw new Error('faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY');
  const campos = 'id,book_code,title,price,stock,isbn,product_type,genre,active,description';
  // Da primeira vez a coluna kigest_ref ainda não existe — é esta migração que a cria — e o
  // PostgREST responde 400 a quem a pede. Tenta com ela e, se não existir, segue sem.
  const buscar = (lista) => fetch(`${url}/rest/v1/stock_books?select=${lista}&limit=2000`, { headers: { apikey: chave } });
  return buscar(`${campos},kigest_ref`).then(async (r) => {
    if (r.ok) return r.json();
    const sem = await buscar(campos);
    if (!sem.ok) throw new Error(`o catálogo respondeu ${sem.status}`);
    return sem.json();
  });
}

// ISBN só quando é de livro (978/979). Os códigos começados em 2 são internos da loja e não
// identificam nada fora dela.
const isbnUtil = (ean) => (/^97[89]/.test(ean) ? ean : '');

const cru = (t) => String(t ?? '').replace(/<[^>]*>/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// Descrição em falta: vazia, curta a ponto de não dizer nada, ou um pedaço do próprio título
// — «Biblia Sagrada» contra «Bíblia Sagrada — capa dura bordô com flores e pássaro».
// Ao contrário não serve: uma descrição a sério nomeia o livro de que fala, e quase todas as
// boas contêm o título lá dentro.
// É a mesma regra da migração 20261112141000 — se uma mudar, a outra tem de mudar com ela.
export const MINIMO_DESCRICAO = 60;
export const descricaoEmFalta = (p) => {
  const texto = String(p.description ?? '').replace(/<[^>]*>/g, '').trim();
  if (texto === '') return true;
  if (texto.length < MINIMO_DESCRICAO) return true;
  const d = cru(texto);
  return d !== '' && cru(p.title).includes(d);
};

export function gerar({ exportacao, artigosKigest, produtosSite, decisoes = { paraODono: [] } }) {
  // O título corrigido calcula-se uma vez e segue com o artigo: é com ele que se emparelha e é
  // com ele que o produto entra na loja. Comparar o nome cru e criar o produto com o corrigido
  // era o que fazia entrar doze produtos repetidos.
  const comTitulo = artigosKigest.map((a) => ({ ...a, titulo: titulo(a.descricao) }));
  const r = conciliar(comTitulo, produtosSite);
  const pares = diferencas(r.firmes);
  const gruposRepetidos = duplicados(r.semPar);
  const repetidos = new Set(gruposRepetidos.flatMap((g) => g.slice(1)).map((a) => a.ref));
  const chaveTitulo = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const candidatos = r.semPar
    .filter((a) => !repetidos.has(a.ref))
    .map((a) => ({ artigo: a, title: a.titulo, tipo: tipoDeProduto(a.titulo), genero: prateleira(a.titulo) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt'));

  // Uma peneira antes de criar produto novo: dois artigos do KiGest que, depois de corrigidos,
  // dão o mesmo título («CONCELHO SOBRE MORDOMIA» e «CONSELHOS SOBRE MORDOMIA»). O `duplicados`
  // não os apanha porque têm preços diferentes, e o «not exists» do insert também não — dentro
  // da mesma instrução as linhas não se vêem umas às outras. Fica o que tem existência.
  //
  // Contra o produto que já existe no catálogo quem vale são as guardas em SQL do insert: a
  // chave pública não vê o que está oculto, e em SQL vê-se o catálogo todo.
  const porTituloNovo = new Map();
  const novos = [];
  const repetidosNoTitulo = [];
  for (const n of candidatos) {
    const k = chaveTitulo(n.title);
    const anterior = porTituloNovo.get(k);
    if (!anterior) {
      porTituloNovo.set(k, n);
      novos.push(n);
      continue;
    }
    // Fica o de maior existência; o outro vai para o relatório.
    if (n.artigo.stock > anterior.artigo.stock) {
      novos[novos.indexOf(anterior)] = n;
      porTituloNovo.set(k, n);
      repetidosNoTitulo.push({ fica: n, sai: anterior });
    } else {
      repetidosNoTitulo.push({ fica: anterior, sai: n });
    }
  }

  const sql = [];
  sql.push(`-- Catálogo alinhado com o KiGest (exportação de ${exportacao.meta.data}, ${exportacao.meta.origem}).
--
-- O KiGest é o programa de facturação que corre no computador da loja. É nele que se vende ao
-- balcão todos os dias, por isso é dele que vem a contagem do stock e o preço que o cliente
-- paga à porta. O site tinha os seus próprios números: o preço veio da lista da editora e o
-- stock foi posto à mão quando o produto entrou, e desde então nunca mais bateu com a loja.
--
-- Esta migração faz três coisas, por esta ordem:
--
--  1. Dá ao catálogo uma coluna kigest_ref — a referência do artigo no KiGest. É a chave que
--     faltava: sem ela, cada exportação obriga a emparelhar os dois catálogos pelos títulos,
--     e os títulos do KiGest estão em maiúsculas e com gralhas. Com ela, a próxima exportação
--     actualiza o stock sem adivinhar nada.
--  2. Liga ${pares.length} produtos que já existiam ao artigo do KiGest e passa a usar o stock e o preço
--     da loja. ${pares.filter((p) => !p.stockIgual).length} tinham stock diferente e ${pares.filter((p) => !p.precoIgual).length} tinham preço diferente. Preenche também
--     o ISBN em ${pares.filter((p) => isbnUtil(p.artigo.ean) && !p.produto.isbn).length} livros que estavam sem ele.
--  3. Traz ${novos.length} artigos que a loja vende e o site não tinha, TODOS OCULTOS (active = false),
--     com o preço e o stock do KiGest e sem capa. Ficam à espera de fotografia, descrição e de
--     uma leitura ao título antes de serem publicados — ver docs/catalogo/KIGEST.md.
--
-- Fica tudo registado em private.kigest_import: que exportação, quantos produtos mexeu e
-- quando. Correr duas vezes a mesma exportação não duplica nada (a chave é o kigest_ref).`);

  sql.push(`
alter table public.stock_books
  add column if not exists kigest_ref text not null default '';

comment on column public.stock_books.kigest_ref is
  'Referência do artigo no KiGest (tbArtigos.Referencia). Vazio = produto que só existe no site.';

-- Dois produtos do site não podem apontar para o mesmo artigo da loja: seria o mesmo stock
-- contado duas vezes.
create unique index if not exists stock_books_kigest_ref_idx
  on public.stock_books (kigest_ref) where kigest_ref <> '';

-- O registo de cada importação: que exportação entrou, o que mexeu e quando. Serve para
-- responder à pergunta «este stock é de quando?» sem ir ao computador da loja.
create table if not exists private.kigest_import (
  id bigserial primary key,
  exportacao timestamptz not null,
  origem text not null default '',
  ligados integer not null default 0,
  criados integer not null default 0,
  corrido_em timestamptz not null default now()
);
alter table private.kigest_import enable row level security;
revoke all on private.kigest_import from public, anon, authenticated;
revoke all on sequence private.kigest_import_id_seq from public, anon, authenticated;`);

  // 2. Ligação e alinhamento dos pares firmes. Em dois grupos, porque a chave não é a mesma:
  // os produtos que a chave pública vê trazem o book_code; os que estão ocultos não (ver
  // catalogo-oculto.mjs) e ligam-se pelo título exacto.
  const linhaPar = (p, i, campo) => {
    const cast = i === 0 ? ['::text', '::text', '::numeric', '::numeric', '::text'] : ['', '', '', '', ''];
    return `  (${lit(campo(p))}${cast[0]}, ${lit(p.artigo.ref)}${cast[1]}, `
      + `${num(p.artigo.preco)}${cast[2]}, ${num(p.artigo.stock)}${cast[3]}, ${lit(isbnUtil(p.artigo.ean))}${cast[4]})`;
  };
  const porCodigo = pares.filter((p) => p.produto.book_code);
  const porTitulo = pares.filter((p) => !p.produto.book_code);
  const CORPO = `   set kigest_ref = p.kigest_ref,
       price = p.preco,
       stock = p.stock,
       -- O ISBN só se escreve onde estava vazio: onde o site já tem um, é o da edição que o
       -- site vende e o do KiGest pode ser de outra.
       isbn = case when coalesce(b.isbn, '') = '' then p.ean else b.isbn end,
       updated = now()`;
  sql.push(`
-- 1 de 3 — os que já estavam à venda. Só entra aqui quem ganhou com folga: o artigo do KiGest
-- era o único candidato no topo e nenhum outro artigo da loja andava perto do mesmo produto. O
-- que ficou ambíguo (${r.ambiguos.length} artigos — as bíblias à cabeça, e os lenços, onde a loja separa o do
-- membro do de líder e o site tem um só) não entra aqui: está no relatório, para o dono decidir.
with pares(book_code, kigest_ref, preco, stock, ean) as (values
${porCodigo.map((p, i) => linhaPar(p, i, (x) => x.produto.book_code)).join(',\n')}
)
update public.stock_books b
${CORPO}
  from pares p
 where b.book_code = p.book_code
   and coalesce(b.kigest_ref, '') in ('', p.kigest_ref);`);

  if (porTitulo.length > 0) {
    sql.push(`
-- 2 de 3 — os ${porTitulo.length} que estão ocultos desde a migração 20261110090000 e que a loja também vende.
-- Estes ganham finalmente preço e stock, que era o que lhes faltava para poderem ser publicados.
-- A ligação é pelo título exacto, porque o código que o gatilho lhes deu em produção não está
-- escrito em lado nenhum. ${pares.filter((p) => !p.produto.book_code && p.via === 'cpb').length} deles confirmam-se pelo id na loja da editora, que o
-- KiGest usa como referência do artigo.
with pares(titulo, kigest_ref, preco, stock, ean) as (values
${porTitulo.map((p, i) => linhaPar(p, i, (x) => x.produto.title)).join(',\n')}
)
update public.stock_books b
${CORPO}
  from pares p
 where lower(btrim(b.title)) = lower(btrim(p.titulo))
   and coalesce(b.kigest_ref, '') in ('', p.kigest_ref);`);
  }

  // 3. Produtos novos, ocultos.
  const linhasNovos = novos.map((n, i) => {
    const cast = i === 0
      ? ['::text', '::text', '::text', '::text', '::text', '::numeric', '::numeric']
      : ['', '', '', '', '', '', ''];
    return `  (${lit(n.title)}${cast[0]}, ${lit(n.tipo)}${cast[1]}, ${lit(n.genero)}${cast[2]}, `
      + `${lit(n.artigo.ref)}${cast[3]}, ${lit(isbnUtil(n.artigo.ean))}${cast[4]}, `
      + `${num(n.artigo.preco)}${cast[5]}, ${num(n.artigo.stock)}${cast[6]})`;
  });
  sql.push(`
-- 3 de 3 — os que a loja vende e o site não tinha. Entram OCULTOS: sem capa e sem descrição,
-- um produto não se põe à venda. O título vem do KiGest com a caixa arrumada e as gralhas
-- conhecidas corrigidas (scripts/kigest/titulos.mjs); o que não se conseguiu confirmar ficou
-- como veio e está assinalado no relatório.
--
-- As três guardas do «not exists» são contra o produto repetido, e a do título e a do ISBN
-- valem por si: a chave pública não vê o que está oculto, por isso o emparelhamento em
-- JavaScript pode não ter visto um produto que já existe. Em SQL vê-se tudo.
insert into public.stock_books
  (title, product_type, genre, kigest_ref, isbn, price, stock, author, publisher, cover, description, active, featured)
select v.title, v.tipo, v.genero, v.kigest_ref, v.ean, v.preco, v.stock,
       '', ${lit(EDITORA)}, '', '', false, false
  from (values
${linhasNovos.join(',\n')}
  ) as v(title, tipo, genero, kigest_ref, ean, preco, stock)
 where not exists (select 1 from public.stock_books b where b.kigest_ref = v.kigest_ref)
   and not exists (select 1 from public.stock_books b where lower(btrim(b.title)) = lower(btrim(v.title)))
   and not exists (select 1 from public.stock_books b where v.ean <> '' and b.isbn = v.ean);

insert into private.kigest_import (exportacao, origem, ligados, criados)
values (${lit(exportacao.meta.data)}::timestamptz, ${lit(exportacao.meta.origem)}, ${pares.length}, ${novos.length});`);

  return {
    sql: `${sql.join('\n')}\n`, pares, novos, gruposRepetidos, repetidosNoTitulo,
    resultado: r, produtosSite, decisoes,
  };
}

// O que a migração decidiu, em JSON: serve de prova para quem revê o PR (dá para conferir
// número a número sem abrir o KiGest) e de cenário para o scripts/pglite/kigest.mjs.
export function mapa({
  exportacao, pares, novos, gruposRepetidos, repetidosNoTitulo = [], resultado, produtosSite,
}) {
  return {
    exportacao: exportacao.meta.data,
    origem: exportacao.meta.origem,
    ligados: pares.map((p) => ({
      book_code: p.produto.book_code,
      titulo_site: p.produto.title,
      artigo_kigest: p.artigo.descricao,
      kigest_ref: p.artigo.ref,
      preco_antes: p.precoSite,
      preco_depois: p.precoLoja,
      stock_antes: p.stockSite,
      stock_depois: p.stockLoja,
      isbn_antes: p.produto.isbn ?? '',
      isbn_novo: isbnUtil(p.artigo.ean),
      via: p.via,
    })),
    novos: novos.map((n) => ({
      titulo: n.title,
      artigo_kigest: n.artigo.descricao,
      kigest_ref: n.artigo.ref,
      tipo: n.tipo,
      genero: n.genero,
      preco: n.artigo.preco,
      stock: n.artigo.stock,
      isbn: isbnUtil(n.artigo.ean),
      parecidos: n.artigo.parecidos ?? [],
    })),
    repetidos: gruposRepetidos.map((g) => ({ fica: g[0].ref, sai: g.slice(1).map((a) => a.ref) })),
    repetidos_no_titulo: repetidosNoTitulo.map((x) => ({ fica: x.fica.artigo.ref, sai: x.sai.artigo.ref, titulo: x.fica.title })),
    ambiguos: resultado.ambiguos.map((a) => ({
      kigest_ref: a.artigo.ref,
      artigo_kigest: a.artigo.descricao,
      preco: a.artigo.preco,
      stock: a.artigo.stock,
      candidatos: a.alvos.map((p) => p.book_code || p.title),
    })),
    so_no_site: resultado.soNoSite.map((p) => p.book_code).filter(Boolean),
    catalogo: produtosSite.map((p) => ({
      book_code: p.book_code,
      title: p.title,
      product_type: p.product_type,
      genre: p.genre ?? '',
      price: Number(p.price ?? 0),
      stock: Number(p.stock ?? 0),
      isbn: p.isbn ?? '',
      description: descricaoEmFalta(p) ? (p.description ?? '') : 'ESCRITA',
    })),
  };
}

export function relatorio({
  exportacao, pares, novos, gruposRepetidos, repetidosNoTitulo = [], resultado,
  decisoes = { ligacoes: [], paraODono: [] },
}) {
  const kz = (v) => Number(v).toLocaleString('pt-PT', { maximumFractionDigits: 2 });
  const linhas = [];
  const t = (s) => linhas.push(s);
  t(`# Catálogo do site × catálogo da loja (KiGest)\n`);
  t(`Exportação de ${exportacao.meta.data}, de ${exportacao.meta.origem}.\n`);
  t(`| | |`);
  t(`|---|---|`);
  t(`| Artigos no KiGest | ${resultado.firmes.length + resultado.ambiguos.length + resultado.semPar.length} |`);
  t(`| Ligados a um produto do site | ${pares.length} |`);
  t(`| Por emparelhar à mão | ${resultado.ambiguos.length} |`);
  t(`| Entram ocultos | ${novos.length} |`);
  t(`| Repetidos no KiGest (não entram) | ${gruposRepetidos.reduce((s, g) => s + g.length - 1, 0)} |`);
  t(`| Produtos só do site | ${resultado.soNoSite.length} |`);
  t(`| Emparelhados à mão | ${(decisoes.ligacoes ?? []).length} |`);
  t(`| Deixados ao dono | ${(decisoes.paraODono ?? []).length} |`);

  const graves = pares.filter((p) => p.vendeSemTer);
  if (graves.length > 0) {
    t(`\n## À venda no site sem haver na loja\n`);
    t(`O cliente paga e depois não há livro. Passam a zero.\n`);
    t(`| Código | Produto | Stock no site | Na loja |`);
    t(`|---|---|---:|---:|`);
    for (const p of graves) t(`| ${p.produto.book_code} | ${p.produto.title} | ${p.stockSite} | ${p.stockLoja} |`);
  }
  const escondidos = pares.filter((p) => p.escondeOQueTem);
  if (escondidos.length > 0) {
    t(`\n## Dados por esgotados tendo livros na loja\n`);
    t(`| Código | Produto | Stock no site | Na loja |`);
    t(`|---|---|---:|---:|`);
    for (const p of escondidos) t(`| ${p.produto.book_code} | ${p.produto.title} | ${p.stockSite} | ${p.stockLoja} |`);
  }
  const precos = pares.filter((p) => !p.precoIgual);
  if (precos.length > 0) {
    t(`\n## Preços que mudam\n`);
    t(`| Código | Produto | No site | Na loja | Diferença |`);
    t(`|---|---|---:|---:|---:|`);
    for (const p of precos.sort((a, b) => Math.abs(b.precoLoja - b.precoSite) - Math.abs(a.precoLoja - a.precoSite))) {
      const pct = p.precoSite > 0 ? Math.round((p.precoLoja / p.precoSite - 1) * 100) : 0;
      t(`| ${p.produto.book_code} | ${p.produto.title} | ${kz(p.precoSite)} | ${kz(p.precoLoja)} | ${pct > 0 ? '+' : ''}${pct}% |`);
    }
  }
  const decididos = new Map((decisoes.ligacoes ?? []).map((l) => [l.kigest_ref, l]));
  if (decididos.size > 0) {
    t(`\n## Emparelhados à mão\n`);
    t(`O automático só aceita um par quando ganha com folga. Estes não ganhavam, mas resolvem-se`);
    t(`olhando — e a prova de cada um vai ao lado. Estão escritos em`);
    t(`\`docs/catalogo/kigest-decisoes.json\`; para desfazer um, tira-se de lá.\n`);
    t(`| Ref. | Artigo da loja | Produto do site | Porque |`);
    t(`|---|---|---|---|`);
    for (const l of decisoes.ligacoes) t(`| ${l.kigest_ref} | ${l.artigo} | ${l.book_code} | ${l.porque} |`);
  }
  if ((decisoes.paraODono ?? []).length > 0) {
    t(`\n## Ficam para o dono decidir\n`);
    t(`Não é falta de dados: é que a resposta não está nos dados. O site descreve as bíblias pela`);
    t(`capa («capa dura castanha») e a loja pela tradução («RA», «NTLH», «Umbundu»); e dos`);
    t(`hinários o site tem três, que só diferem na cor da capa, e a loja tem um artigo só. Quem`);
    t(`tem o livro na mão decide em dois minutos; de fora, ninguém.\n`);
    t(`| Ref. | Artigo da loja | Porque fica |`);
    t(`|---|---|---|`);
    for (const x of decisoes.paraODono) t(`| ${x.kigest_ref} | ${x.artigo} | ${x.porque} |`);
  }
  if (resultado.ambiguos.length > 0) {
    t(`\n## Por emparelhar à mão\n`);
    t(`O mesmo nome serve a vários produtos — as bíblias são o caso: o site tem meia dúzia`);
    t(`descritas pela capa («capa dura castanha») e a loja tem vinte descritas pela tradução`);
    t(`(«RA», «NTLH», «Letra Gigante», «Umbundu»). Só quem tem o livro na mão sabe qual é qual.`);
    t(`Depois de decidido, basta pôr a referência do KiGest no campo da ficha do produto.\n`);
    t(`| Ref. KiGest | Artigo da loja | Preço | Stock | Candidatos no site |`);
    t(`|---|---|---:|---:|---|`);
    for (const a of resultado.ambiguos.sort((x, y) => y.artigo.stock - x.artigo.stock)) {
      t(`| ${a.artigo.ref} | ${a.artigo.descricao} | ${kz(a.artigo.preco)} | ${a.artigo.stock} | ${a.alvos.map((p) => p.book_code).join(', ')} |`);
    }
  }
  if (gruposRepetidos.length > 0) {
    t(`\n## Lançados duas vezes no KiGest\n`);
    t(`Mesmo preço ao cêntimo e o mesmo título escrito de duas maneiras. Entra só um — o que`);
    t(`tem existência. Convém juntá-los no KiGest, senão voltam na exportação seguinte.\n`);
    t(`| Fica | Stock | Repetido | Stock |`);
    t(`|---|---:|---|---:|`);
    for (const g of gruposRepetidos) {
      t(`| ${g[0].descricao} | ${g[0].stock} | ${g.slice(1).map((a) => a.descricao).join(' / ')} | ${g.slice(1).map((a) => a.stock).join(' / ')} |`);
    }
  }
  if (repetidosNoTitulo.length > 0) {
    t(`\n## Dois artigos com o mesmo nome depois de corrigido\n`);
    t(`«CORDERINNHO» e «CORDERINHO» dão o mesmo «Cordeirinho». Entra só um — o que tem`);
    t(`existência — e convém juntá-los no KiGest, senão voltam na exportação seguinte.\n`);
    t(`| Fica | Stock | Sai | Stock | Título |`);
    t(`|---|---:|---|---:|---|`);
    for (const x of repetidosNoTitulo) {
      t(`| ${x.fica.artigo.descricao} | ${x.fica.artigo.stock} | ${x.sai.artigo.descricao} | ${x.sai.artigo.stock} | ${x.fica.title} |`);
    }
  }
  const duvidosos = novos.filter((n) => stockPorConfirmar(n.artigo));
  if (duvidosos.length > 0) {
    t(`\n## Stock por confirmar\n`);
    t(`Números altos demais para serem uma contagem. Entram como vêm, ocultos — confirme na`);
    t(`loja antes de publicar.\n`);
    t(`| Produto | Stock no KiGest | Preço |`);
    t(`|---|---:|---:|`);
    for (const n of duvidosos.sort((a, b) => b.artigo.stock - a.artigo.stock)) {
      t(`| ${n.title} | ${kz(n.artigo.stock)} | ${kz(n.artigo.preco)} |`);
    }
  }
  t(`\n## Os ${novos.length} que entram ocultos\n`);
  t(`Falta-lhes a capa e a descrição; o editor e o autor estão por preencher. Por ordem de`);
  t(`existência — os primeiros são os que a loja mais roda e os que mais vale a pena publicar.`);
  t(`A última coluna avisa quando o nome se parece com um produto que já existe: na maior parte`);
  t(`dos casos é só uma palavra em comum («bíblia», «lenço»), mas convém olhar antes de publicar`);
  t(`para não ficar com o mesmo produto duas vezes na loja.\n`);
  t(`| Produto | Tipo | Prateleira | Preço | Stock | Ref. | Parece-se com |`);
  t(`|---|---|---|---:|---:|---|---|`);
  for (const n of [...novos].sort((a, b) => b.artigo.stock - a.artigo.stock)) {
    t(`| ${n.title} | ${n.tipo} | ${n.genero} | ${kz(n.artigo.preco)} | ${n.artigo.stock} | ${n.artigo.ref}`
      + ` | ${(n.artigo.parecidos ?? []).slice(0, 4).join(', ')} |`);
  }
  if (resultado.soNoSite.length > 0) {
    t(`\n## Produtos do site que o KiGest não tem\n`);
    t(`Ou são só da loja online, ou estão no KiGest com um nome que não se reconheceu. O stock`);
    t(`destes não foi tocado.\n`);
    t(`| Código | Produto | Preço | Stock |`);
    t(`|---|---|---:|---:|`);
    for (const p of resultado.soNoSite) t(`| ${p.book_code} | ${p.title} | ${kz(p.price)} | ${p.stock} |`);
  }
  return `${linhas.join('\n')}\n`;
}

const estaAserCorrido = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (estaAserCorrido) {
  const args = process.argv.slice(2);
  const ficheiro = args.find((a) => !a.startsWith('--'));
  const opcao = (nome) => (args.indexOf(nome) >= 0 ? args[args.indexOf(nome) + 1] : null);
  if (!ficheiro) {
    console.error('uso: migracao.mjs <ficheiro.kigest> [--sql <saída>] [--relatorio <saída>]');
    process.exit(2);
  }
  const exportacao = lerExportacao(ficheiro);
  const aVista = await catalogoDoSite();
  // A chave pública não vê o que está oculto; esses vêm do repositório.
  const ocultos = catalogoOculto({ titulosAVista: aVista.map((p) => p.title) });
  const produtosSite = [...aVista, ...ocultos];
  console.error(`catálogo: ${aVista.length} à venda + ${ocultos.length} ocultos`);
  // As decisões tomadas à mão sobre o que o automático deixou em dúvida, com a prova de cada
  // uma em docs/catalogo/kigest-decisoes.json. Entram antes de conciliar: uma ligação passa a
  // ser uma chave como qualquer outra, e um repetido sai da lista.
  const decisoes = lerDecisoes();
  const comDecisoes = aplicarDecisoes({ decisoes, produtosSite, artigosKigest: artigos(exportacao) });
  if (comDecisoes.problemas.length > 0) {
    console.error(`decisões: ${comDecisoes.problemas.length} não se puderam aplicar — a migração não é escrita`);
    process.exit(1);
  }
  console.error(`decisões à mão: ${comDecisoes.ligacoes.length} ligações, ${comDecisoes.retirados.length} repetidos retirados`);
  const feito = gerar({ exportacao, artigosKigest: comDecisoes.artigos, produtosSite, decisoes });
  const alvoSql = opcao('--sql');
  const alvoRel = opcao('--relatorio');
  const alvoMapa = opcao('--mapa');
  if (alvoSql) writeFileSync(alvoSql, feito.sql);
  if (alvoRel) writeFileSync(alvoRel, relatorio({ exportacao, ...feito }));
  if (alvoMapa) writeFileSync(alvoMapa, `${JSON.stringify(mapa({ exportacao, ...feito }), null, 1)}\n`);
  console.error(`ligados ${feito.pares.length} · ocultos ${feito.novos.length} · ambíguos ${feito.resultado.ambiguos.length}`
    + ` · repetidos ${feito.gruposRepetidos.reduce((s, g) => s + g.length - 1, 0)}`);
  if (!alvoSql) process.stdout.write(feito.sql);
}
