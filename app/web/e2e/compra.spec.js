import { readFile } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';
import { LojaFalsa } from './lojaFalsa.js';

// O fluxo de compra de ponta a ponta, como o faz quem compra: catálogo → livro → carrinho →
// dados e pagamento → página de sucesso → rastreio → confirmação de recepção.
//
// Os testes unitários provam cada peça; estes provam que as peças se ligam. Os dois erros que
// este fluxo apanhou ao ser escrito (a precisão do GPS e o estado do pagamento perdidos entre o
// carrinho e o servidor) eram precisamente de ligação: cada lado estava certo sozinho.

const test = base.extend({
  /** A loja deste teste: catálogo, stock e encomendas próprios (ver lojaFalsa.js). */
  // `entregar` é o `use` do Playwright; com esse nome o ESLint tomava-o por um Hook do React.
  loja: async ({ context }, entregar) => {
    const loja = new LojaFalsa();
    await loja.ligar(context);
    await entregar(loja);
    // Uma rota nova no fluxo de compra tem de ser conhecida da loja falsa: sem isto, o site
    // recebia um 404 calado e o teste passava a provar outra coisa.
    expect(loja.rotasDesconhecidas, 'rotas da API pedidas que a loja falsa não conhece').toEqual([]);
    // O site manda os erros de JavaScript para a saúde do site (lib/telemetry.js): uma compra não
    // pode deixar nenhum para trás.
    expect(loja.telemetria.filter((e) => e.kind === 'error'), 'erros de JavaScript durante o teste').toEqual([]);
  },
});

const CLIENTE = {
  nome: 'Maria dos Santos',
  email: 'maria.santos@exemplo.invalid',
  telefone: '923456789',
  rua: 'Rua Amílcar Cabral, 45, 2.º andar',
  referencia: 'Junto à farmácia central',
};

const carrinho = (page) => page.getByRole('dialog', { name: /Carrinho|Finalizar Compra/ });

/** Abre a página do livro e manda-o para o carrinho ("Comprar Agora" abre o carrinho). */
async function comprarLivro(page, id, { quantidade = 1 } = {}) {
  await page.goto(`/product/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (let i = 1; i < quantidade; i += 1) await page.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await page.getByRole('button', { name: 'Comprar Agora' }).click();
  await expect(carrinho(page)).toBeVisible();
}

/** Escolhe uma opção numa lista de selecção (Radix Select) pelo rótulo do campo. */
async function escolher(page, rotulo, opcao) {
  await carrinho(page).getByLabel(rotulo).click();
  await page.getByRole('option', { name: opcao, exact: true }).click();
}

async function preencherMorada(page) {
  const c = carrinho(page);
  await escolher(page, 'Província *', 'Luanda');
  await escolher(page, 'Município *', 'Belas');
  await c.getByLabel('Bairro, comuna ou localidade').fill('Bairro Operário');
  await c.getByLabel('Rua / Avenida / Morada *').fill(CLIENTE.rua);
  await c.getByLabel('Ponto de referência *').fill(CLIENTE.referencia);
  await c.getByLabel('Telefone de contacto *').fill(CLIENTE.telefone);
}

/** Um traço no quadro de assinatura, com o rato ou com o dedo (o quadro ouve os dois). */
async function assinar(page, quadro) {
  await quadro.scrollIntoViewIfNeeded();
  const box = await quadro.boundingBox();
  const pontos = [[0.2, 0.6], [0.35, 0.3], [0.5, 0.7], [0.65, 0.35], [0.8, 0.6]]
    .map(([x, y]) => ({ x: box.x + box.width * x, y: box.y + box.height * y }));
  await page.mouse.move(pontos[0].x, pontos[0].y);
  await page.mouse.down();
  for (const p of pontos.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
}

test('compra sem conta, com entrega: do catálogo à confirmação de recepção', async ({ page, loja }) => {
  // 1. O catálogo mostra o livro; tocar no cartão abre a visualização rápida, e dela vai-se
  // à página do livro.
  await page.goto('/shop');
  await page.getByRole('link', { name: /^O Caminho a Cristo/ }).first().click();
  await page.getByRole('link', { name: 'Ver Página Completa' }).click();
  await expect(page).toHaveURL(/\/product\/livro-caminho/);
  await expect(page.getByRole('heading', { level: 1, name: 'O Caminho a Cristo' })).toBeVisible();

  // 2. Dois exemplares para o carrinho.
  await page.getByRole('button', { name: 'Aumentar quantidade' }).click();
  await page.getByRole('button', { name: 'Comprar Agora' }).click();
  const c = carrinho(page);
  await expect(c.getByRole('heading', { name: 'O Caminho a Cristo' })).toBeVisible();
  await expect(c.getByText('2 itens')).toBeVisible();

  // 3. Dados de entrega e pagamento. O total já traz os portes (2 × 4500 + 1500).
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);
  await expect(c.getByRole('radio', { name: /Pagamento na entrega/ })).toBeChecked();
  // "Pagar no Balcão" é só do levantamento: numa entrega não aparece.
  await expect(c.getByRole('radio', { name: /Pagar no Balcão/ })).toHaveCount(0);
  await assinar(page, c.locator('canvas'));

  // 4. Confirmar: uma encomenda, com o que o servidor precisa.
  await c.getByRole('button', { name: /Confirmar Compra · Kz 10[\s. ]?500(,00)?/ }).click();
  await expect(page).toHaveURL(/\/success\?/);
  expect(loja.pedidosCheckout).toHaveLength(1);
  expect(loja.pedidosCheckout[0]).toMatchObject({
    items: [{ variant_id: 'livro-caminho-default', quantity: 2 }],
    customerName: CLIENTE.nome,
    customerEmail: CLIENTE.email,
    phone: '+244 923 456 789',
    shippingMethod: 'delivery',
    paymentMethodCode: 'entrega',
    saleChannel: 'web_purchase',
    deliveryProvince: 'Luanda',
    deliveryMunicipality: 'Belas',
    deliveryLocality: 'Bairro Operário',
    deliveryStreet: CLIENTE.rua,
    deliveryReference: CLIENTE.referencia,
  });
  expect(loja.pedidosCheckout[0].checkoutSignature).toMatch(/^data:image\/png;base64,/);
  expect(loja.pedidosCheckout[0].idempotencyKey).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  const [encomenda] = loja.encomendas;
  expect(encomenda.total).toBe(10500);
  expect(loja.livro('livro-caminho').stock).toBe(6);

  // 5. A página de sucesso mostra a encomenda, e o carrinho ficou vazio.
  await expect(page.getByRole('heading', { level: 1, name: 'Compra Confirmada!' })).toBeVisible();
  await expect(page.getByText(encomenda.order_number)).toBeVisible();
  await expect(page.getByText(/Kz 10[\s. ]?500(,00)?/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('e-commerce-cart'))).toBe('[]');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Carrinho com 0 itens' })).toBeVisible();

  // 6. Acompanhar a encomenda sem copiar o número nem o email.
  await page.getByRole('link', { name: 'Acompanhar a encomenda' }).click();
  await expect(page).toHaveURL(/\/track/);
  await expect(page.getByText(encomenda.order_number, { exact: true })).toBeVisible();
  await expect(page.getByText(CLIENTE.nome)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Estado da entrega' })).toBeVisible();
  // Ainda não saiu da loja: não há nada para confirmar.
  await expect(page.getByText('Confirmar recepção da encomenda')).toHaveCount(0);

  // 7. A equipa despacha; quem recebe confirma com o nome e a assinatura.
  encomenda.delivery_status = 'out_for_delivery';
  await page.getByRole('button', { name: 'Rastrear' }).click();
  const recepcao = page.locator('form', { hasText: 'Confirmar recepção da encomenda' });
  await expect(recepcao).toBeVisible();
  await assinar(page, recepcao.locator('canvas'));
  await recepcao.getByRole('button', { name: 'Confirmar e assinar recepção' }).click();
  await expect(page.getByText('Recepção confirmada pelo comprador').first()).toBeVisible();
  // Quem acabou de confirmar vê a assinatura que deixou.
  await expect(page.getByRole('img', { name: 'Assinatura' })).toBeVisible();
  expect(loja.pedidosConfirmacao).toHaveLength(1);
  expect(loja.pedidosConfirmacao[0]).toMatchObject({
    orderNumber: encomenda.order_number, email: CLIENTE.email, recipientName: CLIENTE.nome,
  });
  expect(encomenda.delivery_status).toBe('delivered');
  expect(encomenda.delivery_signature_data).toMatch(/^data:image\/png;base64,/);
});

test('o que falta é dito junto de cada campo, e nada segue para o servidor', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();

  await expect(c.getByText('Escreva o seu nome.')).toBeVisible();
  await expect(c.getByText('O email serve para acompanhar a encomenda.')).toBeVisible();
  await expect(c.getByText('Seleccione o município de entrega.')).toBeVisible();
  await expect(c.getByLabel('Nome completo *')).toBeFocused();

  // Um email a meio é dito como tal, e o aviso do nome sai ao escrever.
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await expect(c.getByText('Escreva o seu nome.')).toHaveCount(0);
  await c.getByLabel(/^Email/).fill('maria@');
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(c.getByText('Este email parece incompleto.')).toBeVisible();

  expect(loja.pedidosCheckout).toHaveLength(0);
  expect(loja.encomendas).toHaveLength(0);
  await expect(page).toHaveURL(/\/product\/livro-caminho/);
});

test('levantamento na loja: sem morada, com a loja escolhida e o pagamento no balcão', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-conflito');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByRole('radio', { name: /Levantamento na loja/ }).click();

  // Sem morada nem assinatura; aparece a escolha da loja e o método que é só do balcão.
  await expect(c.getByText('Local de entrega em Angola')).toHaveCount(0);
  await expect(c.locator('canvas')).toHaveCount(0);
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel('Telefone *').fill(CLIENTE.telefone);

  // Esquecer a loja é o erro mais provável aqui.
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(c.getByText('Escolha a loja onde vai levantar.')).toBeVisible();
  expect(loja.pedidosCheckout).toHaveLength(0);

  // A loja mostra-se como quem vai lá a vê: fotografia, morada e horário.
  await expect(c.getByText('Seg–Qui 8h–17h30 · Sex, Dom e feriados 8h–13h')).toBeVisible();
  await c.getByRole('radio', { name: /Loja do Huambo/ }).click();
  await c.getByRole('radio', { name: /Pagar no Balcão/ }).click();
  // Sem portes: o total é o preço do livro.
  await c.getByRole('button', { name: /Confirmar Compra · Kz 12[\s. ]?000(,00)?/ }).click();

  await expect(page).toHaveURL(/\/success\?/);
  await expect(page.getByRole('heading', { level: 1, name: 'Compra Confirmada!' })).toBeVisible();
  expect(loja.pedidosCheckout[0]).toMatchObject({
    shippingMethod: 'pickup', pickupStore: 'Loja do Huambo', paymentMethodCode: 'balcao',
    customerEmail: '', phone: '+244 923 456 789', checkoutSignature: '',
  });
  expect(loja.encomendas[0]).toMatchObject({ total: 12000, shipping_cost: 0, pickup_store: 'Loja do Huambo' });
});

test('transferência: a encomenda fica registada, por pagar, com as instruções à vista', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);
  await c.getByRole('radio', { name: /Transferência bancária/ }).click();
  await expect(c.getByText(/Paga depois de confirmar/)).toBeVisible();
  // Já transferiu antes de encomendar: a referência segue como pista para a equipa.
  await c.getByLabel(/Referência do pagamento/).fill('TRF-2026-0042');
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();

  // Não é "Compra Confirmada": falta a equipa ver o dinheiro, e a página diz como se paga.
  await expect(page.getByRole('heading', { level: 1, name: 'Encomenda Registada!' })).toBeVisible();
  await expect(page.getByText('AO06 0000 0000 0000 0000 0000 0').first()).toBeVisible();
  expect(loja.pedidosCheckout[0]).toMatchObject({ paymentMethodCode: 'transferencia', paymentReference: 'TRF-2026-0042' });
  expect(loja.encomendas[0]).toMatchObject({ payment_method: 'transferencia', payment_status: 'awaiting_confirmation' });

  // O documento que se descarrega é uma nota de encomenda (recibo só depois de pago) e diz o
  // estado que o servidor devolveu, não um "Pendente" fixo.
  const [ficheiro] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Descarregar Recibo/ }).click(),
  ]);
  expect(ficheiro.suggestedFilename()).toBe(`recibo-${loja.encomendas[0].order_number}.html`);
  const nota = await readFile(await ficheiro.path(), 'utf8');
  expect(nota).toContain('Nota de encomenda');
  expect(nota).toContain('A aguardar confirmação');
  expect(nota).toContain(loja.encomendas[0].order_number);
});

test('a localização partilhada no checkout chega ao servidor, com a precisão', async ({ page, context, loja }) => {
  // Talatona, com a precisão de um telemóvel ao ar livre.
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -8.9167, longitude: 13.1833, accuracy: 12 });

  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);
  await c.getByRole('button', { name: 'Usar a minha localização' }).click();
  await expect(c.getByText(/Localização guardada/)).toBeVisible();
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();

  await expect(page).toHaveURL(/\/success\?/);
  expect(loja.pedidosCheckout[0]).toMatchObject({
    deliveryGpsLat: -8.9167, deliveryGpsLng: 13.1833, deliveryGpsAccuracy: 12,
  });
});

test('o stock acabou entretanto: o servidor recusa, a razão aparece e o carrinho fica', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-raro');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);

  // Outro cliente leva o último exemplar depois de o carrinho ter confirmado o stock e antes
  // de o servidor gravar a encomenda: é o servidor que diz não.
  loja.antesDoCheckout = () => { loja.livro('livro-raro').stock = 0; };

  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(page.getByText('Stock insuficiente para: Atlas Bíblico Ilustrado').first()).toBeVisible();
  expect(loja.encomendas).toHaveLength(0);
  // Fica onde estava, com o que escreveu: pode corrigir e tentar outra vez.
  await expect(page).toHaveURL(/\/product\/livro-raro/);
  await expect(c.getByLabel('Nome completo *')).toHaveValue(CLIENTE.nome);
  await expect(c.getByRole('button', { name: /Confirmar Compra/ })).toBeEnabled();
});

test('a rede cai depois de o servidor gravar: tentar outra vez não cria segunda encomenda', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);

  loja.avarias.push('resposta-perdida');
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(page.getByText('Não foi possível finalizar a compra').first()).toBeVisible();
  expect(loja.encomendas).toHaveLength(1);

  // A segunda tentativa leva a mesma chave, e o servidor devolve a encomenda que já existe.
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(page).toHaveURL(/\/success\?/);
  expect(loja.pedidosCheckout).toHaveLength(2);
  expect(loja.pedidosCheckout[1].idempotencyKey).toBe(loja.pedidosCheckout[0].idempotencyKey);
  expect(loja.encomendas).toHaveLength(1);
  expect(loja.livro('livro-caminho').stock).toBe(7);
  await expect(page.getByText(loja.encomendas[0].order_number)).toBeVisible();
});

test('carregar duas vezes em "Confirmar" faz uma encomenda só', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);

  await c.getByRole('button', { name: /Confirmar Compra/ }).dblclick();
  await expect(page).toHaveURL(/\/success\?/);
  expect(loja.pedidosCheckout).toHaveLength(1);
  expect(loja.encomendas).toHaveLength(1);
});

test('o rastreio não abre com o email de outra pessoa', async ({ page, loja }) => {
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(page).toHaveURL(/\/success\?/);
  const numero = loja.encomendas[0].order_number;

  await page.goto('/track');
  // O rodapé tem o seu próprio atalho de rastreio; aqui é o formulário da página.
  await page.getByRole('main').getByLabel('Número da Encomenda').fill(numero);
  const email = page.getByRole('main').getByLabel('Email usado na compra');
  await email.fill('outra.pessoa@exemplo.invalid');
  await page.getByRole('button', { name: 'Rastrear' }).click();
  await expect(page.getByText('Encomenda não encontrada. Verifique o número e o email.')).toBeVisible();
  await expect(page.getByText(CLIENTE.nome)).toHaveCount(0);

  await email.fill(CLIENTE.email);
  await page.getByRole('button', { name: 'Rastrear' }).click();
  await expect(page.getByText(CLIENTE.nome)).toBeVisible();
});

test('rastreio pelo rodapé com o email mal escrito: corrige-se na página e encontra a encomenda', async ({ page, loja }, info) => {
  test.skip(info.project.name === 'telemovel', 'o rodapé compacto do telemóvel não tem o atalho de rastreio');
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByLabel('Nome completo *').fill(CLIENTE.nome);
  await c.getByLabel(/^Email/).fill(CLIENTE.email);
  await preencherMorada(page);
  await c.getByRole('button', { name: /Confirmar Compra/ }).click();
  await expect(page).toHaveURL(/\/success\?/);
  const numero = loja.encomendas[0].order_number;

  // O atalho do rodapé leva o número e o email à página de rastreio (pelo estado da navegação).
  await page.goto('/');
  const rodape = page.getByRole('contentinfo');
  await rodape.getByLabel('Número da encomenda').fill(numero);
  await rodape.getByLabel('Email usado na compra').fill('maria.santso@exemplo.invalid');
  await rodape.getByRole('button', { name: 'Seguir' }).click();
  await expect(page).toHaveURL(/\/track$/);
  await expect(page.getByText('Encomenda não encontrada. Verifique o número e o email.')).toBeVisible();

  // Antes, o campo voltava ao email do rodapé a cada tecla e não havia forma de o corrigir.
  const email = page.getByRole('main').getByLabel('Email usado na compra');
  await email.fill(CLIENTE.email);
  await expect(email).toHaveValue(CLIENTE.email);
  await page.getByRole('main').getByRole('button', { name: 'Rastrear' }).click();
  await expect(page.getByText(CLIENTE.nome)).toBeVisible();
});

// --- Lojas: de que loja é a compra e que lojas têm o livro (migração lojas_donas_dos_dados) ---------

test('entrega: o checkout diz de que loja é a compra, pela província escolhida', async ({ page, loja }) => {
  loja.lojas.find((l) => l.id === 'loja-luanda').service_provinces = ['Luanda', 'Bengo'];
  loja.lojas.find((l) => l.id === 'loja-huambo').service_provinces = ['Huambo', 'Bié'];
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();

  await escolher(page, 'Província *', 'Bié');
  await expect(c.getByText('Compra na Loja do Huambo')).toBeVisible();
  await expect(c.getByText(/Serve Huambo e Bié: é ela que prepara e envia a sua encomenda/)).toBeVisible();
  await expect(c.getByText(/923 428 459/)).toBeVisible();

  await escolher(page, 'Província *', 'Cabinda');
  await expect(c.getByText('Ainda não há loja a servir Cabinda: a encomenda é preparada pela equipa central da Livraria.')).toBeVisible();
  await expect(c.getByText(/^Compra na /)).toHaveCount(0);
});

test('página do livro: as lojas que o têm, com as províncias que servem', async ({ page, loja }) => {
  loja.lojas.find((l) => l.id === 'loja-huambo').service_provinces = ['Huambo', 'Bié'];
  loja.disponibilidade.push(
    { store_id: 'loja-huambo', book_id: 'livro-caminho', available: true },
    { store_id: 'loja-luanda', book_id: 'livro-caminho', available: false },
  );
  await page.goto('/product/livro-caminho');
  await expect(page.getByRole('heading', { level: 1, name: 'O Caminho a Cristo' })).toBeVisible();
  const linha = page.getByText('Disponível nas lojas:').locator('xpath=..');
  await expect(linha).toContainText('Loja do Huambo (Huambo e Bié).');
  // «Não temos» nunca aparece ao cliente.
  await expect(linha).not.toContainText('Luanda');

  // Um livro que nenhuma loja marcou fica com a linha de sempre.
  await page.goto('/product/livro-conflito');
  await expect(page.getByRole('heading', { level: 1, name: 'O Grande Conflito' })).toBeVisible();
  await expect(page.getByText('Levantamento nas lojas,', { exact: true })).toBeVisible();
  await expect(page.getByText('Disponível nas lojas:')).toHaveCount(0);
});

test('levantamento: a loja que disse «não temos» não se escolhe, e diz o que falta', async ({ page, loja }) => {
  loja.disponibilidade.push(
    { store_id: 'loja-luanda', book_id: 'livro-caminho', available: false },
    { store_id: 'loja-huambo', book_id: 'livro-caminho', available: true },
  );
  await comprarLivro(page, 'livro-caminho');
  const c = carrinho(page);
  await c.getByRole('button', { name: 'Continuar para finalizar a compra' }).click();
  await c.getByRole('radio', { name: /Levantamento na loja/ }).click();

  await expect(c.getByRole('radio', { name: /Loja de Luanda/ })).toBeDisabled();
  await expect(c.getByText('Não tem: O Caminho a Cristo')).toBeVisible();
  await expect(c.getByRole('radio', { name: /Loja do Huambo/ })).toBeEnabled();
  await expect(c.getByText('Tem todos os livros')).toBeVisible();

  await c.getByRole('radio', { name: /Loja do Huambo/ }).click();
  await expect(c.getByRole('radio', { name: /Loja do Huambo/ })).toBeChecked();
});
