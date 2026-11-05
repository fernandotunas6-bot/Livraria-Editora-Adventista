import { describe, expect, it } from 'vitest';
import { installPromptAllowed, installPromptOffsets } from './installPrompt';

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
