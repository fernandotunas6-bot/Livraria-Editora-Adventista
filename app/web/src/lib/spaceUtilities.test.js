// Guarda da migração para o Tailwind 4: cada `space-y-*`/`space-x-*` usado no site tem de ter, no
// index.css, a regra que repõe o comportamento do Tailwind 3 (ver o comentário lá). Sem ela, um
// rótulo seguido de um campo dentro de um `space-y-*` perde o espaço entre os dois.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const css = readFileSync(path.join(SRC, 'index.css'), 'utf8');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

const used = new Set();
for (const file of files(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?<![\w-])((?:[a-z0-9]+:)*)(space-[xy]-(?:[0-9.]+|px))(?![\w./-])/g)) used.add(m[1] + m[2]);
}

describe('space-x/space-y como no Tailwind 3', () => {
  it('o site usa pelo menos as classes conhecidas (o scanner funciona)', () => {
    expect(used.has('space-y-2')).toBe(true);
  });

  it.each([...used].sort())('%s tem a regra de compatibilidade no index.css', (cls) => {
    const selector = `.${cls.replace(/[.:]/g, (c) => `\\${c}`)} > :not([hidden]) ~ :not([hidden])`;
    expect(css.includes(selector), `falta a regra para ${cls} no index.css`).toBe(true);
    const reset = `:where(.${cls.replace(/[.:]/g, (c) => `\\${c}`)} > :not(:last-child))`;
    expect(css.includes(reset), `falta anular a regra do Tailwind 4 para ${cls}`).toBe(true);
  });
});
