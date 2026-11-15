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

test('o quadro geral edita-se na própria tabela e a previsão gravada vai para a perspectiva', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(PAINEL + '?editar=1');
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  await painel.locator('#q-editar').click();
  await expect(painel.locator('#q-barra')).toBeVisible();
  const quadro = painel.locator('#tbl-quadro');
  await expect(quadro.locator('input.q2')).toHaveCount(12);
  await expect(quadro.locator('input.q1')).toHaveCount(12);
  // Enquanto se edita, o ano não muda.
  await expect(painel.locator('#sel-ano')).toBeDisabled();

  // Novembro de 2026 ganha valor: volta a ser o mês em curso gravado, e o crescimento recalcula-se.
  const nov = quadro.locator('tbody tr').nth(10);
  await nov.locator('input.q2').fill('1 202 170');
  await expect(nov.locator('select.qe')).toHaveValue('c');
  await expect(nov.locator('.qcr')).toHaveText('+33,6%');
  // O Novembro de 2025 também se corrige no quadro (900 000 → 911 316).
  await nov.locator('input.q1').fill('911 316');
  await expect(nov.locator('.qcr')).toHaveText('+31,9%');
  await quadro.locator('tbody tr').nth(9).locator('input.qo').fill('Valor final do PowerPoint');
  // A previsão do ano, a do PowerPoint da loja: já atingida em Setembro.
  await quadro.locator('input.qp').fill('31 294 120');
  await expect(quadro.locator('.qf2e')).toHaveText('Atingida');
  await expect(quadro.locator('.qf2o')).toContainText('Atingida em Setembro');
  await expect(quadro.locator('.qf2o')).toContainText('7 587 203,00 Kz (+24,2%)');
  // Um valor inválido não deixa gravar.
  await quadro.locator('tbody tr').nth(0).locator('input.q2').fill('abc');
  await expect(painel.locator('#q-guardar')).toBeDisabled();
  await quadro.locator('tbody tr').nth(0).locator('input.q2').fill('2 171 368');
  expect(await page.evaluate(() => window.__gravacoes.length), 'nada gravado antes de Guardar').toBe(0);

  await painel.locator('#q-guardar').click();
  await expect(painel.locator('#q-ok')).toContainText('Guardado');
  await expect(painel.locator('#q-barra')).toBeHidden();
  const gravacoes = await page.evaluate(() => window.__gravacoes);
  expect(gravacoes.map((g) => g.path)).toEqual(['anos/2025', 'anos/2026']);
  // Cada ano com o `actualizado` que o quadro leu ao abrir.
  expect(gravacoes[0].opts).toEqual({ esperado: '2026-11-01T10:00:00.111111+00:00' });
  expect(gravacoes[0].value.meses[10]).toBe(911316);
  expect(gravacoes[1].opts).toEqual({ esperado: '2026-11-01T10:00:00.222222+00:00' });
  expect(gravacoes[1].value.meses[10]).toBe(1202170);
  expect(gravacoes[1].value.mes_em_curso).toBe(11);
  expect(gravacoes[1].value.meta_anual).toBe(31294120);
  expect(gravacoes[1].value.observacoes[9]).toBe('Valor final do PowerPoint');

  // Fora da edição: o fim do quadro e o indicador mostram a previsão, não a projecção (≈ 45 M).
  await expect(quadro.locator('.qf2l')).toHaveText('Ano completo / previsão');
  await expect(quadro.locator('.qf2b')).toHaveText('31 294 120,00 Kz');
  await expect(painel.locator('#k5-lab')).toHaveText('Previsão anual 2026');
  await expect(painel.locator('#k5')).toContainText('31 294 120');
  await expect(painel.locator('#k5-d')).toContainText('atingida em Setembro');

  // O diapositivo «REMARQUE»: «Previsão para 2026: 31 294 120,00» e a situação actual.
  await painel.locator('#btn-pres').click();
  await painel.locator('#pr-next').press('End');
  const slide = painel.locator('#pres-view .slide');
  await expect(slide.locator('.s-rem-t')).toBeVisible();
  await expect(slide.locator('.s-rem-box.pink .big')).toHaveText('31 294 120,00');
  await expect(slide.locator('.s-rem-box.pink .sm')).toContainText('previsão do ano');
  await expect(slide.locator('.s-rem-box').nth(1).locator('.big')).toHaveText('38 881 323,00');
  await expect(slide.locator('.s-rem-box').nth(1)).toContainText('Previsão atingida em Setembro');
  await expect(slide.locator('.s-rem-box').nth(1)).toContainText('+7 587 203,00 AOA acima · +24,2%');
  expect(erros, 'erros de JavaScript na página').toEqual([]);
  expect(await page.evaluate(() => window.__erros), 'erros apanhados pela página').toEqual([]);
});

test('cancelar a edição do quadro deixa tudo como estava', async ({ page }) => {
  await page.goto(PAINEL + '?editar=1');
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  await painel.locator('#q-editar').click();
  const quadro = painel.locator('#tbl-quadro');
  await quadro.locator('tbody tr').nth(2).locator('input.q2').fill('9 999 999');
  await expect(painel.locator('#q-st')).toContainText('Alterações por guardar');
  await painel.locator('#q-cancelar').click();
  await expect(painel.locator('#q-barra')).toBeHidden();
  await expect(quadro.locator('input')).toHaveCount(0);
  await expect(quadro.locator('tbody tr').nth(2)).toContainText('4 956 455,00 Kz');
  await expect(painel.locator('#sel-ano')).toBeEnabled();
  expect(await page.evaluate(() => window.__gravacoes.length)).toBe(0);
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


// O ranking cortava «Livraria Adventista — Catumbela» com «…» ao lado do valor. Agora leva o nome
// curto, como o modo apresentação, e nenhum nome fica escondido.
test('todas as livrarias: o ranking mostra o nome de cada loja por inteiro', async ({ page }) => {
  await page.goto(CONJUNTO);
  const nomes = page.locator('#host').locator('#rank .nm');
  await expect(nomes).toHaveText(['Loja do Huambo', 'Loja do Lubango', 'Loja de Catumbela']);
  await expect(nomes.nth(2)).toHaveAttribute('title', 'Livraria Adventista — Catumbela');
  for (const nm of await nomes.all()) {
    expect(await nm.evaluate((e) => e.scrollWidth <= e.clientWidth), await nm.textContent()).toBe(true);
  }
});

// Pedido do dono (14/11): os relatórios não dizem «PowerPoint». O ficheiro que as lojas mandam é o
// «Painel de Vendas» da loja. Conta todo o texto dos dois ecrãs, também o das secções escondidas
// (a grelha de lançamento, as correcções), os títulos, as etiquetas e as mensagens da importação.
const textoDoEcra = (host) => host.evaluate((h) => {
  const raiz = h.shadowRoot || h;
  const partes = [];
  const andar = (n) => {
    for (const f of n.childNodes) {
      if (f.nodeType === 3) partes.push(f.textContent);
      else if (f.nodeType === 1 && !['STYLE', 'SCRIPT'].includes(f.tagName)) {
        for (const a of ['title', 'aria-label', 'placeholder', 'alt']) if (f.getAttribute(a)) partes.push(f.getAttribute(a));
        andar(f);
      }
    }
  };
  andar(raiz);
  return partes.join(' ');
});

test('os relatórios não usam a palavra PowerPoint', async ({ page }) => {
  await page.goto(PAINEL);
  await expect(page.locator('#host').locator('#tbl-quadro tbody tr')).toHaveCount(12);
  expect(await textoDoEcra(page.locator('#host'))).not.toMatch(/power\s*point/i);

  await page.goto(CONJUNTO);
  const rel = page.locator('#host');
  await rel.locator('#btn-edit').click();
  await expect(rel.locator('#ed-ppt').locator('..')).toContainText('Escolher o ficheiro');
  // O Painel de Vendas real do Huambo (raiz do repositório): 2026 já está na grelha, nada muda.
  await rel.locator('#ed-ppt').setInputFiles('../../Loja Huambo - Painel-Vendas 2026S (1).pptx');
  await expect(rel.locator('#ed-ppt-go')).toBeEnabled();
  await rel.locator('#ed-ppt-go').click();
  await expect(rel.locator('#ed-ppt-st')).toContainText('a grelha já tem os valores do ficheiro');
  expect(await textoDoEcra(rel)).not.toMatch(/power\s*point/i);
});

// Pedido do dono (14/11): no modo apresentação, o diapositivo de cada mês deixa a «Sequência de
// apresentação» (1.º 2025, 2.º 2026, 3.º Crescimento) e mostra o detalhe em cartões, como o
// «Período em apresentação até» do painel, com os valores inteiros (sem «…»).
test('modo apresentação: o detalhe do mês em cartões, sem a sequência', async ({ page }) => {
  await page.goto(PAINEL);
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  // No painel, os valores do período também cabem inteiros.
  expect(await painel.locator('.pk b').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent))).toEqual([]);
  await painel.locator('#btn-pres').click();
  const slide = painel.locator('#pres-view .slide');
  for (let i = 0; i < 20 && !(await slide.locator('.s-dk').count()); i++) await painel.locator('#pr-next').click();
  await expect(slide.locator('.s-ct').last()).toHaveText('Detalhe de Janeiro');
  await expect(slide.getByText('Sequência de apresentação')).toHaveCount(0);
  const cartoes = slide.locator('.s-dkc');
  await expect(cartoes.locator('span')).toHaveText(['Média mensal 2025', 'Média mensal 2026', 'Diferença mensal 25/26', 'Diferença periódica 25/26']);
  await expect(cartoes.locator('b').nth(2)).toHaveText('+1 952 693,00 Kz');
  await expect(cartoes.locator('b').nth(2)).toHaveClass(/s-ok/);
  expect(await cartoes.locator('b').evaluateAll((bs) => bs.every((b) => b.scrollWidth <= b.clientWidth))).toBe(true);
  await expect(slide.locator('.s-dst')).toContainText('Fechado');
});

// Pedido do dono (14/11): na apresentação, os números rodam como num contador de máquina de
// calcular, os totais ficam com o duplo traço dos balancetes, e há som (tiques, subidas, caixa
// registadora), com um botão para o desligar.
test('modo apresentação: som, números a rodar e o duplo traço dos totais', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(PAINEL);
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  await painel.locator('#btn-pres').click();
  const som = painel.locator('#pr-som');
  await expect(som).toHaveAttribute('aria-pressed', 'true');
  await expect(som).toContainText('Som ligado');
  const slide = painel.locator('#pres-view .slide');
  for (let i = 0; i < 20 && !(await slide.locator('.s-dk').count()); i++) await painel.locator('#pr-next').click();
  const total = slide.locator('.s-kpi .v.dupla');
  // A rodar: cada algarismo é uma fita; no fim, só o valor, sublinhado com o duplo traço.
  await expect(total.locator('.odo-f').first()).toBeAttached();
  await expect(total).toHaveText('2 171 368,00 Kz');
  await expect(total).toHaveClass(/\bon\b/);
  await expect(slide.locator('.s-dkc b.dupla')).toHaveText('+1 952 693,00 Kz');
  // O logótipo da Livraria continua no canto do diapositivo.
  await expect.poll(() => slide.locator('img.s-logo').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);

  await som.click();
  await expect(som).toHaveAttribute('aria-pressed', 'false');
  await expect(som).toContainText('Som desligado');
  expect(await page.evaluate(() => localStorage.getItem('livraria_apresentacao_som'))).toBe('desligado');
  await page.keyboard.press('m');
  await expect(som).toHaveAttribute('aria-pressed', 'true');
  expect(erros).toEqual([]);

  // Todas as livrarias: o mesmo botão, com a escolha deste aparelho.
  await page.goto(CONJUNTO);
  await page.locator('#host').locator('#btn-pres').click();
  await expect(page.locator('#host').locator('#pr-som')).toHaveAttribute('aria-pressed', 'true');
});

// Pedido do dono (14/11): o espaço vazio por baixo do Comparativo mensal passa a ter o Mapa do ano,
// uma grelha de cores dos 12 meses (cada ano, o crescimento e o peso no ano); clicar num mês põe-no
// em destaque.
test('o Mapa do ano ocupa o espaço por baixo do Comparativo mensal e põe o mês em destaque', async ({ page }) => {
  await page.goto(PAINEL);
  const painel = page.locator('#host');
  await expect(painel.locator('#k1')).toContainText('37 679 153');
  const mapa = painel.locator('#mapa-g');
  await expect(mapa.locator('.mapa-m')).toHaveCount(12);
  await expect(mapa.locator('.mapa-l')).toHaveText(['2025', '2026', 'Crescimento', 'Peso em 2026']);
  await expect(mapa.locator('.mapa-c')).toHaveCount(48);
  await expect(mapa.locator('.mapa-c[data-mes="Julho"]').nth(2)).toHaveText('+2158%');
  await expect(mapa.locator('.mapa-c[data-mes="Novembro"]').nth(1)).toHaveClass(/\best\b/);
  await mapa.locator('.mapa-c[data-mes="Março"]').first().click();
  await expect(painel.locator('#sp-mes')).toHaveText('Março');
  await expect(mapa.locator('.mapa-m[data-mes="Março"]')).toHaveAttribute('aria-pressed', 'true');
  // No computador, o mapa chega ao fundo do cartão: não fica espaço vazio por baixo.
  const vazio = await painel.locator('#card-mensal').evaluate((c) => c.getBoundingClientRect().bottom - c.querySelector('#mapa-ano').getBoundingClientRect().bottom);
  if ((page.viewportSize()?.width || 0) >= 1000) expect(vazio).toBeLessThan(40);
  expect(await mapa.locator('.mapa-c span, .mapa-m').evaluateAll((es) => es.filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
});
