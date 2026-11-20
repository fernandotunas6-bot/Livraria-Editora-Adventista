// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY_MS, readCache, writeCache } from '@/lib/localCache';

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('cache entre visitas', () => {
  it('devolve o guardado enquanto for recente', () => {
    writeCache('x', { a: 1 });
    expect(readCache('x', DAY_MS)).toEqual({ a: 1 });
  });

  it('depois do prazo, nada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    writeCache('x', { a: 1 });
    vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
    expect(readCache('x', 7 * DAY_MS)).toBeNull();
  });

  it('lixo ou nada guardado: null, sem rebentar', () => {
    localStorage.setItem('livraria:cache:y', '{não é json');
    expect(readCache('y', DAY_MS)).toBeNull();
    expect(readCache('z', DAY_MS)).toBeNull();
  });
});
