/**
 * Saúde do site no painel (Sistema → Saúde do site): as Core Web Vitals medidas em quem visita e
 * os erros de JavaScript, lidos de public.site_health_vitals e public.site_health_errors
 * (migração saude_do_site). Aqui só o que é puro: os limiares, os números e a tabela.
 */

/**
 * As métricas pela ordem do painel, com os limiares da Google para o p75 (web.dev/vitals):
 * até `good` está bem, acima de `poor` está mal, entre os dois precisa de melhorar.
 */
export const METRICS = [
  { name: 'LCP', label: 'Maior elemento (LCP)', unit: 'ms', good: 2500, poor: 4000, hint: 'Quanto demora a aparecer o maior elemento da página (a imagem do topo, a capa).' },
  { name: 'INP', label: 'Resposta ao toque (INP)', unit: 'ms', good: 200, poor: 500, hint: 'Quanto demora a página a reagir a um toque ou clique.' },
  { name: 'CLS', label: 'Saltos (CLS)', unit: '', good: 0.1, poor: 0.25, hint: 'Quanto a página salta enquanto carrega (0 é nada).' },
  { name: 'FCP', label: 'Primeiro desenho (FCP)', unit: 'ms', good: 1800, poor: 3000, hint: 'Quando aparece a primeira coisa no ecrã.' },
  { name: 'TTFB', label: 'Resposta do servidor (TTFB)', unit: 'ms', good: 800, poor: 1800, hint: 'Quanto demora a chegar o primeiro byte da página.' },
];

const BY_NAME = Object.fromEntries(METRICS.map((m) => [m.name, m]));

/** 'good', 'needs' ou 'poor' para o p75 de uma métrica; '' se não houver valor. */
export function rating(name, value) {
  const m = BY_NAME[name];
  if (!m || !Number.isFinite(value)) return '';
  if (value <= m.good) return 'good';
  if (value <= m.poor) return 'needs';
  return 'poor';
}

/** "2,4 s", "180 ms", "0,05". */
export function formatMetric(name, value) {
  if (!Number.isFinite(value)) return '—';
  if (name === 'CLS') return value.toLocaleString('pt-AO', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (value >= 1000) return `${(value / 1000).toLocaleString('pt-AO', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
  return `${Math.round(value)} ms`;
}

/** Nome legível de uma página agrupada: '/' → 'Página inicial', '/product/:id' → 'Ficha de produto'. */
const PAGE_NAMES = {
  '*': 'Todas as páginas',
  '/': 'Página inicial',
  '/shop': 'Loja',
  '/product/:id': 'Ficha de produto',
  '/colecoes': 'Colecções',
  '/track': 'Rastrear encomenda',
  '/success': 'Compra concluída',
  '/profile': 'Conta',
  '/comunidade': 'Comunidade',
  '/faq': 'Perguntas frequentes',
  '/contact': 'Contactos',
  '/lojas': 'Lojas',
  '/about': 'Sobre',
  '/admin': 'Painel',
};
export const pageName = (page) => PAGE_NAMES[page] || page;

/**
 * As linhas de site_health_vitals de um aparelho numa tabela: uma linha por página, uma coluna por
 * métrica, e as visitas (o maior número de medições da página — o LCP e o FCP saem uma vez por
 * visita). A linha '*' (todas as páginas) vem primeiro; as outras pelas visitas.
 */
export function vitalsTable(rows, device) {
  const pages = new Map();
  for (const r of rows || []) {
    if (r.device !== device) continue;
    if (!pages.has(r.page)) pages.set(r.page, { page: r.page, visits: 0, metrics: {} });
    const row = pages.get(r.page);
    row.metrics[r.name] = { p75: Number(r.p75), median: Number(r.median), samples: Number(r.samples) };
    row.visits = Math.max(row.visits, Number(r.samples) || 0);
  }
  return [...pages.values()].sort((a, b) => (a.page === '*' ? -1 : b.page === '*' ? 1 : b.visits - a.visits));
}

/** "ficheiro:linha:coluna" de um erro, se o houver. */
export function errorWhere(sample) {
  if (!sample?.source) return '';
  const file = String(sample.source).replace(/^https?:\/\/[^/]+/, '');
  return [file, sample.line, sample.col].filter((x) => x !== undefined && x !== null && x !== '').join(':');
}
