// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sinceLabel, useAutoRefresh } from '@/hooks/useAutoRefresh';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let api;
let root;
function Probe({ refresh, enabled = true }) {
  api = useAutoRefresh(refresh, { intervalMs: 60_000, enabled });
  return null;
}
const mount = (props) => {
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe {...props} />));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => root?.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAutoRefresh', () => {
  it('actualiza de minuto a minuto com a página à vista, e não quando está escondida', async () => {
    const refresh = vi.fn(async () => {});
    mount({ refresh });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(api.lastSync).not.toBeNull();
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    vis.mockRestore();
  });

  it('ao voltar ao separador actualiza se já passou algum tempo', async () => {
    const refresh = vi.fn(async () => {});
    mount({ refresh });
    act(() => api.markSynced());
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('um pedido de cada vez; sem rede diz que não há', async () => {
    let release;
    const refresh = vi.fn(() => new Promise((r) => { release = r; }));
    mount({ refresh });
    act(() => { api.refreshNow(); api.refreshNow(); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(api.syncing).toBe(true);
    await act(async () => { release(); });
    expect(api.syncing).toBe(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(api.online).toBe(false);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(api.online).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('um erro não pára as actualizações seguintes', async () => {
    const refresh = vi.fn(async () => { throw new Error('rede'); });
    mount({ refresh });
    await act(async () => { await api.refreshNow(); });
    expect(api.lastSync).toBeNull();
    expect(api.syncing).toBe(false);
  });

  it('desligado, não actualiza sozinho', async () => {
    const refresh = vi.fn(async () => {});
    mount({ refresh, enabled: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('sinceLabel', () => {
  it('diz quanto tempo passou', () => {
    expect(sinceLabel(null)).toBe('');
    expect(sinceLabel(1_000, 20_000)).toBe('agora');
    expect(sinceLabel(0, 3 * 60_000)).toBe('há 3 min');
    expect(sinceLabel(0, 2 * 3_600_000)).toBe('há 2 h');
  });
});
