// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { test, expect } from '@playwright/test';

// O Estúdio de vídeo dos relatórios (estudio-video.js), sobre as páginas de teste compiladas em
// e2e/painel/ (ver painel-vendas.spec.js): abrir, pré-visualizar, a banda sonora medida na página
// som.html e uma gravação a sério, com a narração num microfone falso do Chromium (um tom), que o
// navegador autoriza sem perguntar.
test.use({ permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

const PAINEL = 'http://localhost:4174/';
const CONJUNTO = 'http://localhost:4174/conjunto.html';
const SOM = 'http://localhost:4174/som.html';
const imagensDoSite = async (page) => {
  const publico = new URL('../public/', import.meta.url);
  await page.route('**/images/**', (route) => route.fulfill({ path: new URL('.' + new URL(route.request().url()).pathname, publico).pathname }));
};

test('o Estúdio de vídeo abre com a linha de tempo, pré-visualiza e fecha', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await imagensDoSite(page);
  await page.goto(PAINEL + '?imagens=1');
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  await painel.locator('#btn-exp').click();
  await painel.locator('#exp-menu button[data-ritmo="lento"]').click();
  const estudio = painel.locator('.estudio');
  await expect(estudio).toBeVisible();
  await expect(estudio.locator('.es-estado')).toContainText(/Vídeo lento: \d+ min .* \d+ quadros, \d+ efeitos de som, com legendas/, { timeout: 30_000 });
  // As pistas: um bloco por quadro, a narração (o guião) e os efeitos, cada um no seu segundo.
  const quadros = await estudio.locator('.es-pista').nth(0).locator('.es-bloco').count();
  expect(quadros).toBeGreaterThan(15);
  await expect(estudio.locator('.es-pista').nth(1).locator('.es-bloco').first()).toContainText('Relatório de vendas de 2026');
  expect(await estudio.locator('.es-som').count()).toBeGreaterThan(50);
  await expect(estudio.locator('.es-som[title^="Porta a abrir"]').first()).toBeAttached();
  await expect(estudio.locator('.es-som[title^="Caixa registadora"]').first()).toBeAttached();
  // Reproduzir: o tempo avança; pausar pára.
  await estudio.locator('.es-play').click();
  await expect(estudio.locator('.es-tempo')).not.toHaveText(/^0:00 \//, { timeout: 5_000 });
  await estudio.locator('.es-play').click();
  // Saltar na linha de tempo para perto do fim (no telemóvel a linha de tempo desliza: vai-se ao fim dela).
  await estudio.locator('.es-linha').evaluate((e) => { e.scrollLeft = e.scrollWidth; });
  const linha = await estudio.locator('.es-linha').boundingBox();
  const pistas = await estudio.locator('.es-pistas').boundingBox();
  await page.mouse.click(linha.x + linha.width - 30, pistas.y + 10);
  await expect(estudio.locator('.es-cena')).toContainText('Perspectiva do ano');
  await page.keyboard.press('Escape');
  await expect(estudio).toHaveCount(0);
  expect(erros, 'erros de JavaScript na página').toEqual([]);
});

test('a banda sonora: cada efeito ouve-se por cima da música, sem saturar', async ({ page }) => {
  test.skip(test.info().project.name !== 'computador', 'Basta num navegador: o som é o mesmo.');
  await page.goto(SOM);
  await page.waitForFunction(() => window.__somPronto);
  const r = await page.evaluate(async () => {
    const sons = ['transicao', 'porta', 'porta_fechar', 'caixa', 'moedas', 'subida', 'subida_longa', 'queda', 'alerta', 'brilho', 'impacto', 'pagina', 'pop'];
    const pista = sons.map((som, i) => ({ t: 2 + i * 3.5, som, ganho: 0.6, pan: 0, vel: 1 }));
    const total = 2 + sons.length * 3.5 + 3;
    const m = await window.__som.misturar(pista, total);
    const media = (a, i0, i1) => { const x = a.slice(i0, i1); return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length); };
    return {
      pico: m.tudo.pico,
      musica: media(m.musica.rms, 60, m.musica.rms.length - 80),
      acima: pista.map((d) => { const i0 = Math.round(d.t / 0.05); return [d.som, 20 * Math.log10(Math.max(...m.efeitos.rms.slice(i0, i0 + 64)) / media(m.musica.rms, i0, i0 + 32))]; }),
    };
  });
  expect(r.pico).toBeLessThan(1);
  expect(r.musica).toBeGreaterThan(0.02);
  r.acima.forEach(([som, db]) => expect(db, som).toBeGreaterThan(3));
});

test.describe('gravar com a voz', () => {
  test('todas as livrarias: grava o vídeo curto com música, efeitos e a narração', async ({ page }) => {
    test.skip(test.info().project.name !== 'computador', 'A gravação é em tempo real: basta num navegador.');
    test.slow();
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await imagensDoSite(page);
    await page.goto(CONJUNTO + '?imagens=1');
    const rel = page.locator('#host');
    await rel.locator('#btn-exp').click();
    await rel.locator('#exp-menu button[data-ritmo="curto"]').click();
    const estudio = rel.locator('.estudio');
    await expect(estudio.locator('.es-estado')).toContainText('Vídeo curto', { timeout: 30_000 });
    await estudio.locator('#es-narracao').check();
    await expect(estudio.locator('.es-estado')).toContainText('Vídeo curto', { timeout: 30_000 });
    await expect(estudio.locator('.es-narr')).toHaveClass(/on/);
    await expect(estudio.locator('.es-teleponto .agora')).toContainText('Relatório conjunto de 2026');
    await estudio.locator('.es-gravar').click();
    await expect(estudio.locator('.es-estado')).toContainText('A gravar com a sua voz', { timeout: 15_000 });
    await expect(estudio.locator('.es-estado')).toContainText('Vídeo pronto', { timeout: 150_000 });
    await expect(estudio.locator('.es-estado')).toContainText('com som e a sua narração');
    const ficheiro = await page.evaluate(async () => {
      const f = window.__ficheiro;
      const ab = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(await f.data.arrayBuffer());
      const d = ab.getChannelData(0);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      return { nome: f.filename, duracao: ab.duration, rms: Math.sqrt(s / d.length) };
    });
    expect(ficheiro.nome).toMatch(/^relatorio-livrarias-2026-vs-2025-video-curto\.(webm|mp4)$/);
    expect(ficheiro.duracao).toBeGreaterThan(20);
    expect(ficheiro.rms).toBeGreaterThan(0.02);
    expect(erros, 'erros de JavaScript na página').toEqual([]);
  });
});
