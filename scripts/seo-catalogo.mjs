#!/usr/bin/env node
// Pós-build de SEO e partilha. Corre depois do `npm run build`, igual nos dois caminhos de
// publicação — o scripts/deploy-site.sh e o .github/workflows/deploy-cloudflare.yml:
//
//   node scripts/seo-catalogo.mjs <pasta do build> <URL do site>
//
// 1. Troca o endereço de origem pelo de destino no index.html, sitemap.xml e robots.txt
//    (canonical, og:, twitter:): o mesmo commit pode ir para o projecto novo ou para o .ao.
//    Escreve também as páginas fixas do sitemap (shop.html, faq.html…), cada uma com o seu
//    canonical, título e descrição (FIXED_PAGES em seo-paginas.mjs).
//    E põe no manifesto e no título da app no iPhone o nome e a cor do painel (PWA, ver
//    pwa-manifesto.mjs) — sem resposta das definições, ficam os do repositório.
// 2. Junta ao sitemap os livros e as colecções activos.
// 3. Escreve product/<id>.html e colecoes/<slug>.html: o index.html com o título, a
//    descrição e a capa de cada um. Quem partilha um livro no WhatsApp, Facebook ou Telegram
//    vê a capa e o título, e não a imagem genérica da loja — os robôs dessas aplicações não
//    correm o JavaScript que põe as etiquetas certas.
//    São ficheiros estáticos: o Pages serve /product/<id> a partir de product/<id>.html, com
//    os cabeçalhos do _headers (CSP incluída) e sem custo por visita. Uma Pages Function faria
//    o mesmo em cada pedido, e as respostas das Functions não levam os cabeçalhos do _headers.
//    O preço fica de fora de propósito: mudaria sem a página ser publicada de novo.
//
// Lê só o que qualquer visitante lê (livros e colecções activos), com a chave pública do
// app/web/.env ou das variáveis de ambiente. Se a base de dados não responder, o passo 1
// faz-se na mesma e o deploy segue só sem os passos 2 e 3.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTES, headersFor } from './partilha-comunidade.mjs';
import path from 'node:path';
import {
  FIXED_PAGES, bookShareDescription, fixedPageFile, isSafeId, isSafeSlug, plainSummary, renderSharePage, rewriteSiteUrl,
  sitemapEntry, SITE_NAME,
} from './seo-paginas.mjs';
import { manifestoDaApp, tituloDaAppNoIphone } from './pwa-manifesto.mjs';

const [dir, siteArg] = process.argv.slice(2);
if (!dir || !siteArg || !/^https:\/\/[^/]+/.test(siteArg)) {
  console.error('uso: seo-catalogo.mjs <pasta do build> <URL https do site>');
  process.exit(2);
}
const site = siteArg.replace(/\/$/, '');
const at = (name) => path.join(dir, name);
const read = (name) => readFileSync(at(name), 'utf8');
const write = (name, text) => {
  mkdirSync(path.dirname(at(name)), { recursive: true });
  writeFileSync(at(name), text);
};

// 1. Endereços. Um erro aqui pára o deploy: o build mudou e este passo tem de ser revisto.
try {
  for (const name of ['index.html', 'sitemap.xml', 'robots.txt']) write(name, rewriteSiteUrl(read(name), site, name));
} catch (err) {
  console.error(`✘ ${err.message}`);
  process.exit(1);
}
console.log(`→ endereços públicos: ${site}`);

function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = { ...readEnv('app/web/.env'), ...process.env };
const api = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '');

async function rows(query) {
  const res = await fetch(`${api}/rest/v1/${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${query.split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Repete à espera de uma rede que falha por instantes. O `fetch failed` que se vê aqui é
 * quase sempre isso — um segundo depois já responde —, e sem repetição bastava esse segundo
 * para o site ir para o ar sem as páginas de partilha.
 */
async function insistir(fn, vezes = 3, oQue = 'catálogo') {
  let ultimo;
  for (let i = 1; i <= vezes; i += 1) {
    try { return await fn(); } catch (err) {
      ultimo = err;
      if (i < vezes) {
        console.warn(`⚠ ${oQue} inalcançável (${err.message}) — tentativa ${i} de ${vezes}`);
        await new Promise((r) => setTimeout(r, 1500 * i));
      }
    }
  }
  throw ultimo;
}

// 1a. A app instalada (PWA): o nome, o nome curto e a cor que estão no painel vão para o
// manifesto e para o título da app no iPhone (ver pwa-manifesto.mjs). Antes do 1b e do 3,
// porque as outras páginas são cópias do index.html. As definições lêem-se no mesmo endereço
// público que o site usa. Sem resposta, ficam o manifesto e o título do repositório — a app
// continua instalável, só com o nome de omissão —, por isso aqui não se pára o deploy.
try {
  if (!api) throw new Error('VITE_SUPABASE_URL em falta');
  const definicoes = await insistir(async () => {
    const res = await fetch(`${api}/functions/v1/app/settings`);
    if (!res.ok) throw new Error(`settings: HTTP ${res.status}`);
    return res.json();
  }, 3, 'definições');
  write('manifest.webmanifest', manifestoDaApp(read('manifest.webmanifest'), definicoes));
  write('index.html', tituloDaAppNoIphone(read('index.html'), definicoes));
  const m = JSON.parse(read('manifest.webmanifest'));
  console.log(`→ app instalada: «${m.short_name}» (${m.name}), cor ${m.theme_color}`);
} catch (err) {
  console.warn(`⚠ app instalada com o nome do repositório (${err.message})`);
}

// 1b. As páginas fixas do sitemap com o seu próprio HTML (ver FIXED_PAGES): sem isto, todas
// eram o index.html, com o canonical a apontar para a página inicial. Não dependem da base de
// dados, por isso saem mesmo quando o catálogo não responde (SEO_SEM_CATALOGO=1).
try {
  const base = read('index.html');
  const fixed = FIXED_PAGES.map((p) => [fixedPageFile(p.path), renderSharePage(base, {
    title: p.title,
    description: p.description,
    url: `${site}${p.path}`,
  })]);
  for (const [name, html] of fixed) write(name, html);
  console.log(`→ páginas fixas: ${fixed.length}, cada uma com o seu canonical`);
} catch (err) {
  console.error(`✘ páginas fixas não geradas (${err.message})`);
  process.exit(1);
}

/** URL absoluto de uma imagem: as do próprio site vêm como caminho (/images/…). */
const absolute = (url) => (/^https?:\/\//i.test(url || '') ? url : url?.startsWith('/') && !url.startsWith('//') ? `${site}${url}` : '');

let books;
let collections;
try {
  if (!api || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY em falta');
  [books, collections] = await insistir(() => Promise.all([
    rows('stock_books?select=id,title,author,description,cover,cover_image,updated&active=eq.true&order=id'),
    rows('book_collections?select=id,slug,title,description,cover,updated&active=eq.true&order=sort_order'),
  ]));
} catch (err) {
  // Sem catálogo o site sai sem as páginas de partilha e com o sitemap reduzido às páginas
  // fixas. Isso é uma regressão a sério — é a página de partilha que o WhatsApp lê —, por
  // isso falha-se aqui em vez de se publicar um site meio feito: o `deploy-site.sh` e o
  // workflow param no `|| fail`. Quem quiser mesmo construir sem base de dados pede-o por
  // escrito, com SEO_SEM_CATALOGO=1, e aí assume o que leva.
  const degradar = String(env.SEO_SEM_CATALOGO || '') === '1';
  console[degradar ? 'warn' : 'error'](
    `${degradar ? '⚠' : '✘'} sem catálogo (${err.message}): sitemap só com as páginas fixas e sem páginas de partilha`
    + (degradar ? '' : '\n  Para construir mesmo assim, de propósito: SEO_SEM_CATALOGO=1')
  );
  process.exit(degradar ? 0 : 1);
}

const coverOf = (b) => b.cover
  || (b.cover_image ? `${api}/storage/v1/object/public/media/stock_books/${b.id}/${encodeURIComponent(b.cover_image)}` : '');
const bookList = books.filter((b) => isSafeId(b.id) && b.title);
const collectionList = collections.filter((c) => isSafeSlug(c.slug || c.id) && c.title);

// 2. Sitemap.
const sitemap = read('sitemap.xml');
const lines = [
  ...collectionList.map((c) => sitemapEntry(`${site}/colecoes/${c.slug || c.id}`, c.updated, 'weekly', '0.7')),
  ...bookList.map((b) => sitemapEntry(`${site}/product/${b.id}`, b.updated, 'weekly', '0.6')),
];
write('sitemap.xml', sitemap.replace('</urlset>', `${lines.join('\n')}\n</urlset>`));

// 3. Páginas de partilha. Geradas todas em memória antes de escrever: se o index.html mudar e
// uma etiqueta deixar de bater, não fica metade das páginas escrita.
const indexHtml = read('index.html');
let pages;
try {
  pages = [
    ...bookList.map((b) => [`product/${b.id}.html`, renderSharePage(indexHtml, {
      title: b.title,
      description: bookShareDescription(b),
      image: absolute(coverOf(b)),
      imageAlt: `Capa de ${b.title}`,
      url: `${site}/product/${b.id}`,
      type: 'book',
    })]),
    ...collectionList.map((c) => [`colecoes/${c.slug || c.id}.html`, renderSharePage(indexHtml, {
      title: c.title,
      description: plainSummary(c.description) || `Colecção «${c.title}» na ${SITE_NAME}.`,
      image: absolute(c.cover),
      url: `${site}/colecoes/${c.slug || c.id}`,
    })]),
  ];
} catch (err) {
  // Aqui já não é a rede: é o próprio desenho das páginas a rebentar. Publicar sem elas, e
  // em silêncio, é como o defeito passa despercebido até alguém partilhar um livro.
  console.error(`✘ páginas de partilha não geradas (${err.message})`);
  process.exit(1);
}
for (const [name, html] of pages) write(name, html);

// 4. Partilha das publicações da comunidade: a Pages Function (functions/comunidade/p/[id].js)
// lê a configuração deste ficheiro gerado (fora do git) e só corre em /comunidade/p/*. As
// respostas das Functions não recebem o `_headers`, por isso os cabeçalhos de segurança vão
// com a configuração.
const security = headersFor(read('_headers'));
if (!security['Content-Security-Policy']) {
  console.error('✘ _headers sem Content-Security-Policy em /*: a Function sairia sem ela');
  process.exit(1);
}
const generated = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gerado');
mkdirSync(generated, { recursive: true });
writeFileSync(path.join(generated, 'pages-config.mjs'), `// Gerado por scripts/seo-catalogo.mjs. Não editar nem versionar.\nexport default ${JSON.stringify({ supabaseUrl: api, supabaseKey: key, headers: security }, null, 2)};\n`);
write('_routes.json', `${JSON.stringify(ROUTES, null, 2)}\n`);
console.log(`→ sitemap e partilha: ${bookList.length} livros e ${collectionList.length} colecções`);
