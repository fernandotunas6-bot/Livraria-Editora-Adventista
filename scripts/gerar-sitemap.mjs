#!/usr/bin/env node
// Acrescenta ao sitemap do build as páginas de cada livro e de cada colecção.
//
//   node scripts/gerar-sitemap.mjs <ficheiro sitemap.xml do build> <URL do site>
//
// O `public/sitemap.xml` só tem as páginas fixas; as de livro e de colecção são geradas pelo
// JavaScript, e o motor de busca só as encontrava se seguisse ligações dentro da loja. Corre
// no `deploy-site.sh`, depois do build, com a chave pública do `app/web/.env` — lê apenas o
// que qualquer visitante lê (livros e colecções activos).
//
// Se a base de dados não responder, o sitemap fica só com as páginas fixas e o deploy segue:
// um sitemap incompleto não justifica deixar de publicar uma correcção.
import { readFileSync, writeFileSync } from 'node:fs';

const [file, siteUrl] = process.argv.slice(2);
if (!file || !siteUrl) {
  console.error('uso: gerar-sitemap.mjs <sitemap.xml> <URL do site>');
  process.exit(2);
}

function readEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...readEnv('app/web/.env'), ...process.env };
const api = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const site = siteUrl.replace(/\/$/, '');

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const day = (iso) => (iso ? String(iso).slice(0, 10) : '');

async function rows(path) {
  const res = await fetch(`${api}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

const entry = (loc, lastmod, changefreq, priority) =>
  `  <url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

const xml = readFileSync(file, 'utf8');
if (!xml.includes('</urlset>')) {
  console.error(`✘ ${file} não parece um sitemap (sem </urlset>).`);
  process.exit(1);
}

try {
  if (!api || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY em falta');
  const [books, collections] = await Promise.all([
    rows('stock_books?select=id,updated&active=eq.true&order=id'),
    rows('book_collections?select=slug,id,updated&active=eq.true&order=sort_order'),
  ]);
  const lines = [
    ...collections.map((c) => entry(`${site}/colecoes/${encodeURIComponent(c.slug || c.id)}`, day(c.updated), 'weekly', '0.7')),
    ...books.map((b) => entry(`${site}/product/${encodeURIComponent(b.id)}`, day(b.updated), 'weekly', '0.6')),
  ];
  writeFileSync(file, xml.replace('</urlset>', `${lines.join('\n')}\n</urlset>`));
  console.log(`→ sitemap: ${books.length} livros e ${collections.length} colecções acrescentados`);
} catch (err) {
  console.warn(`⚠ sitemap só com as páginas fixas (${err.message})`);
}
