// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Os tipos de letra do sistema, num sítio só.
 *
 * O site usa dois, servidos pela própria loja (@fontsource-variable, importados em main.jsx):
 *   - Inter: o texto, os números, os botões e as tabelas;
 *   - Source Serif 4: os títulos. Uma serifa sóbria, de pouco contraste, que acompanha o texto
 *     sem chamar a atenção (a anterior, mais decorativa, está proibida em fontes.test.js).
 * Mais nenhum. As mesmas pilhas estão em index.css (@theme: --font-sans e --font-serif, que dão as
 * classes font-sans e font-serif do Tailwind) e em painel-vendas/painel.css (--font e --serif).
 *
 * Fora das páginas (canvas dos vídeos e das imagens, janelas de impressão) a fonte não vem
 * sozinha: o canvas desenha com a de recurso se a Inter ainda não carregou, e uma janela nova não
 * herda as @font-face da página. Para isso: carregarFontes() e fontesParaImpressao().
 */

/** Os nomes das famílias nas @font-face do @fontsource-variable. */
export const FAMILIA_TEXTO = 'Inter Variable';
export const FAMILIA_TITULOS = 'Source Serif 4 Variable';

export const FONTE_TEXTO = `'${FAMILIA_TEXTO}', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
export const FONTE_TITULOS = `'${FAMILIA_TITULOS}', 'Source Serif 4', Georgia, serif`;

/** A propriedade `font` do canvas, com as fontes do sistema. `titulo` usa a dos títulos. */
export const fonteCanvas = (peso, px, { titulo = false } = {}) => `${peso} ${px}px ${titulo ? FONTE_TITULOS : FONTE_TEXTO}`;

const PESOS_TEXTO = [400, 500, 600, 700, 800];
const PESOS_TITULOS = [600, 700];

/**
 * Espera que as fontes do sistema estejam prontas (para o canvas). Nunca falha nem fica à espera
 * mais de `limite` ms: sem elas o desenho sai com a fonte de recurso, mas sai.
 */
export async function carregarFontes(limite = 2500) {
  if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') return false;
  const pedidos = [
    ...PESOS_TEXTO.map((p) => document.fonts.load(`${p} 16px '${FAMILIA_TEXTO}'`)),
    ...PESOS_TITULOS.map((p) => document.fonts.load(`${p} 16px '${FAMILIA_TITULOS}'`)),
  ];
  const tempo = new Promise((ok) => { setTimeout(() => ok(false), limite); });
  try {
    return await Promise.race([Promise.all(pedidos).then(() => true), tempo]);
  } catch {
    return false;
  }
}

/** Os url(...) de um bloco de CSS, resolvidos a partir de `base` (uma janela nova não tem a base da folha). */
export function urlsAbsolutos(css, base) {
  return String(css).replace(/url\((["']?)([^)"']+)\1\)/g, (m, q, u) => {
    try { return `url("${new URL(u, base).href}")`; } catch { return m; }
  });
}

/**
 * As regras @font-face da Inter e da Source Serif 4 desta página, com os URLs absolutos, para pôr no
 * <style> de uma janela de impressão (guias, extractos, recibos, relatórios em PDF). '' se não
 * houver (testes, folhas de outro domínio).
 */
export function fontesParaImpressao() {
  if (typeof document === 'undefined') return '';
  const regras = [];
  for (const folha of Array.from(document.styleSheets || [])) {
    let lista;
    try { lista = folha.cssRules; } catch { continue; } // folha de outro domínio
    const base = folha.href || document.baseURI;
    const ver = (rs) => {
      for (const r of Array.from(rs || [])) {
        if (r.cssRules && r.type !== 5) ver(r.cssRules); // @media, @supports, @layer
        if (r.type !== 5 && !(r.constructor && r.constructor.name === 'CSSFontFaceRule')) continue;
        const familia = String(r.style?.getPropertyValue('font-family') || '').replace(/["']/g, '').trim();
        if (familia !== FAMILIA_TEXTO && familia !== FAMILIA_TITULOS) continue;
        regras.push(urlsAbsolutos(r.cssText, base));
      }
    };
    ver(lista);
  }
  return regras.join('\n');
}

/** O CSS base de uma janela de impressão: as @font-face e o corpo em Inter. */
export function estiloBaseImpressao() {
  return `${fontesParaImpressao()}\nbody{font-family:${FONTE_TEXTO}}h1,h2,h3{font-family:${FONTE_TITULOS}}`;
}
