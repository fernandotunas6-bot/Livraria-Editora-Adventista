import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FONTE_TEXTO, FONTE_TITULOS, estiloBaseImpressao, fonteCanvas, fontesParaImpressao, urlsAbsolutos } from './fontes';

const SRC = path.resolve(__dirname, '..');

function ficheiros(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheiros(p);
    return /\.(js|jsx|css|html)$/.test(n) && !/\.test\.(js|jsx)$/.test(n) ? [p] : [];
  });
}

describe('fontes do sistema', () => {
  it('canvas e impressão usam a Inter e a Fraunces', () => {
    expect(fonteCanvas(700, 30)).toBe(`700 30px ${FONTE_TEXTO}`);
    expect(fonteCanvas(600, 20, { titulo: true })).toBe(`600 20px ${FONTE_TITULOS}`);
    expect(FONTE_TEXTO).toMatch(/^'Inter Variable'/);
    expect(FONTE_TITULOS).toMatch(/^'Fraunces Variable'/);
    expect(estiloBaseImpressao()).toContain(`body{font-family:${FONTE_TEXTO}}`);
  });

  describe('fontesParaImpressao', () => {
    let estilo;
    afterEach(() => { estilo?.remove(); estilo = null; });

    it('copia as @font-face da Inter e da Fraunces, e mais nenhuma', () => {
      estilo = document.createElement('style');
      estilo.textContent = `
        @font-face { font-family: 'Inter Variable'; src: url(/assets/inter.woff2) format('woff2'); }
        @font-face { font-family: 'Fraunces Variable'; src: url(/assets/fraunces.woff2) format('woff2'); }
        @font-face { font-family: 'Outra'; src: url(/assets/outra.woff2); }`;
      document.head.appendChild(estilo);
      const css = fontesParaImpressao();
      expect(css).toContain('Inter Variable');
      expect(css).toContain('Fraunces Variable');
      expect(css).not.toContain('Outra');
    });

    it('resolve os URLs a partir da folha (o jsdom não guarda o src, por isso testa-se à parte)', () => {
      const css = "@font-face { font-family: 'Inter Variable'; src: url(/assets/inter.woff2) format('woff2'), url('./files/i.woff') }";
      expect(urlsAbsolutos(css, 'https://livrariaadventista.com/assets/index.css')).toBe(
        "@font-face { font-family: 'Inter Variable'; src: url(\"https://livrariaadventista.com/assets/inter.woff2\") format('woff2'), url(\"https://livrariaadventista.com/assets/files/i.woff\") }",
      );
      expect(urlsAbsolutos('src: url(data:font/woff2;base64,AAA)', 'https://x.com/')).toBe('src: url("data:font/woff2;base64,AAA")');
    });
  });

  // Uma fonte avulsa num componente desfaz a coerência: o painel de relatórios usou Manrope e Lora
  // do Google Fonts, e font-serif dava Georgia. Tudo passa por index.css, painel.css ou fontes.js.
  it('nenhum ficheiro de src usa outra família de letra', () => {
    const PROIBIDAS = /\b(Manrope|Lora|Roboto|Montserrat|Poppins|Open Sans|Lato|Playfair|Merriweather|Nunito|Raleway|Oswald)\b/;
    const PERMITIDOS = new Set(['index.css', 'painel.css', 'fontes.js']);
    const problemas = [];
    for (const f of ficheiros(SRC)) {
      const texto = readFileSync(f, 'utf8');
      const rel = path.relative(SRC, f);
      if (PROIBIDAS.test(texto)) problemas.push(`${rel}: ${texto.match(PROIBIDAS)[0]}`);
      if (/fonts\.googleapis\.com/.test(texto)) problemas.push(`${rel}: Google Fonts`);
      if (PERMITIDOS.has(path.basename(f))) continue;
      // font-family com nomes escritos à mão (var(), inherit e monospace para códigos são livres).
      for (const m of texto.matchAll(/font-family\s*:\s*([^;}"`]+)/g)) {
        const v = m[1].trim();
        if (/^(var\(|inherit|\$\{|ui-monospace|monospace)/.test(v)) continue;
        problemas.push(`${rel}: font-family: ${v}`);
      }
      if (/fontFamily\s*:/.test(texto)) problemas.push(`${rel}: fontFamily (use as classes font-sans/font-serif)`);
    }
    expect(problemas).toEqual([]);
  });
});
