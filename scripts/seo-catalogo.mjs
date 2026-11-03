#!/usr/bin/env node
// Pós-build de SEO e partilha. Corre depois do `npm run build`, igual nos dois caminhos de
// publicação — o scripts/deploy-site.sh e o .github/workflows/deploy-cloudflare.yml:
//
//   node scripts/seo-catalogo.mjs <pasta do build> <URL do site>
//
// 1. Troca o endereço de origem pelo de destino no index.html, sitemap.xml e robots.txt
//    (canonical, og:, twitter:): o mesmo commit pode ir para o projecto novo ou para o .ao.
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
import path from 'node:path';
import {
  bookShareDescription, isSafeId, isSafeSlug, plainSummary, renderSharePage, rewriteSiteUrl, sitemapEntry, SITE_NAME,
} from './seo-paginas.mjs';

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

/** URL absoluto de uma imagem: as do próprio site vêm como caminho (/images/…). */
const absolute = (url) => (/^https?:\/\//i.test(url || '') ? url : url?.startsWith('/') && !url.startsWith('//') ? `${site}${url}` : '');

let books;
let collections;
try {
  if (!api || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY em falta');
  [books, collections] = await Promise.all([
    rows('stock_books?select=id,title,author,description,cover,cover_image,updated&active=eq.true&order=id'),
    rows('book_collections?select=id,slug,title,description,cover,updated&active=eq.true&order=sort_order'),
  ]);
} catch (err) {
  console.warn(`⚠ sem catálogo (${err.message}): sitemap só com as páginas fixas e sem páginas de partilha`);
  process.exit(0);
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
  console.warn(`⚠ páginas de partilha não geradas (${err.message})`);
  process.exit(0);
}
for (const [name, html] of pages) write(name, html);
console.log(`→ sitemap e partilha: ${bookList.length} livros e ${collectionList.length} colecções`);
