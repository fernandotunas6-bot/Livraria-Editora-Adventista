import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__APP_VERSION__ = '2026.11.08-aaaaaaa';
const { useAppUpdate } = await import('@/hooks/useAppUpdate');
const { CHECK_INTERVAL_MS, FIRST_CHECK_MS } = await import('@/lib/appVersion');

let root;
let host;
let value;
let published = '2026.11.08-aaaaaaa';
const fetchVersion = vi.fn(async () => published);

function Probe() {
  value = useAppUpdate({ enabled: true, fetchVersion });
  return null;
}
async function mount() {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
}
const advance = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const setVisibility = (state) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

beforeEach(() => {
  vi.useFakeTimers();
  published = '2026.11.08-aaaaaaa';
  fetchVersion.mockClear();
  setVisibility('visible');
});
afterEach(() => {
  act(() => root?.unmount());
  vi.useRealTimers();
});

describe('useAppUpdate', () => {
  it('verifica uns segundos depois de abrir, não logo', async () => {
    await mount();
    expect(fetchVersion).not.toHaveBeenCalled();
    await advance(FIRST_CHECK_MS);
    expect(fetchVersion).toHaveBeenCalledTimes(1);
    expect(value).toBe('');
  });

  it('ao voltar à app (o caso do telemóvel), encontra a versão nova', async () => {
    await mount();
    await advance(FIRST_CHECK_MS);
    published = '2026.11.09-bbbbbbb';
    await advance(2 * 60_000);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    setVisibility('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(value).toBe('2026.11.09-bbbbbbb');
  });

  it('voltar várias vezes no mesmo minuto não repete o pedido', async () => {
    await mount();
    await advance(FIRST_CHECK_MS);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchVersion).toHaveBeenCalledTimes(1);
  });

  it('de 30 em 30 minutos com a app à vista; escondida, não', async () => {
    await mount();
    await advance(FIRST_CHECK_MS);
    await advance(CHECK_INTERVAL_MS);
    expect(fetchVersion).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    await advance(CHECK_INTERVAL_MS);
    expect(fetchVersion).toHaveBeenCalledTimes(2);
  });

  it('desligado (desenvolvimento), nunca pede', async () => {
    host = document.createElement('div');
    root = createRoot(host);
    function Off() { value = useAppUpdate({ enabled: false, fetchVersion }); return null; }
    await act(async () => root.render(<Off />));
    await advance(CHECK_INTERVAL_MS);
    expect(fetchVersion).not.toHaveBeenCalled();
  });
});
