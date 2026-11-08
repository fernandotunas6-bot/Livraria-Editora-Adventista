import { describe, expect, it } from 'vitest';
import { swipeDirection } from '@/hooks/useSwipe';

describe('swipeDirection', () => {
  it('para a esquerda é o seguinte, para a direita o anterior', () => {
    expect(swipeDirection({ x: 300, y: 100 }, { x: 200, y: 110 })).toBe(1);
    expect(swipeDirection({ x: 100, y: 100 }, { x: 220, y: 90 })).toBe(-1);
  });

  it('um toque, um gesto curto ou a descer a página não mudam de slide', () => {
    expect(swipeDirection({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(0);
    expect(swipeDirection({ x: 100, y: 100 }, { x: 130, y: 100 })).toBe(0);
    expect(swipeDirection({ x: 100, y: 100 }, { x: 160, y: 300 })).toBe(0);
    expect(swipeDirection(null, { x: 0, y: 0 })).toBe(0);
  });
});
