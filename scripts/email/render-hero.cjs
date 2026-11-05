// Renderiza a cena 3D de scripts/email/hero.html para PNG (1200×520, mostrada a 600px nos emails).
// Uso: node scripts/email/render-hero.cjs [saída.png]
// Depois, enviar o PNG para o bucket público `media` em `email/hero-luz.png` (ver EMAIL_HERO_URL).
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || 'hero-luz.png';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 520 } });
  await page.goto('file://' + path.join(__dirname, 'hero.html'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 520 } });
  await browser.close();
  console.log('Escrito', out);
})();
