// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { test as base, expect } from '@playwright/test';
import { LojaFalsa } from './lojaFalsa.js';

// O site dentro do app Android (app/mobile, docs/APPS.md), no build de produção.
//
// Finge-se o que o Capacitor injecta no WebView do Android antes de o site arrancar: o
// `window.androidBridge` (é por ele que o Capacitor sabe que está no Android) e a ponte
// `nativePromise`, que aqui só regista as chamadas. O plugin «Aparelho» declara o método
// `podePuxar`, como o AparelhoPlugin.java. Prova-se a conversa do puxar para actualizar: o site diz
// ao app quando puxar é só deslizar (MainActivity.java), e o gesto que chega não recarrega por cima
// de uma janela.

const test = base.extend({
  loja: async ({ context }, entregar) => {
    const loja = new LojaFalsa();
    await loja.ligar(context);
    await entregar(loja);
    expect(loja.telemetria.filter((e) => e.kind === 'error'), 'erros de JavaScript durante o teste').toEqual([]);
  },
});

/** O que o Capacitor põe na página do app Android antes do site arrancar. */
function dentroDoAppAndroid() {
  window.androidBridge = { postMessage() {} };
  window.__chamadasAoApp = [];
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'Aparelho', methods: [{ name: 'podePuxar', rtype: 'promise' }] }],
    nativePromise: (plugin, metodo, opcoes) => {
      window.__chamadasAoApp.push({ plugin, metodo, opcoes });
      return Promise.resolve({});
    },
  };
}

/** O último «pode puxar» que o site disse ao app. */
const ultimoPodePuxar = (page) => page.evaluate(() => {
  const ditas = window.__chamadasAoApp.filter((c) => c.plugin === 'Aparelho' && c.metodo === 'podePuxar');
  return ditas.length ? ditas[ditas.length - 1].opcoes.sim : null;
});

const carrinho = (page) => page.getByRole('dialog', { name: /Carrinho|Finalizar Compra/ });

/** Na página de um livro, «Comprar Agora» abre o carrinho (como no fluxo de compra). */
async function abrirLivro(page) {
  await page.goto('/product/livro-caminho');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
const abrirCarrinho = (page) => page.getByRole('button', { name: 'Comprar Agora' }).click();

test.describe('dentro do app Android', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(dentroDoAppAndroid);
  });

  test('o site diz ao app quando puxar é actualizar e quando é só deslizar', async ({ page, loja }) => {
    void loja;
    await abrirLivro(page);
    // Sem janela aberta, puxar no topo é actualizar.
    await expect.poll(() => ultimoPodePuxar(page)).toBe(true);

    await abrirCarrinho(page);
    await expect(carrinho(page)).toBeVisible();
    await expect.poll(() => ultimoPodePuxar(page)).toBe(false);

    await page.keyboard.press('Escape');
    await expect(carrinho(page)).toHaveCount(0);
    await expect.poll(() => ultimoPodePuxar(page)).toBe(true);
  });

  test('o puxar que chega com o carrinho aberto não recarrega; sem ele, recarrega', async ({ page, loja }) => {
    void loja;
    await abrirLivro(page);
    const puxar = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('livraria:puxar-para-actualizar')));
    await page.evaluate(() => { window.__mesmaPagina = true; });

    await abrirCarrinho(page);
    await expect(carrinho(page)).toBeVisible();
    await puxar();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__mesmaPagina === true)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(carrinho(page)).toHaveCount(0);
    await Promise.all([page.waitForEvent('load'), puxar()]);
    expect(await page.evaluate(() => window.__mesmaPagina === true)).toBe(false);
  });

  test('dentro do app não há nada para descarregar', async ({ page, loja }) => {
    void loja;
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: 'Já está a usar a app' })).toBeVisible();
    await expect(page.locator('a[data-descarregar]')).toHaveCount(0);
  });
});
