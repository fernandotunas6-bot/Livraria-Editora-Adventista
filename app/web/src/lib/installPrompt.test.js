// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { HOME_TOP_PX, installPromptAllowed, installPromptCoversHero, installPromptOffsets } from './installPrompt';

describe('installPromptCoversHero', () => {
  it('só no topo da página inicial', () => {
    expect(installPromptCoversHero('/', 0)).toBe(true);
    expect(installPromptCoversHero('/', HOME_TOP_PX - 1)).toBe(true);
    expect(installPromptCoversHero('/', HOME_TOP_PX)).toBe(false);
    expect(installPromptCoversHero('/shop', 0)).toBe(false);
    expect(installPromptCoversHero('/colecoes', 0)).toBe(false);
  });
});

describe('installPromptAllowed', () => {
  it('nunca na ficha do livro, no fim da compra nem nos ecrãs de tarefa', () => {
    for (const p of ['/product/x', '/success', '/admin', '/login', '/reset-password']) expect(installPromptAllowed(p), p).toBe(false);
    for (const p of ['/', '/shop', '/colecoes', '/about', '/track']) expect(installPromptAllowed(p), p).toBe(true);
  });
});

describe('installPromptOffsets', () => {
  it('no telemóvel afasta os dois cantos; no desktop só o direito', () => {
    expect(installPromptOffsets(72, 390)).toEqual({ full: '72px', right: '0px' });
    expect(installPromptOffsets(96, 1366)).toEqual({ full: '0px', right: '96px' });
    expect(installPromptOffsets(0, 390)).toEqual({ full: '0px', right: '0px' });
  });
});
