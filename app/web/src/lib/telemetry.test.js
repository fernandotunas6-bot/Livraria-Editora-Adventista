// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ERRORS_PER_PAGE, createTelemetry } from './telemetry';

/** Uma janela mínima: o caminho, a largura e os ouvintes que o recolhedor regista. */
function janela({ path = '/product/abc?x=1', largo = false } = {}) {
  const ouvintes = {};
  const doc = { visibilityState: 'visible', addEventListener: (t, fn) => { ouvintes[`doc:${t}`] = fn; } };
  return {
    ouvintes,
    document: doc,
    location: { pathname: path.split('?')[0] },
    navigator: { connection: { effectiveType: '3g' } },
    matchMedia: () => ({ matches: largo }),
    addEventListener: (t, fn) => { ouvintes[t] = fn; },
  };
}

let enviados;
const send = (body, opts) => enviados.push({ ...JSON.parse(body), ...opts });

beforeEach(() => { enviados = []; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('erros', () => {
  it('um erro sai pouco depois, com a página, o aparelho, a rede e a versão', () => {
    const t = createTelemetry({ win: janela(), send, version: '2026.11.11-abc' });
    expect(t.reportError('TypeError: x is undefined', { source: '/assets/index.js', line: 3, col: 9 })).toBe(true);
    expect(enviados).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].events[0]).toMatchObject({
      kind: 'error', name: 'TypeError: x is undefined', page: '/product/abc', device: 'mobile', connection: '3g',
      app_version: '2026.11.11-abc', detail: { source: '/assets/index.js', line: 3, col: 9 },
    });
  });

  it('o mesmo erro não se repete, e há um máximo por página', () => {
    const t = createTelemetry({ win: janela(), send });
    t.reportError('A');
    expect(t.reportError('A')).toBe(false);
    for (let i = 0; i < 10; i++) t.reportError(`erro ${i}`);
    t.flush();
    expect(enviados.flatMap((e) => e.events)).toHaveLength(MAX_ERRORS_PER_PAGE);
  });

  it('ignora o que não é da loja: extensões, "Script error." e pedidos cancelados', () => {
    const t = createTelemetry({ win: janela(), send });
    expect(t.reportError('Script error.')).toBe(false);
    expect(t.reportError('x', { source: 'chrome-extension://abc/inject.js' })).toBe(false);
    expect(t.reportError('AbortError: The user aborted a request.')).toBe(false);
    expect(t.reportError('ResizeObserver loop completed with undelivered notifications.')).toBe(false);
    expect(t.reportError('')).toBe(false);
  });

  it('ignora o ruído das extensões que só se vê na pilha ou na mensagem (MetaMask)', () => {
    const t = createTelemetry({ win: janela(), send: () => {} });
    expect(t.reportError('Failed to connect to MetaMask')).toBe(false);
    expect(t.reportError('Cannot read properties of undefined', { stack: 'TypeError: x\n    at chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/inpage.js:1:2' })).toBe(false);
    expect(t.reportError('E.attr(...).attr(...).transition is not a function', { stack: 'TypeError\n    at https://livrariaadventista.ao/assets/VendasHuamboTab-x.js:1:2' })).toBe(true);
  });

  it('apanha os erros e as promessas rejeitadas da janela, mas não as imagens que falham', () => {
    const w = janela();
    const t = createTelemetry({ win: w, send });
    t.installErrorReporting();
    w.ouvintes.error({ message: 'ReferenceError: y', filename: '/assets/a.js', lineno: 1, colno: 2, error: { stack: 'at a' } });
    w.ouvintes.error({ target: { tagName: 'IMG' } });
    w.ouvintes.unhandledrejection({ reason: new Error('Falhou o pedido') });
    t.flush();
    expect(enviados[0].events.map((e) => e.name)).toEqual(['ReferenceError: y', 'Falhou o pedido']);
  });
});

describe('Core Web Vitals', () => {
  it('juntam-se e vão por sendBeacon quando a página se esconde', async () => {
    const w = janela({ path: '/', largo: true });
    const t = createTelemetry({ win: w, send });
    const chamadas = {};
    const falso = Object.fromEntries(['onLCP', 'onINP', 'onCLS', 'onFCP', 'onTTFB'].map((n) => [n, (cb) => { chamadas[n] = cb; }]));
    await t.startVitals(async () => falso);
    // A pessoa já mudou de página (navegação dentro da app) quando o LCP final chega: é da de entrada.
    w.location.pathname = '/shop';
    chamadas.onLCP({ name: 'LCP', value: 2400 });
    chamadas.onCLS({ name: 'CLS', value: 0.02 });
    chamadas.onINP({ name: 'INP', value: Number.NaN }); // medição inválida: fica de fora
    expect(enviados).toHaveLength(0);
    w.document.visibilityState = 'hidden';
    w.ouvintes.visibilitychange();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].beacon).toBe(true);
    expect(enviados[0].events).toEqual([
      { page: '/', device: 'desktop', connection: '3g', app_version: expect.any(String), kind: 'vital', name: 'LCP', value: 2400 },
      { page: '/', device: 'desktop', connection: '3g', app_version: expect.any(String), kind: 'vital', name: 'CLS', value: 0.02 },
    ]);
  });

  it('os erros ficam com a página onde aconteceram', () => {
    const w = janela({ path: '/' });
    const t = createTelemetry({ win: w, send });
    w.location.pathname = '/track';
    t.reportError('Falhou');
    t.flush();
    expect(enviados[0].events[0].page).toBe('/track');
  });

  it('em lotes de 20, como a Edge Function aceita', () => {
    const t = createTelemetry({ win: janela(), send });
    for (let i = 0; i < 45; i++) t.reportVital({ name: 'FCP', value: i });
    t.flush({ beacon: true });
    expect(enviados.map((e) => e.events.length)).toEqual([20, 20, 5]);
  });
});
