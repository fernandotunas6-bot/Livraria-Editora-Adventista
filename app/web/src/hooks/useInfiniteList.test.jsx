// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextCount, useInfiniteList } from './useInfiniteList';
import { readPlace, savePlace } from './useScrollMemory';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('nextCount', () => {
  it('cresce um lote de cada vez e pára no total', () => {
    expect(nextCount(24, 24, 102)).toBe(48);
    expect(nextCount(96, 24, 102)).toBe(102);
    expect(nextCount(102, 24, 102)).toBe(102);
    expect(nextCount(0, 0, 5)).toBe(1);
  });
});

describe('useInfiniteList', () => {
  let observers;
  let root;
  let host;
  let api;
  beforeEach(() => {
    observers = [];
    globalThis.IntersectionObserver = class {
      constructor(cb, opts) { this.cb = cb; this.opts = opts; observers.push(this); }
      observe() {}
      disconnect() { this.off = true; }
    };
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    delete globalThis.IntersectionObserver;
  });

  function Probe(props) {
    api = useInfiniteList(props);
    return <div ref={api.sentinelRef} />;
  }
  const mount = (props) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Probe {...props} />));
  };
  const rerender = (props) => act(() => root.render(<Probe {...props} />));
  const fire = () => act(() => observers.filter((o) => !o.off).at(-1).cb([{ isIntersecting: true }]));

  it('começa com um lote, cresce quando o marcador se aproxima e pára no fim', () => {
    mount({ total: 50, batch: 24 });
    expect(api.count).toBe(24);
    expect(observers.at(-1).opts.rootMargin).toBe('600px 0px');
    fire();
    expect(api.count).toBe(48);
    fire();
    expect(api.count).toBe(50);
    expect(api.hasMore).toBe(false);
  });

  it('mudar os filtros volta ao primeiro lote', () => {
    mount({ total: 100, batch: 24, resetKey: 'a' });
    fire();
    expect(api.count).toBe(48);
    rerender({ total: 100, batch: 24, resetKey: 'b' });
    expect(api.count).toBe(24);
  });

  it('desligado (desktop) não observa nada', () => {
    mount({ total: 100, batch: 24, enabled: false });
    expect(observers).toHaveLength(0);
  });

  it('repõe a quantidade guardada ao voltar atrás', () => {
    mount({ total: 100, batch: 24, initialCount: 72 });
    expect(api.count).toBe(72);
  });

  it('o botão "Mostrar mais" faz o mesmo que o deslize', () => {
    mount({ total: 30, batch: 24 });
    act(() => api.loadMore());
    expect(api.count).toBe(30);
  });
});

describe('lugar guardado', () => {
  beforeEach(() => sessionStorage.clear());
  it('guarda e lê por chave, e esquece depois de 30 minutos', () => {
    savePlace('/shop?search=fé', { count: 72, y: 1800 }, 1000);
    expect(readPlace('/shop?search=fé', 2000)).toMatchObject({ count: 72, y: 1800 });
    expect(readPlace('/shop?search=outro', 2000)).toBeNull();
    expect(readPlace('/shop?search=fé', 1000 + 31 * 60 * 1000)).toBeNull();
  });
  it('não rebenta com lixo no armazenamento', () => {
    sessionStorage.setItem('livraria:lugar:/x', '{nao é json');
    expect(readPlace('/x')).toBeNull();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('cheio'); });
    expect(() => savePlace('/x', { y: 1 })).not.toThrow();
  });
});
