// KanGest e Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O contraste AA dos tokens partilhados (KANGEST ONE, fase G; packages/marca/tokens.css): cada cor de estado sobre o
// fundo do estado e sobre as superfícies dos dois lados, em claro e em escuro, chega a 4,5:1 (texto normal).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');
const bloco = (inicio) => css.slice(css.indexOf(inicio), css.indexOf('}', css.indexOf(inicio)));
const cores = (texto) => Object.fromEntries([...texto.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const claro = cores(bloco('@theme'));
const escuro = { ...claro, ...cores(bloco('.dark {')) };

const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// as superfícies de cada lado (o KanGest: src/index.css; o site: o cartão branco e o escuro)
const SUPERFICIES = { claro: ['#ffffff', '#f6f4ef'], escuro: ['#171d1b', '#1a1a1a'] };
const ESTADOS = ['ok', 'aviso', 'erro', 'info'];

describe('tokens partilhados (KANGEST ONE, G)', () => {
  it('têm os quatro estados, em claro e em escuro', () => {
    for (const e of ESTADOS) {
      for (const k of [`estado-${e}`, `estado-${e}-fundo`]) {
        expect({ k, claro: !!claro[k] }).toEqual({ k, claro: true });
        expect({ k, escuro: !!cores(bloco('.dark {'))[k] }).toEqual({ k, escuro: true });
      }
    }
  });

  for (const [modo, t] of [['claro', claro], ['escuro', escuro]]) {
    it(`contraste AA em ${modo}: o estado sobre o fundo dele e sobre as superfícies`, () => {
      for (const e of ESTADOS) {
        const fundos = [t[`estado-${e}-fundo`], ...SUPERFICIES[modo]];
        for (const f of fundos) {
          const r = contraste(t[`estado-${e}`], f);
          expect({ estado: e, modo, fundo: f, aa: r >= 4.5, r: Math.round(r * 100) / 100 }).toMatchObject({ aa: true });
        }
      }
    });
  }

  it('a conta do contraste está certa (preto sobre branco 21:1)', () => {
    expect(Math.round(contraste('#000000', '#ffffff'))).toBe(21);
  });
});
