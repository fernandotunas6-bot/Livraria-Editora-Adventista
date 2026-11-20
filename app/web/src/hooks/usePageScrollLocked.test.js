// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it } from 'vitest';
import { isPageScrollLocked } from '@/hooks/usePageScrollLocked';

afterEach(() => {
  document.body.removeAttribute('data-scroll-locked');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

describe('isPageScrollLocked', () => {
  it('livre por omissão', () => {
    expect(isPageScrollLocked()).toBe(false);
  });

  it('presa por um painel do Radix ou uma folha do vaul', () => {
    document.body.setAttribute('data-scroll-locked', '1');
    expect(isPageScrollLocked()).toBe(true);
  });

  it('presa pelo chat, pelo menu ou pelo carrinho (overflow hidden)', () => {
    document.body.style.overflow = 'hidden';
    expect(isPageScrollLocked()).toBe(true);
    document.body.style.overflow = '';
    document.documentElement.style.overflow = 'hidden';
    expect(isPageScrollLocked()).toBe(true);
  });

  it('sem documento, não está presa', () => {
    expect(isPageScrollLocked(null)).toBe(false);
  });
});
