// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// @vitest-environment node
/**
 * O service worker (public/sw.js) corre num ambiente próprio; aqui carrega-se num `self`
 * simulado para ver que pedidos apanha. A regressão que isto guarda: o SW refazia com
 * fetch() os pedidos para outros domínios, o CSP (`connect-src`) recusava-os, e as fontes
 * deixavam de carregar a partir da segunda página.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SITE = 'https://livrariaadventista.com';
const STORAGE = 'https://bggqkjjqbjhbjsckzopj.supabase.co';
let onFetch;

beforeAll(() => {
  const code = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8');
  const listeners = {};
  const self = {
    location: new URL(SITE),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: {},
    clients: {},
    skipWaiting: () => {},
  };
  const cache = { match: async () => undefined, put: async () => {} };
  const caches = { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true };
  vm.runInNewContext(code, { self, URL, caches, fetch: async () => new Response('ok'), Response, console });
  onFetch = listeners.fetch;
});

/** Devolve true se o SW tomou conta do pedido (chamou respondWith). */
function intercepts(url, { destination = '', mode = 'no-cors', accept = '' } = {}) {
  let took = false;
  onFetch({
    request: { url, method: 'GET', destination, mode, headers: new Headers(accept ? { accept } : {}) },
    respondWith: () => { took = true; },
  });
  return took;
}

describe('service worker: que pedidos apanha', () => {
  it('deixa os tipos de letra da Google para o browser', () => {
    expect(intercepts('https://fonts.gstatic.com/s/inter/v20/abc.woff2', { destination: 'font' })).toBe(false);
    expect(intercepts('https://fonts.googleapis.com/css2?family=Inter', { destination: 'style' })).toBe(false);
  });

  it('deixa o Cloudflare Insights e as imagens de outros domínios para o browser', () => {
    expect(intercepts('https://static.cloudflareinsights.com/beacon.min.js/v1', { destination: 'script' })).toBe(false);
    expect(intercepts('https://images.unsplash.com/photo-1?w=800', { destination: 'image' })).toBe(false);
  });

  it('continua a guardar as capas do Storage do Supabase', () => {
    expect(intercepts(`${STORAGE}/storage/v1/object/public/books/capa.webp`, { destination: 'image' })).toBe(true);
  });

  it('nunca apanha a API do Supabase (login, dados, funções)', () => {
    expect(intercepts(`${STORAGE}/auth/v1/user`, { mode: 'cors' })).toBe(false);
    expect(intercepts(`${STORAGE}/rest/v1/stock_books`, { mode: 'cors' })).toBe(false);
    expect(intercepts(`${STORAGE}/functions/v1/app/settings`, { mode: 'cors' })).toBe(false);
  });

  it('continua a tratar as páginas e os ficheiros do próprio site', () => {
    expect(intercepts(`${SITE}/shop`, { destination: 'document', mode: 'navigate', accept: 'text/html' })).toBe(true);
    expect(intercepts(`${SITE}/assets/index-AbCd1234.js`, { destination: 'script', mode: 'cors' })).toBe(true);
    expect(intercepts(`${SITE}/images/site/opcoes/slide.webp`, { destination: 'image' })).toBe(true);
  });

  it('não apanha pedidos que não são GET', () => {
    let took = false;
    onFetch({ request: { url: `${SITE}/shop`, method: 'POST', headers: new Headers() }, respondWith: () => { took = true; } });
    expect(took).toBe(false);
  });
});
