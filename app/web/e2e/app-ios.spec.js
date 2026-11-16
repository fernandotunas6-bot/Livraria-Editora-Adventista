import { test as base, expect } from '@playwright/test';
import { LojaFalsa } from './lojaFalsa.js';

// O site dentro do app iOS (app/ios, docs/APP_IOS.md), no build de produção.
//
// O app é o mesmo site num WKWebView do Capacitor. Aqui finge-se o que o Capacitor injecta antes
// de o site arrancar: o `window.Capacitor` e a ponte `webkit.messageHandlers.bridge` (sem nada do
// outro lado, por isso os plugins nunca respondem). Prova-se o que o site muda sozinho por estar
// no app — a regra da App Store para as edições digitais e o botão da Apple — e que no site
// normal nada mudou.

const test = base.extend({
  loja: async ({ context }, entregar) => {
    const loja = new LojaFalsa();
    loja.livros.push({
      ...loja.livro('livro-conflito'),
      id: 'livro-digital', book_code: 'LIV-010', title: 'Mensagens Escolhidas', price: 6000, stock: 5,
      versions: [{ label: 'Impresso', price: 6000 }, { label: 'Edição digital', format: 'PDF', price: 2500, digital: true }],
    });
    await loja.ligar(context);
    await entregar(loja);
    expect(loja.telemetria.filter((e) => e.kind === 'error'), 'erros de JavaScript durante o teste').toEqual([]);
  },
});

/** O que o Capacitor põe na página do app antes do site arrancar. */
function dentroDoApp() {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
}

const edicoes = (page) => page.getByRole('heading', { name: 'Edição', exact: true }).locator('..');

test.describe('no site', () => {
  test('a edição digital vende-se e não há botão da Apple', async ({ page, loja }) => {
    void loja;
    await page.goto('/product/livro-digital');
    await expect(page.getByRole('heading', { level: 1, name: 'Mensagens Escolhidas' })).toBeVisible();
    await expect(edicoes(page).getByRole('button', { name: 'Edição digital' })).toBeVisible();

    await page.goto('/login');
    await expect(page.getByLabel('Email').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar com a Apple' })).toHaveCount(0);
  });
});

test.describe('dentro do app iOS', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(dentroDoApp);
  });

  test('só se vende o impresso (regra 3.1.1 da App Store)', async ({ page, loja }) => {
    void loja;
    await page.goto('/product/livro-digital');
    await expect(page.getByRole('heading', { level: 1, name: 'Mensagens Escolhidas' })).toBeVisible();
    // Com uma edição só, não há escolha: fica o impresso, à venda.
    await expect(page.getByRole('button', { name: 'Edição digital' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Comprar Agora' })).toBeEnabled();
  });

  test('«Continuar com a Apple» no ecrã de entrada', async ({ page, loja }) => {
    void loja;
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continuar com a Apple' })).toBeVisible();
  });
});
