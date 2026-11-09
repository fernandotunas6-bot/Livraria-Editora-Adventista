#!/usr/bin/env node
// Auditoria visual da loja publicada (docs/audits/livraria-premium-360.md, Fase 2.2): capturas
// em cinco larguras, medições de carregamento, erros da consola e acessibilidade (axe-core).
//
//   PLAYWRIGHT_MODULE=<…/playwright/index.mjs> AXE_PATH=<…/axe-core/axe.min.js> \
//     node scripts/auditoria-visual/capturar.mjs <URL do site> <pasta de saída>
//
// Corre no GitHub Actions (.github/workflows/auditoria-visual.yml), que instala o Playwright e
// o axe numa pasta à parte, sem mexer no package-lock.
//
// Só lê. Todos os pedidos que não sejam GET (contagem de vistas, inscrições, o beacon do
// Cloudflare) são cancelados antes de sair do navegador: nada fica escrito em produção.
//
// As medições do telemóvel são feitas com a rede e o processador travados como no Lighthouse
// em telemóvel (150 ms de latência, 1,6 Mbit/s, processador 4× mais lento). São medições de
// laboratório, a partir de um servidor do GitHub: servem para comparar versões, não substituem
// medições reais de quem compra a partir de Angola.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [siteArg, outArg] = process.argv.slice(2);
if (!siteArg || !/^https?:\/\/[^/]+/.test(siteArg) || !outArg) {
  console.error('uso: capturar.mjs <URL do site> <pasta de saída>');
  process.exit(2);
}
const SITE = siteArg.replace(/\/$/, '');
const OUT = path.resolve(outArg);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const AXE_PATH = process.env.AXE_PATH || '';

const PAGES = [
  ['inicio', '/'],
  ['loja', '/shop'],
  ['livro', null], // a primeira ficha do sitemap
  ['colecoes', '/colecoes'],
  ['lojas', '/lojas'],
  ['sobre', '/about'],
  ['contacto', '/contact'],
  ['faq', '/faq'],
  ['envios', '/shipping-returns'],
  ['rastreio', '/track'],
  ['entrar', '/login'],
  ['comunidade', '/comunidade'],
  ['pagina-inexistente', '/pagina-que-nao-existe'],
];

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const VIEWPORTS = [
  { nome: 'telemovel-320', width: 320, height: 640, mobile: true },
  // A medição de telemóvel: rede e processador travados, axe, página inteira.
  { nome: 'telemovel-390', width: 390, height: 844, mobile: true, medir: true },
  { nome: 'tablet-768', width: 768, height: 1024, mobile: true },
  // A medição de computador: sem travões, axe, página inteira.
  { nome: 'computador-1280', width: 1280, height: 800, mobile: false, medir: true },
  { nome: 'computador-1440', width: 1440, height: 900, mobile: false },
];

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Observadores postos antes de a página correr. O LCP, os deslocamentos e as tarefas longas só
 * se lêem assim: não aparecem em `performance.getEntriesByType()`.
 */
const INIT = () => {
  const a = { longTasks: 0, longTaskMs: 0, lcp: null, shifts: [] };
  window.__auditoria = a;
  const observe = (type, fn) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
    } catch { /* tipo não suportado neste navegador */ }
  };
  observe('longtask', (e) => { a.longTasks += 1; a.longTaskMs += e.duration; });
  observe('largest-contentful-paint', (e) => { a.lcp = e; });
  observe('layout-shift', (e) => { if (!e.hadRecentInput) a.shifts.push({ t: e.startTime, v: e.value }); });
};

/** Tudo o que se lê da página depois de carregada. */
const COLLECT = () => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const lcp = window.__auditoria?.lcp || null;
  // CLS como o define o Chrome: a maior "janela" de deslocamentos sem interacção (1 s entre
  // deslocamentos, 5 s no máximo).
  let cls = 0; let windowValue = 0; let windowStart = 0; let last = 0;
  for (const s of window.__auditoria?.shifts || []) {
    if (windowValue && (s.t - last > 1000 || s.t - windowStart > 5000)) windowValue = 0;
    if (!windowValue) windowStart = s.t;
    windowValue += s.v;
    last = s.t;
    cls = Math.max(cls, windowValue);
  }
  const kb = { script: 0, css: 0, img: 0, font: 0, fetch: 0, outro: 0 };
  const resources = performance.getEntriesByType('resource');
  for (const r of resources) {
    const kind = r.initiatorType === 'script' ? 'script'
      : r.initiatorType === 'link' && /\.css(\?|$)/.test(r.name) ? 'css'
      : r.initiatorType === 'img' || r.initiatorType === 'image' ? 'img'
      : /\.(woff2?|ttf|otf)(\?|$)/.test(r.name) ? 'font'
      : r.initiatorType === 'fetch' || r.initiatorType === 'xmlhttprequest' ? 'fetch' : 'outro';
    kb[kind] += (r.transferSize || 0) / 1024;
  }
  const describe = (el) => {
    if (!el) return '';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 80);
  };
  const doc = document.documentElement;
  const canonical = document.querySelector('link[rel="canonical"]');
  return {
    titulo: document.title,
    lang: doc.getAttribute('lang') || '',
    canonical: canonical ? canonical.getAttribute('href') : '',
    canonicais: document.querySelectorAll('link[rel="canonical"]').length,
    descricao: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
    h1: document.querySelectorAll('h1').length,
    imagensSemAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
    deslocamentoHorizontal: Math.max(0, doc.scrollWidth - doc.clientWidth),
    alturaPagina: doc.scrollHeight,
    ttfb: nav ? Math.round(nav.responseStart) : null,
    fcp: fcp ? Math.round(fcp.startTime) : null,
    lcp: lcp ? Math.round(lcp.startTime) : null,
    lcpElemento: lcp ? describe(lcp.element) : '',
    lcpUrl: lcp?.url ? lcp.url.slice(0, 160) : '',
    cls: Math.round(cls * 1000) / 1000,
    tarefasLongas: window.__auditoria?.longTasks ?? null,
    tarefasLongasMs: Math.round(window.__auditoria?.longTaskMs ?? 0),
    pedidos: resources.length + 1,
    kb: Object.fromEntries(Object.entries(kb).map(([k, v]) => [k, Math.round(v)])),
  };
};

async function firstProductPath() {
  try {
    const res = await fetch(`${SITE}/sitemap.xml`);
    const xml = await res.text();
    const m = xml.match(/<loc>[^<]*?(\/product\/[A-Za-z0-9]+)<\/loc>/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function auditPage(browser, vp, nome, pagePath) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    userAgent: vp.mobile ? ANDROID : undefined,
    locale: 'pt-AO',
    timezoneId: 'Africa/Luanda',
    // Para o axe poder entrar: o CSP da loja (com razão) não deixa correr scripts embutidos.
    bypassCSP: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(INIT);

  const cancelled = new Set();
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || req.url().includes('/cdn-cgi/rum')) {
      cancelled.add(req.url());
      return route.abort();
    }
    return route.continue();
  });
  const consola = [];
  const falhas = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consola.push(msg.text().slice(0, 300)); });
  page.on('pageerror', (err) => consola.push(`pageerror: ${String(err.message || err).slice(0, 300)}`));
  page.on('requestfailed', (req) => {
    if (!cancelled.has(req.url())) falhas.push(`${req.failure()?.errorText || 'falhou'} ${req.url().slice(0, 160)}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().startsWith(`${SITE}/pagina-que-nao-existe`)) falhas.push(`${res.status()} ${res.url().slice(0, 160)}`);
  });

  if (vp.medir && vp.mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  const result = { pagina: nome, caminho: pagePath, largura: vp.nome };
  try {
    const res = await page.goto(`${SITE}${pagePath}`, { waitUntil: 'load', timeout: 90000 });
    result.estado = res ? res.status() : null;
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    Object.assign(result, await page.evaluate(COLLECT));

    const dir = path.join(OUT, 'capturas', nome);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${vp.nome}.jpg`), type: 'jpeg', quality: 80 });

    if (vp.medir) {
      // O primeiro Tab: o que recebe o foco, e se se vê.
      await page.keyboard.press('Tab');
      result.primeiroTab = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return 'nada';
        const r = el.getBoundingClientRect();
        const visivel = r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight;
        return `${el.tagName.toLowerCase()} «${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}»${visivel ? '' : ' (invisível)'}`;
      });
      await page.keyboard.press('Shift+Tab');

      if (AXE_PATH) {
        await page.addScriptTag({ path: AXE_PATH });
        const axe = await page.evaluate(async (tags) => {
          const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
          return r.violations.map((v) => ({ id: v.id, impacto: v.impact, nos: v.nodes.length, ajuda: v.help, exemplo: v.nodes[0]?.target?.join(' ') || '' }));
        }, AXE_TAGS);
        result.axe = axe;
      }
      // A página inteira, cortada aos 8000 px: a loja carrega mais livros ao descer e não acaba.
      const altura = Math.min(Math.max(result.alturaPagina || vp.height, vp.height), 8000);
      await page.screenshot({
        path: path.join(dir, `${vp.nome}-inteira.jpg`), fullPage: true, type: 'jpeg', quality: 60,
        clip: { x: 0, y: 0, width: vp.width, height: altura },
      });
    }
  } catch (err) {
    result.erro = String(err.message || err).split('\n')[0].slice(0, 300);
  }
  result.consola = consola.slice(0, 10);
  result.falhas = [...new Set(falhas)].slice(0, 10);
  await context.close();
  return result;
}

const fmt = (v, unit = '') => (v == null || Number.isNaN(v) ? '—' : `${v}${unit}`);
const sec = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const lcpFlag = (ms) => (ms == null ? '' : ms <= 2500 ? ' ✅' : ms <= 4000 ? ' ⚠️' : ' ❌');
const clsFlag = (v) => (v == null ? '' : v <= 0.1 ? ' ✅' : v <= 0.25 ? ' ⚠️' : ' ❌');

function summary(results, startedAt) {
  const by = (nome, vp) => results.find((r) => r.pagina === nome && r.largura === vp) || {};
  const lines = [
    `# Auditoria visual — ${SITE}`,
    '',
    `${startedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC · ${PAGES.length} páginas × ${VIEWPORTS.length} larguras · capturas em \`capturas/<página>/<largura>.jpg\` (e \`-inteira.jpg\` a 390 e 1280 px)`,
    '',
    'Telemóvel: 390 px, rede e processador travados (latência 150 ms, 1,6 Mbit/s, CPU 4×). Computador: 1280 px, sem travões. Objectivos: LCP ≤ 2,5 s · CLS ≤ 0,1. Medições de laboratório, a partir do GitHub.',
    '',
    '| Página | LCP telemóvel | CLS telemóvel | LCP computador | CLS computador | TTFB | JS (KB) | Pedidos | axe (telemóvel/computador) | 1.º Tab |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [nome] of PAGES) {
    const m = by(nome, 'telemovel-390');
    const d = by(nome, 'computador-1280');
    if (!m.pagina && !d.pagina) continue;
    const axeCount = (r) => (r.axe ? r.axe.reduce((n, v) => n + v.nos, 0) : '—');
    lines.push(`| ${nome} | ${sec(m.lcp)}${lcpFlag(m.lcp)} | ${fmt(m.cls)}${clsFlag(m.cls)} | ${sec(d.lcp)}${lcpFlag(d.lcp)} | ${fmt(d.cls)}${clsFlag(d.cls)} | ${fmt(d.ttfb, ' ms')} | ${fmt(m.kb?.script)} | ${fmt(m.pedidos)} | ${axeCount(m)} / ${axeCount(d)} | ${(d.primeiroTab || '—').replace(/\|/g, '/')} |`);
  }

  const problems = [];
  for (const r of results) {
    const where = `${r.pagina} @ ${r.largura}`;
    if (r.erro) problems.push(`- **${where}**: não carregou — ${r.erro}`);
    if (r.deslocamentoHorizontal > 0) problems.push(`- **${where}**: deslocamento horizontal de ${r.deslocamentoHorizontal} px`);
    if (r.h1 !== undefined && r.h1 !== 1) problems.push(`- **${where}**: ${r.h1} títulos h1`);
    if (r.imagensSemAlt > 0) problems.push(`- **${where}**: ${r.imagensSemAlt} imagens sem alt`);
    if (r.canonicais > 1) problems.push(`- **${where}**: ${r.canonicais} links canonical`);
    for (const c of r.consola || []) problems.push(`- **${where}** consola: \`${c.replace(/`/g, "'")}\``);
    for (const f of r.falhas || []) problems.push(`- **${where}** pedido: \`${f}\``);
  }
  const axeAll = new Map();
  for (const r of results) for (const v of r.axe || []) {
    const key = v.id;
    const cur = axeAll.get(key) || { ...v, paginas: new Set(), nos: 0 };
    cur.paginas.add(`${r.pagina}@${r.largura.replace(/^.*-/, '')}`);
    cur.nos += v.nos;
    axeAll.set(key, cur);
  }
  lines.push('', '## Acessibilidade (axe-core, WCAG 2.2 A/AA)', '');
  if (!axeAll.size) lines.push(AXE_PATH ? 'Sem violações nas páginas medidas.' : 'axe-core não instalado nesta execução.');
  for (const v of [...axeAll.values()].sort((a, b) => b.nos - a.nos)) {
    lines.push(`- **${v.id}** (${v.impacto}): ${v.ajuda} — ${v.nos} elementos em ${[...v.paginas].join(', ')}. Ex.: \`${v.exemplo}\``);
  }
  lines.push('', '## Títulos, canonical e dados estruturados (computador)', '', '| Página | Estado | Título | Canonical | JSON-LD |', '|---|---|---|---|---|');
  for (const [nome] of PAGES) {
    const d = by(nome, 'computador-1280');
    if (!d.pagina) continue;
    lines.push(`| ${nome} | ${fmt(d.estado)} | ${(d.titulo || '').replace(/\|/g, '/')} | ${(d.canonical || '—').replace(SITE, '')} | ${fmt(d.jsonLd)} |`);
  }
  lines.push('', '## Problemas encontrados', '', ...(problems.length ? [...new Set(problems)] : ['Nenhum.']));
  return `${lines.join('\n')}\n`;
}

const startedAt = new Date();
mkdirSync(OUT, { recursive: true });
const productPath = await firstProductPath();
// PAGINAS=inicio,loja limita a execução a essas páginas (para repetir só uma, depois de uma correcção).
const only = String(process.env.PAGINAS || '').split(',').map((s) => s.trim()).filter(Boolean);
const pages = PAGES.map(([nome, p]) => [nome, p ?? productPath])
  .filter(([nome, p]) => p && (!only.length || only.includes(nome)));
const browser = await chromium.launch();
const results = [];
for (const [nome, pagePath] of pages) {
  for (const vp of VIEWPORTS) {
    const r = await auditPage(browser, vp, nome, pagePath);
    results.push(r);
    console.log(`${nome.padEnd(20)} ${vp.nome.padEnd(16)} ${r.erro ? `ERRO ${r.erro}` : `LCP ${sec(r.lcp)} CLS ${fmt(r.cls)} axe ${r.axe ? r.axe.length : '-'}`}`);
  }
}
await browser.close();
writeFileSync(path.join(OUT, 'metricas.json'), `${JSON.stringify({ site: SITE, data: startedAt.toISOString(), resultados: results }, null, 2)}\n`);
writeFileSync(path.join(OUT, 'RESUMO.md'), summary(results, startedAt));
console.log(`→ ${path.join(OUT, 'RESUMO.md')}`);
