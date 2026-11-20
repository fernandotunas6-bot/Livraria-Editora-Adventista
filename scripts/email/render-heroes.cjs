// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Gera as imagens do topo dos emails (1200×520) a partir dos banners da galeria da loja.
// Uso: node scripts/email/render-heroes.cjs <pasta-de-saída>
// Depois, enviar os JPEG para o bucket público `media` em `email/` (ver EMAIL_HEROES em emailLayout.ts).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const GALERIA = path.join(__dirname, '../../app/web/public/images/site/opcoes');
// [nome, imagem da galeria, x, y, largura do recorte] em píxeis da imagem original (2880×820).
const HEROES = [
  ['hero-encomenda', 'loja-leque.webp', 1250, 60, 1600],
  ['hero-conta', 'loja-ellen-white.webp', 1240, 60, 1600],
  ['hero-mensagem', 'loja-doutrina.webp', 1250, 60, 1600],
];
const W = 1200;
const H = 520;

(async () => {
  const out = process.argv[2] || '.';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [name, file, x, y, w] of HEROES) {
    const s = W / w;
    const data = 'data:image/webp;base64,' + fs.readFileSync(path.join(GALERIA, file)).toString('base64');
    await page.setContent(`<body style="margin:0"><div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#0b1426">
      <img id="i" style="position:absolute;left:${-x * s}px;top:${-y * s}px;transform-origin:0 0;transform:scale(${s})">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse 70% 90% at 50% 50%,rgba(11,20,38,0) 55%,rgba(11,20,38,.6) 100%)"></div>
    </div></body>`);
    await page.$eval('#i', (e, d) => new Promise((r) => { e.onload = r; e.src = d; }), data);
    const file2 = path.join(out, `${name}.jpg`);
    await page.screenshot({ path: file2, type: "jpeg", quality: 84 });
    console.log('Escrito', file2);
  }
  await browser.close();
})();
