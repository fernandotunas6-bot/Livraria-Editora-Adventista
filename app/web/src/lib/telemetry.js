/**
 * Saúde do site medida em quem visita (A360-16): os erros de JavaScript e as Core Web Vitals
 * (LCP, INP, CLS, FCP, TTFB). Vão para a Edge Function (`POST /telemetria`) e aparecem no painel
 * em Sistema → Saúde do site.
 *
 * Antes, um erro no telemóvel de um cliente não chegava a ninguém, e a velocidade só se conhecia
 * no laboratório — que não diz como é a loja numa rede móvel em Angola.
 *
 * Nada que identifique quem visita: só o caminho da página (o servidor tira-lhe os ids), o tipo
 * de aparelho, o tipo de rede e a versão do site. Os erros são poucos por página (5) e sem repetir.
 */
import { APP_API_URL } from '@/lib/supabaseClient';
import { CURRENT_VERSION } from '@/lib/appVersion';

export const TELEMETRY_URL = `${APP_API_URL}/telemetria`;
export const MAX_ERRORS_PER_PAGE = 5;
const BATCH = 20;
const ERROR_FLUSH_MS = 3000;

// Erros que não são da loja: extensões do navegador, scripts de outros sites sem detalhe
// ("Script error."), avisos inofensivos do ResizeObserver e pedidos cancelados ao sair da página.
const IGNORED = /^(Script error\.?|ResizeObserver loop|Non-Error promise rejection captured)|(chrome|moz|safari(-web)?)-extension:|AbortError|The user aborted a request/i;
// As carteiras de criptomoedas (MetaMask e afins) injectam código em todas as páginas e rejeitam
// promessas quando não conseguem ligar-se. Uma promessa rejeitada não traz o ficheiro de origem,
// por isso o filtro acima não as apanhava pela fonte: em Novembro de 2026 eram 6 dos 38 erros na
// Saúde do site. Também se olha para a pilha, onde aparece o endereço da extensão.
const EXTENSION_NOISE = /MetaMask|ethereum|web3/i;

/** Telemóvel ou computador, pela largura (a mesma fronteira do site: 768 px). */
function deviceOf(win) {
  try {
    return win.matchMedia('(min-width: 768px)').matches ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
}

/**
 * Cria o recolhedor. `send(body, { beacon })` é quem envia (por omissão, `sendBeacon` ao sair da
 * página e `fetch` com `keepalive` no resto); os testes passam o seu.
 */
export function createTelemetry({ win = globalThis.window, send = defaultSend, version = CURRENT_VERSION } = {}) {
  const queue = [];
  const seenErrors = new Set();
  // A página onde a visita começou. As Core Web Vitals são dela (o LCP, o FCP e o TTFB medem o
  // carregamento, e o CLS e o INP acumulam-se na visita, como na Google): numa SPA, quando o LCP
  // final chega a pessoa pode já estar noutra página. Os erros ficam com a página onde aconteceram.
  const landing = (win?.location?.pathname || '/').slice(0, 200);
  let errorsThisPage = 0;
  let timer = null;

  const base = (page = win?.location?.pathname || '/') => ({
    page: page.slice(0, 200),
    device: deviceOf(win),
    connection: win?.navigator?.connection?.effectiveType || null,
    app_version: version,
  });

  function flush({ beacon = false } = {}) {
    clearTimeout(timer);
    timer = null;
    while (queue.length) send(JSON.stringify({ events: queue.splice(0, BATCH) }), { beacon });
  }

  function reportError(message, detail = {}) {
    const text = String(message || '').trim();
    if (!text || IGNORED.test(text) || IGNORED.test(String(detail.source || '')) || IGNORED.test(String(detail.stack || ''))) return false;
    if (EXTENSION_NOISE.test(text)) return false;
    if (errorsThisPage >= MAX_ERRORS_PER_PAGE || seenErrors.has(text)) return false;
    seenErrors.add(text);
    errorsThisPage += 1;
    queue.push({
      ...base(),
      kind: 'error',
      name: text.slice(0, 300),
      detail: {
        source: detail.source ? String(detail.source).slice(0, 200) : undefined,
        line: Number.isInteger(detail.line) ? detail.line : undefined,
        col: Number.isInteger(detail.col) ? detail.col : undefined,
        stack: detail.stack ? String(detail.stack).slice(0, 1500) : undefined,
      },
    });
    // Um erro vai pouco depois (vários de seguida juntam-se num pedido), sem esperar pela saída.
    if (!timer) timer = setTimeout(() => flush(), ERROR_FLUSH_MS);
    return true;
  }

  function reportVital(metric) {
    if (!metric || !Number.isFinite(metric.value)) return;
    queue.push({ ...base(landing), kind: 'vital', name: metric.name, value: metric.value });
  }

  /** Os erros que escapam: `error` (de scripts, não de imagens) e promessas rejeitadas. */
  function installErrorReporting() {
    if (!win?.addEventListener) return;
    win.addEventListener('error', (event) => {
      // Uma imagem ou um script que não carregou também dá `error`, mas sem mensagem: não é isto.
      if (event?.target && event.target !== win) return;
      reportError(event?.message, { source: event?.filename, line: event?.lineno, col: event?.colno, stack: event?.error?.stack });
    });
    win.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      reportError(reason?.message || (typeof reason === 'string' ? reason : ''), { stack: reason?.stack });
    });
  }

  /**
   * As Core Web Vitals. O `web-vitals` lê o que já aconteceu (observadores com `buffered`), por
   * isso pode carregar-se depois do load, fora do arranque. Tudo vai ao sair ou esconder a página.
   */
  async function startVitals(load = () => import('web-vitals')) {
    const { onLCP, onINP, onCLS, onFCP, onTTFB } = await load();
    [onLCP, onINP, onCLS, onFCP, onTTFB].forEach((on) => on(reportVital));
    // Na `window` e não no `document`: o evento nasce no `document` e só depois sobe à `window`,
    // por isso este ouvinte corre depois dos do `web-vitals` — que entregam o CLS e o INP finais
    // neste momento, e registam os seus ouvintes mais tarde (o do CLS só depois do FCP). No
    // `document`, este corria primeiro e enviava antes de o CLS e o INP entrarem na fila.
    win.addEventListener('visibilitychange', () => {
      if (win.document?.visibilityState === 'hidden') flush({ beacon: true });
    });
    win.addEventListener('pagehide', () => flush({ beacon: true }));
  }

  return { reportError, reportVital, flush, installErrorReporting, startVitals, queue };
}

function defaultSend(body, { beacon }) {
  try {
    // `text/plain`: o sendBeacon não faz a pré-verificação CORS que o JSON pediria.
    if (beacon && navigator.sendBeacon?.(TELEMETRY_URL, new Blob([body], { type: 'text/plain' }))) return;
    fetch(TELEMETRY_URL, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  } catch {
    // sem rede ou sem API: perde-se esta medição, mais nada
  }
}

/**
 * Liga tudo: os erros já (antes de montar a app) e as Core Web Vitals depois do load, quando o
 * navegador estiver livre. Desligado em desenvolvimento e sem endereço da API.
 */
export function installTelemetry(win = globalThis.window) {
  if (!win || import.meta.env.DEV || !APP_API_URL.startsWith('https://')) return null;
  const telemetry = createTelemetry({ win });
  telemetry.installErrorReporting();
  const start = () => {
    const idle = win.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(() => { telemetry.startVitals().catch(() => {}); }, { timeout: 5000 });
  };
  if (win.document?.readyState === 'complete') start();
  else win.addEventListener('load', start, { once: true });
  return telemetry;
}
