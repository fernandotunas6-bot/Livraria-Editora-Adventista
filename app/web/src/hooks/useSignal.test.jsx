import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Os sinais chegam por aqui: o teste dispara-os à mão.
let emit = null;
vi.mock('@/lib/realtimeSignals', () => ({
  subscribeSignal: (_topic, _events, fn) => { emit = fn; return () => { emit = null; }; },
  signalStatus: () => 'connected',
  onSignalStatus: () => () => {},
}));
const { useSignal } = await import('./useSignal');

let host;
let root;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

function Ouvinte({ cb }) {
  useSignal('painel', ['orders', 'catalogo'], cb);
  return null;
}

describe('useSignal', () => {
  it('uma rajada dá uma só chamada, com o último sinal e todos os da rajada', () => {
    const cb = vi.fn();
    act(() => root.render(<Ouvinte cb={cb} />));
    // Uma encomenda nova: o stock desce («catalogo») e a encomenda entra («orders»), quase juntos.
    act(() => { emit('catalogo', {}); emit('orders', { id: 'e1' }); });
    expect(cb).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(300); });
    expect(cb).toHaveBeenCalledTimes(1);
    const [event, payload, signals] = cb.mock.calls[0];
    expect(event).toBe('orders');
    expect(payload).toEqual({ id: 'e1' });
    expect(signals.map((s) => s.event)).toEqual(['catalogo', 'orders']);
  });

  it('a rajada seguinte começa vazia', () => {
    const cb = vi.fn();
    act(() => root.render(<Ouvinte cb={cb} />));
    act(() => { emit('orders', {}); vi.advanceTimersByTime(300); });
    act(() => { emit('catalogo', {}); vi.advanceTimersByTime(300); });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][2].map((s) => s.event)).toEqual(['catalogo']);
  });
});
