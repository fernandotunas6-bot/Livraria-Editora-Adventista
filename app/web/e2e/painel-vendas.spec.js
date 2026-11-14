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

test('ao gravar, o painel pede confirmação de um valor invulgar e manda o actualizado que leu', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(PAINEL + '?editar=1');
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  await painel.locator('#btn-admin').click();
  await expect(painel.locator('#editar')).toBeVisible();

  // Agosto com um zero a mais: dez vezes o Agosto de 2025.
  await painel.locator('#ed-m7').fill('29 042 000');
  await painel.locator('#ed-save').click();
  await expect(painel.locator('#ed-status')).toContainText('valores invulgares');
  await expect(painel.locator('#ed-status')).toContainText('Ago: +900% face a Ago de 2025');
  expect(await page.evaluate(() => window.__gravacoes.length), 'nada gravado antes de confirmar').toBe(0);

  // A segunda carga grava, com o `actualizado` que o painel leu (o servidor recusa se mudou).
  await painel.locator('#ed-save').click();
  await expect(painel.locator('#ed-status')).toContainText('Guardado');
  const [g] = await page.evaluate(() => window.__gravacoes);
  expect(g.path).toBe('anos/2026');
  expect(g.opts).toEqual({ esperado: '2026-11-01T10:00:00.222222+00:00' });
  expect(g.value.meses[7]).toBe(29042000);
  expect(erros).toEqual([]);
});

test('substituir um mês registado pelas vendas do sistema pede confirmação', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(PAINEL + '?editar=1');
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  await painel.locator('#btn-admin').click();
  await painel.locator('#ed-sys-load').click();
  await expect(painel.locator('#ed-sys-st')).toContainText('Só o site');

  // O sistema só tem 21 665 Kz em Outubro (uma encomenda do site); a loja registou 4 908 704 Kz.
  await painel.locator('#ed-sys-all').click();
  await expect(painel.locator('#ed-sys-st')).toContainText('Atenção');
  await expect(painel.locator('#ed-sys-st')).toContainText('Out:');
  await expect(painel.locator('#ed-m9')).toHaveValue('4 908 704');
  await expect(painel.locator('#ed-sys-all')).toContainText('Confirmar');

  await painel.locator('#ed-sys-all').click();
  await expect(painel.locator('#ed-m9')).toHaveValue('21 665');
  await expect(painel.locator('#ed-sys-all')).toHaveText('Substituir meses com vendas');
  expect(erros).toEqual([]);
});

// --- O relatório de todas as livrarias (e2e/painel/conjunto.html) -------------------------------
const CONJUNTO = 'http://localhost:4174/conjunto.html';

test('todas as livrarias: mostra os valores a confirmar e protege a substituição pelo sistema', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(CONJUNTO);
  const rel = page.locator('#host');

  // Os meses invulgares de cada loja (o Huambo face a 2025, Julho no Lubango), sem gravar nada.
  await expect(rel.locator('#conf')).toBeVisible();
  await expect(rel.locator('#conf-list')).toContainText('Huambo');
  await expect(rel.locator('#conf-list')).toContainText('Set: +1 441% face a Set de 2025');
  await expect(rel.locator('#conf-list')).not.toContainText('Catumbela');
  await expect(rel.locator('#sys-note')).toContainText('não passam pelo site');

  // A grelha de lançamento, com as vendas do sistema carregadas.
  await rel.locator('#btn-edit').click();
  await rel.locator('#sys-load').click();
  await expect(rel.locator('#sys-st')).toContainText('do site');
  await rel.locator('#ed-all').click();
  await expect(rel.locator('#ed-sys-st')).toContainText('Atenção');
  await expect(rel.locator('#ed-sys-st')).toContainText('4 908 704,00 → 21 665,00');
  const outubro = rel.getByLabel('Livraria Adventista — Huambo, Outubro de 2026');
  await expect(outubro).toHaveValue('4 908 704');
  await rel.locator('#ed-all').click();
  await expect(outubro).toHaveValue('21 665');

  // Gravar: 21 665 Kz em vez de 4 908 704 Kz é invulgar, e o ecrã pede confirmação primeiro.
  await rel.locator('#ed-save').click();
  await expect(rel.locator('#ed-status')).toContainText('Out: −99% face a Out de 2025');
  expect(await page.evaluate(() => window.__gravacoes.length)).toBe(0);
  // A segunda carga grava: a linha leva o actualizado que a grelha leu e a origem «sistema».
  await rel.locator('#ed-save').click();
  await expect(rel.locator('#ed-status')).toContainText('Guardado');
  const [g] = await page.evaluate(() => window.__gravacoes);
  expect(g.linhas).toHaveLength(1);
  expect(g.linhas[0]).toMatchObject({ lojaId: 'huambo', esperado: '2026-11-01T10:00:00.202600+00:00', origem: 'sistema' });
  expect(g.linhas[0].meses[9]).toBe(21665);
  expect(erros).toEqual([]);
});

test('todas as livrarias: uma gravação recusada por conflito diz porquê', async ({ page }) => {
  await page.goto(CONJUNTO + '?conflito=1');
  const rel = page.locator('#host');
  await rel.locator('#btn-edit').click();
  await rel.getByLabel('Livraria Adventista — Lubango, Novembro de 2026').fill('400 000');
  await rel.locator('#ed-save').click();
  await expect(rel.locator('#ed-status')).toContainText('mudaram depois de os abrir');
  await expect(rel.locator('#ed-save')).toBeEnabled();
});

// O modo apresentação com imagens: a parede de capas na capa, as fotografias da loja, os mais
// vendidos com capa e uma fotografia por trás do fecho. As imagens vêm de public/ (a página de
// teste é compilada à parte e não as copia).
test('o modo apresentação mostra as capas, as fotografias da loja e os mais vendidos', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const publico = new URL('../public/', import.meta.url);
  await page.route('**/images/**', (route) => route.fulfill({ path: new URL('.' + new URL(route.request().url()).pathname, publico).pathname }));
  await page.goto(PAINEL + '?imagens=1');
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  // Os mais vendidos chegaram (o cartão do painel aparece) antes de abrir a apresentação.
  await expect(painel.locator('#mv')).toBeVisible();
  await painel.locator('#btn-pres').click();

  const slide = painel.locator('#pres-view .slide');
  await expect(slide.locator('.s-cover-capas .hc-c').first()).toBeVisible();
  await expect(slide.locator('.s-num')).toHaveText(/^1 \/ /);

  await painel.locator('#pr-next').click();
  await expect(slide.locator('.s-loja-t')).toHaveText('Loja do Huambo');
  await expect(slide.locator('.s-foto')).toHaveCount(3);
  await expect.poll(() => slide.locator('.s-foto-im').evaluateAll((ims) => ims.filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(3);
  await expect(slide.locator('figcaption').first()).toContainText('Balcão');

  await painel.locator('#pr-next').click();
  await painel.locator('#pr-next').click();
  await expect(slide.locator('.s-sub')).toContainText('Os mais vendidos de 2026');
  await expect(slide.locator('.mv-i')).toHaveCount(6);
  // O livro sem capa leva a capa tipográfica com o título.
  await expect(slide.locator('.hc-sem')).toHaveText('Livro sem capa');

  await painel.locator('#pr-next').press('End');
  await expect(slide.locator('.s-rem-t')).toBeVisible();
  await expect(slide.locator('.s-bg-foto .s-foto-im')).toHaveCount(1);

  expect(erros, 'erros de JavaScript na página').toEqual([]);
  expect(await page.evaluate(() => window.__erros), 'erros apanhados pela página').toEqual([]);
});

// Todas as livrarias no modo apresentação: cada loja com a sua fotografia (ou, sem fotografias, a
// sua cor e a terra), o ranking com as fotografias em círculo e um diapositivo por loja.
test('todas as livrarias: o modo apresentação mostra todas as lojas com as suas imagens', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const publico = new URL('../public/', import.meta.url);
  await page.route('**/images/**', (route) => route.fulfill({ path: new URL('.' + new URL(route.request().url()).pathname, publico).pathname }));
  await page.goto(CONJUNTO + '?imagens=1');
  const rel = page.locator('#host');
  await expect(rel.locator('#mv')).toBeVisible();
  await rel.locator('#btn-pres').click();
  const slide = rel.locator('#pres-view .slide');

  await expect(slide.locator('.s-cover-eye')).toHaveText('TODAS AS LIVRARIAS');
  await expect(slide.locator('.s-cover-capas .hc-c').first()).toBeVisible();

  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-loja-t')).toHaveText('As livrarias');
  await expect(slide.locator('.s-rede-l')).toHaveCount(3);
  await expect(slide.locator('.s-rede-l').nth(0)).toContainText('Loja do Huambo');
  // O Huambo não tem fotografias: fica a cor da loja com a terra.
  await expect(slide.locator('.s-rede-l').nth(0).locator('.s-sem-foto-t')).toHaveText('Huambo');
  await expect.poll(() => slide.locator('.s-rede-l .s-foto-im').evaluateAll((ims) => ims.filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(2);

  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-sub')).toContainText('Resumo da rede');
  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-rank-l')).toHaveCount(3);
  await expect(slide.locator('.s-rank-l').first()).toContainText('Loja do Huambo');

  // Um diapositivo por loja, pela posição: o Huambo primeiro, depois as outras com a fotografia.
  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-lj-t')).toHaveText('Loja do Huambo');
  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-lj-t')).toHaveText('Loja do Lubango');
  await expect(slide.locator('.s-lj-leg')).toHaveText('A entrada da loja');
  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-lj-t')).toHaveText('Loja de Catumbela');

  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-sub')).toContainText('Os mais vendidos de 2026');
  await expect(slide.locator('.mv-i')).toHaveCount(3);
  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-table tbody tr')).toHaveCount(3);
  await rel.locator('#pr-next').click();
  await expect(slide.locator('.s-rem-t')).toHaveText('PERSPECTIVA DA REDE');
  await expect(slide.locator('.s-bg-mosaico .m')).toHaveCount(2);

  expect(erros, 'erros de JavaScript na página').toEqual([]);
  expect(await page.evaluate(() => window.__erros), 'erros apanhados pela página').toEqual([]);
});

