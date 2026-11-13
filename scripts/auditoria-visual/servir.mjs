#!/usr/bin/env node
// Serve a pasta do build como o Cloudflare Pages a serve, para a auditoria visual de um PR
// (.github/workflows/auditoria-visual.yml):
//   1. o ficheiro pedido, se existir;
//   2. o mesmo caminho com .html — `/faq` → `faq.html`, `/product/x` → `product/x.html`;
//   3. `<caminho>/index.html`;
//   4. senão, o index.html com 200 (a regra `/* /index.html 200` do _redirects).
// O `serve -s` não serve: com `-s`, todo o caminho sem extensão vai para o index.html, e as
// páginas fixas e as fichas do pós-build de SEO nunca apareciam.
//
// Com gzip, como o Pages (para os KB medidos serem comparáveis). Sem os cabeçalhos do
// _headers: o CSP e o resto não mudam o que se mede.
//
//   node scripts/auditoria-visual/servir.mjs <pasta do build> [porta]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const [dirArg, portArg = '8744'] = process.argv.slice(2);
if (!dirArg) {
  console.error('uso: servir.mjs <pasta do build> [porta]');
  process.exit(2);
}
const ROOT = path.resolve(dirArg);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json)|image\/svg)/;

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** O ficheiro que o Pages serviria para este caminho. `null` se o caminho for inválido. */
export async function resolvePath(root, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const base = path.join(root, path.normalize(`/${rel}`));
  if (base !== root && !base.startsWith(`${root}${path.sep}`)) return null;
  const trimmed = base.replace(/[\\/]+$/, '');
  for (const candidate of [base, `${trimmed}.html`, path.join(trimmed, 'index.html')]) {
    if (candidate.startsWith(root) && (await isFile(candidate))) return candidate;
  }
  return path.join(root, 'index.html');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  createServer(async (req, res) => {
    try {
      const file = await resolvePath(ROOT, req.url);
      if (!file) {
        res.writeHead(400).end();
        return;
      }
      const body = await readFile(file);
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers = { 'content-type': type, 'cache-control': 'no-store' };
      let out = body;
      if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        out = gzipSync(body);
        headers['content-encoding'] = 'gzip';
        headers.vary = 'accept-encoding';
      }
      headers['content-length'] = out.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : out);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err?.message || err));
    }
  }).listen(Number(portArg), '127.0.0.1', () => {
    console.log(`a servir ${ROOT} em http://127.0.0.1:${portArg}`);
  });
}
