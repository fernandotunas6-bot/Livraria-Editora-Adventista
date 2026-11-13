import { test as base, expect } from '@playwright/test';
import { LojaFalsa } from './lojaFalsa.js';

// A página das lojas: as fotografias que cada loja manda, e o que elas custam a descarregar.
//
// Os testes unitários provam a galeria peça a peça (`StoreGallery.test.jsx`); aqui prova-se o
// site construído, com as fotografias a serem mesmo pedidas à rede — que é onde se vê se o
// navegador desce a variante pequena ou o original.

const test = base.extend({
  loja: async ({ context }, entregar) => {
    const loja = new LojaFalsa();
    await loja.ligar(context);
    await entregar(loja);
  },
});

test('as fotografias da loja abrem em grande, com legenda e setas', async ({ page, loja }) => {
  void loja;
  await page.goto('/lojas');
  await page.getByRole('button', { name: /Loja do Huambo/ }).click();

  const galeria = page.getByRole('list', { name: 'Fotografias da Loja do Huambo' });
  await expect(galeria.getByRole('listitem')).toHaveCount(2);

  await galeria.getByRole('button', { name: 'Ver em grande: Balcão de atendimento' }).click();
  const grande = page.getByRole('dialog');
  await expect(grande).toContainText('Balcão de atendimento');
  await expect(grande).toContainText('1/2');

  await grande.getByRole('button', { name: 'Fotografia seguinte' }).click();
  await expect(grande).toContainText('A equipa da loja');
  await expect(grande).toContainText('2/2');
});

test('o rodapé só desce a fotografia da loja quando se chega lá, e em pequeno', async ({ page, loja, isMobile }) => {
  void loja;
  // No telemóvel o rodapé é o `FooterCompact`, sem fotografias nenhumas.
  test.skip(isMobile, 'o rodapé com fotografias é o do computador');

  const pedidas = [];
  page.on('request', (r) => {
    if (r.url().includes('/images/lojas/')) pedidas.push(new URL(r.url()).pathname);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await page.waitForTimeout(1000);
  // O rodapé está em todas as páginas: se não fosse `loading="lazy"`, estas fotografias eram
  // descarregadas em cada visita, mesmo por quem nunca chega ao fundo.
  expect(pedidas, 'fotografias das lojas descarregadas sem se ter chegado ao rodapé').toEqual([]);

  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect.poll(() => pedidas.length, { message: 'a fotografia da loja no rodapé' }).toBeGreaterThan(0);
  // A caixa do rodapé tem 112 px de altura: o `srcset` tem de trazer a variante de 480 px e não
  // o original de 1280 (uns 110 KB).
  expect(pedidas.every((p) => p.startsWith('/images/lojas/480/'))).toBe(true);
});
