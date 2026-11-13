import { defineConfig, devices } from '@playwright/test';
import { SUPABASE_FALSO } from './e2e/lojaFalsa.js';

// Testes de ponta a ponta do fluxo de compra, num navegador a sério (ver e2e/README.md).
//
// O site que se testa é o build de produção, servido pelo `vite preview`, e não o servidor de
// desenvolvimento: é o mesmo JavaScript que vai para o Cloudflare, com os blocos divididos como
// lá. O Supabase é falso — um endereço que não existe (`.invalid` nunca resolve), respondido
// na rede pelo `e2e/lojaFalsa.js`. Nenhum teste toca a base de dados de produção, e não são
// precisos segredos: corre igual no CI e em qualquer máquina.
//
// O build vai para `dist/e2e`, à parte do `dist/app/web` que o deploy publica: um build com o
// Supabase falso nunca fica no sítio de onde o `npm run deploy:site` lê.
const PORTA = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORTA}`,
    // O service worker responde a pedidos por conta própria, fora do alcance da loja falsa.
    serviceWorkers: 'block',
    locale: 'pt-AO',
    timezoneId: 'Africa/Luanda',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'] } },
    // A maior parte das visitas vem de telemóveis: o carrinho tem aí outro arranjo (o resumo
    // recolhido, a barra de compra fixa), e é onde um botão tapado mais custa.
    { name: 'telemovel', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `vite build --outDir ../../dist/e2e --logLevel warn && vite preview --outDir ../../dist/e2e --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    // As variáveis do processo ganham ao `app/web/.env`: mesmo com o ficheiro local a apontar
    // para produção, este build só conhece o Supabase falso.
    env: {
      VITE_SUPABASE_URL: SUPABASE_FALSO,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_apenas_para_e2e',
    },
  },
});
