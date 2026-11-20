// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { test as base, expect } from '@playwright/test';
import { LojaFalsa } from './lojaFalsa.js';

// A página /app («Descarregar a app», docs/APPS.md), no build de produção: os botões levam para
// onde as Configurações do painel dizem, e dentro dos apps não há nada para descarregar.

const APK = 'https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista/releases/latest/download/livraria-adventista.apk';
const TESTFLIGHT = 'https://testflight.apple.com/join/AbCd1234';

const test = base.extend({
  loja: async ({ context }, entregar) => {
    const loja = new LojaFalsa();
    await loja.ligar(context);
    await entregar(loja);
    expect(loja.telemetria.filter((e) => e.kind === 'error'), 'erros de JavaScript durante o teste').toEqual([]);
  },
});

test('com as ligações das Configurações: o APK para Android e o TestFlight para iPhone', async ({ page, loja }) => {
  Object.assign(loja.definicoes, { app_android_url: APK, app_ios_url: TESTFLIGHT });
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 1, name: 'Descarregar a app' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Descarregar para Android' })).toHaveAttribute('href', APK);
  await expect(page.getByRole('link', { name: 'Experimentar no TestFlight' })).toHaveAttribute('href', TESTFLIGHT);
  await expect(page.getByText('autorizar a instalação')).toBeVisible();
});

test('sem ligações, as apps estão a chegar e ninguém é mandado para fora', async ({ page, loja }) => {
  void loja;
  await page.goto('/descarregar');
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText('A app para Android está a chegar.')).toBeVisible();
  await expect(page.getByText('A app para iPhone e iPad está a chegar à App Store.')).toBeVisible();
  await expect(page.locator('a[data-descarregar]')).toHaveCount(0);
});

test('dentro do app só diz que já a tem', async ({ page, loja }) => {
  Object.assign(loja.definicoes, { app_android_url: APK, app_ios_url: TESTFLIGHT });
  await page.addInitScript(() => {
    window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  });
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Já está a usar a app' })).toBeVisible();
  await expect(page.locator('a[data-descarregar]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Descarregar a app' })).toHaveCount(0);
});
