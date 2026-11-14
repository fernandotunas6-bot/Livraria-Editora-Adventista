import { test, expect } from '@playwright/test';

// O Painel de Vendas de uma loja (separador «Vendas por loja»), compilado como em produção.
//
// Em Novembro de 2026 o painel parou a meio do primeiro desenho em produção — só os indicadores
// do topo apareciam — durante dias, com os testes todos verdes: o pacote d3 declara-se sem efeitos
// secundários e o build deixava de fora o módulo que dá o `.transition()` às selecções. Em
// desenvolvimento e no Vitest corre o código fonte, onde isso não acontece. Por isso este teste
// abre a página de teste e2e/painel/ compilada pelo `vite build` (ver playwright.config.js).

const PAINEL = 'http://localhost:4174/';

for (const movimento of ['no-preference', 'reduce']) {
  test(`o painel de uma loja desenha os gráficos e o quadro (movimento: ${movimento})`, async ({ page }) => {
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.emulateMedia({ reducedMotion: movimento });
    await page.goto(PAINEL);

    const painel = page.locator('#host');
    // Os indicadores do topo com os números do Huambo (eram a única coisa que aparecia).
    await expect(painel.locator('#k1')).toContainText('37 679 153');
    // O resto do primeiro desenho: os três gráficos, o quadro geral e os botões dos meses.
    await expect(painel.locator('#chart-acum svg')).toBeVisible();
    await expect(painel.locator('#chart-var svg')).toBeVisible();
    await expect(painel.locator('#tbl-quadro tbody tr')).toHaveCount(12);
    await expect(painel.locator('#sp-chips .chip')).toHaveCount(12);
    // As barras do comparativo mensal acabam de crescer (a animação dura menos de 2 s).
    await expect.poll(async () => painel.locator('#chart-mensal svg rect').evaluateAll(
      (rects) => rects.filter((r) => r.getAttribute('fill') !== 'transparent' && Number(r.getAttribute('height')) > 0).length,
    ), { timeout: 5000 }).toBeGreaterThanOrEqual(20);

    // Escolher outro mês põe-no em destaque (o highlight() também usa transições).
    await painel.locator('#sp-chips .chip', { hasText: 'Mar' }).click();
    await expect(painel.locator('#sp-chips .chip', { hasText: 'Mar' })).toHaveAttribute('aria-pressed', 'true');

    expect(erros, 'erros de JavaScript na página').toEqual([]);
    expect(await page.evaluate(() => window.__erros), 'erros apanhados pela página').toEqual([]);
  });
}
