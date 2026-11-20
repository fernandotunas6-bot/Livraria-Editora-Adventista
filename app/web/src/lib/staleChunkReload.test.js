// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it, vi } from 'vitest';
import { installStaleChunkReload, shouldReload } from './staleChunkReload';

function fakeWindow({ storage = new Map(), blocked = false } = {}) {
  const listeners = {};
  return {
    reload: vi.fn(),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    fire(type) {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      listeners[type]?.(event);
      return event;
    },
    get location() { return { reload: this.reload }; },
    sessionStorage: {
      getItem: (k) => { if (blocked) throw new Error('bloqueado'); return storage.get(k) ?? null; },
      setItem: (k, v) => { if (blocked) throw new Error('bloqueado'); storage.set(k, v); },
    },
  };
}

describe('shouldReload', () => {
  it('recarrega se nunca recarregou ou se já passou mais de um minuto', () => {
    expect(shouldReload(100_000, 0)).toBe(true);
    expect(shouldReload(200_000, 100_000)).toBe(true);
  });
  it('não recarrega duas vezes no mesmo minuto', () => {
    expect(shouldReload(130_000, 100_000)).toBe(false);
  });
});

describe('installStaleChunkReload', () => {
  it('ficheiro da versão antiga em falta: recarrega uma vez e engole o erro', () => {
    const win = fakeWindow();
    installStaleChunkReload(win, () => 1_000_000);
    const event = win.fire('vite:preloadError');
    expect(win.reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('falha outra vez logo a seguir: não entra em ciclo, deixa o erro aparecer', () => {
    const storage = new Map();
    let t = 1_000_000;
    const win = fakeWindow({ storage });
    installStaleChunkReload(win, () => t);
    win.fire('vite:preloadError');
    t += 5_000;
    const second = win.fire('vite:preloadError');
    expect(win.reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it('sem sessionStorage (bloqueado), nunca recarrega sozinho', () => {
    const win = fakeWindow({ blocked: true });
    installStaleChunkReload(win, () => 1_000_000);
    const event = win.fire('vite:preloadError');
    expect(win.reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
