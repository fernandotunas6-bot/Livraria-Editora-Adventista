// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Capturas de ecrã para as fichas da App Store e da Play Store (docs/APPS.md):
//
//   node scripts/capturas-app-store.mjs [--site https://livrariaadventista.ao] [--saida dist/capturas]
//
// Abre o site como o app o abre (o `window.Capacitor` da casca: sem «Instalar a app», sem venda
// de edições digitais) nos tamanhos que cada loja pede, e guarda as imagens onde o fastlane as
// procura:
//   · <saida>/ios/pt-PT/ (fastlane deliver):
//       iPhone 6,9" — 1320 × 2868 (440 × 956 pontos, ×3), obrigatório;
//       iPad 13"    — 2064 × 2752 (1032 × 1376 pontos, ×2), porque o app também corre no iPad;
//   · <saida>/android/pt-PT/images/phoneScreenshots/ (fastlane supply):
//       telemóvel Android — 1080 × 1920 (360 × 640, ×3), 9:16 como a Play Store aceita.
//
// Corre no GitHub Actions (.github/workflows/ios-ficha.yml), com o catálogo verdadeiro. Para o
// testar sem rede: `--loja-falsa` usa a loja em memória dos testes de ponta a ponta
// (app/web/e2e/lojaFalsa.js) e o site construído para eles (vite preview em `--site`).

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Os aparelhos de cada loja: nome no ficheiro, pontos e escala. */
export const APARELHOS = [
  { loja: 'apple', nome: 'iPhone-6.9', largura: 440, altura: 956, escala: 3 },
  { loja: 'apple', nome: 'iPad-13', largura: 1032, altura: 1376, escala: 2 },
  { loja: 'google', nome: 'Android', largura: 360, altura: 640, escala: 3 },
];

const UA = {
  apple: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LivrariaAdventistaApp/1 (iOS)',
  google: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 LivrariaAdventistaApp/1 (Android)',
};

/** Onde fica cada captura (relativo a `--saida`). */
export const pastaDaLoja = (aparelho) => (aparelho.loja === 'apple'
  ? path.join('ios', 'pt-PT')
  : path.join('android', 'pt-PT', 'images', 'phoneScreenshots'));

/**
 * As páginas, pela ordem em que aparecem na App Store. `produto` é a ficha do primeiro livro do
 * catálogo (o endereço só se sabe depois de abrir a loja).
 */
export const PAGINAS = [
  { id: '01-inicio', caminho: '/' },
  { id: '02-loja', caminho: '/shop' },
  { id: '03-livro', caminho: 'produto' },
  { id: '04-colecoes', caminho: '/colecoes' },
  { id: '05-comunidade', caminho: '/comunidade' },
  { id: '06-rastreio', caminho: '/track' },
  { id: '07-lojas', caminho: '/lojas' },
];

/** O nome do ficheiro: o fastlane ordena pelo nome e reconhece o aparelho pelo tamanho. */
export const nomeDaCaptura = (aparelho, pagina) => `${aparelho.nome}-${pagina.id}.png`;

/** O tamanho em píxeis de cada captura (o que a App Store confere). */
export const pixeis = (a) => ({ largura: a.largura * a.escala, altura: a.altura * a.escala });

/** O que a casca do app põe na página antes de o site arrancar (sem ponte do outro lado). */
function dentroDoApp(plataforma) {
  if (plataforma === 'ios') window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  else window.androidBridge = { postMessage() {} };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => plataforma };
}

function argumentos(argv) {
  const ler = (nome, omissao) => {
    const i = argv.indexOf(nome);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : omissao;
  };
  return {
    site: ler('--site', 'https://livrariaadventista.ao').replace(/\/$/, ''),
    saida: ler('--saida', 'dist/capturas'),
    lojaFalsa: argv.includes('--loja-falsa'),
  };
}

async function main() {
  const { site, saida, lojaFalsa } = argumentos(process.argv.slice(2));
  const { chromium } = await import('@playwright/test');

  const browser = await chromium.launch();
  let caminhoDoLivro = '';
  let total = 0;
  try {
    for (const aparelho of APARELHOS) {
      const context = await browser.newContext({
        viewport: { width: aparelho.largura, height: aparelho.altura },
        deviceScaleFactor: aparelho.escala,
        isMobile: true,
        hasTouch: true,
        locale: 'pt-AO',
        timezoneId: 'Africa/Luanda',
        serviceWorkers: 'block',
        userAgent: UA[aparelho.loja],
      });
      const pasta = path.join(saida, pastaDaLoja(aparelho));
      mkdirSync(pasta, { recursive: true });
      if (lojaFalsa) {
        const { LojaFalsa } = await import('../app/web/e2e/lojaFalsa.js');
        await new LojaFalsa().ligar(context);
      }
      await context.addInitScript(dentroDoApp, aparelho.loja === 'apple' ? 'ios' : 'android');
      const page = await context.newPage();

      for (const pagina of PAGINAS) {
        let destino = pagina.caminho;
        if (destino === 'produto') {
          if (!caminhoDoLivro) {
            await page.goto(`${site}/shop`, { waitUntil: 'networkidle', timeout: 60_000 });
            caminhoDoLivro = await page.locator('a[href*="/product/"]').first().getAttribute('href', { timeout: 15_000 }).catch(() => '');
          }
          if (!caminhoDoLivro) { console.warn('capturas: sem livros na loja, fica sem a ficha do livro'); continue; }
          destino = new URL(caminhoDoLivro, site).pathname;
        }
        await page.goto(`${site}${destino}`, { waitUntil: 'networkidle', timeout: 60_000 });
        // As imagens a carregar devagar e as animações de entrada: espera-se que assentem.
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.scrollTo(0, 0));
        const ficheiro = path.join(pasta, nomeDaCaptura(aparelho, pagina));
        await page.screenshot({ path: ficheiro });
        total += 1;
        console.log(`capturas: ${ficheiro}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`capturas: ${total} imagens em ${saida}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
