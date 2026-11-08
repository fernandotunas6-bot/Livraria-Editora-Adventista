import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__APP_VERSION__ = '2026.11.08-aaaaaaa';

let available = '';
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => available }));
const toast = vi.fn();
toast.success = vi.fn();
vi.mock('sonner', () => ({ toast }));
let latest = null;
const latestPublishedRelease = vi.fn(async () => latest);
vi.mock('@/lib/appReleases', async (orig) => ({ ...(await orig()), latestPublishedRelease }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/dataClient', () => ({ default: {} }));

const { default: AppUpdateNotice } = await import('./AppUpdateNotice');
const { UPDATED_KEY } = await import('@/lib/appVersion');

let root;
let host;
async function mount() {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><AppUpdateNotice /></MemoryRouter>));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  available = '';
  latest = null;
  toast.mockClear();
  toast.success.mockClear();
  latestPublishedRelease.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => act(() => root?.unmount()));

describe('AppUpdateNotice', () => {
  it('com versão nova: aviso que fica até a pessoa escolher, com "Actualizar"', async () => {
    localStorage.setItem('livraria:novidades-vistas', '2026-11-01T00:00:00Z');
    available = '2026.11.09-bbbbbbb';
    await mount();
    const [title, opts] = toast.mock.calls[0];
    expect(title).toBe('Nova versão da app disponível');
    expect(opts).toMatchObject({ id: 'nova-versao', duration: Infinity, action: { label: 'Actualizar' } });
  });

  it('sem nada a dizer, nem pergunta pelas novidades', async () => {
    localStorage.setItem('livraria:novidades-vistas', '2026-11-01T00:00:00Z');
    await mount();
    expect(toast).not.toHaveBeenCalled();
    expect(latestPublishedRelease).not.toHaveBeenCalled();
  });

  it('primeira visita: o que já estava publicado não é novidade', async () => {
    latest = { id: 'r1', title: 'Novidades antigas', published_at: '2026-11-05T00:00:00Z' };
    await mount();
    expect(toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem('livraria:novidades-vistas')).toBe('2026-11-05T00:00:00Z');
  });

  it('acabou de actualizar e há novidades por ver: "App actualizada" com "Ver novidades"', async () => {
    localStorage.setItem('livraria:novidades-vistas', '2026-11-01T00:00:00Z');
    sessionStorage.setItem(UPDATED_KEY, '2026.11.07-ccccccc');
    latest = { id: 'r1', title: 'Entrar mais rápido', published_at: '2026-11-08T00:00:00Z' };
    await mount();
    const [title, opts] = toast.success.mock.calls[0];
    expect(title).toBe('App actualizada');
    expect(opts.description).toBe('Entrar mais rápido');
    expect(opts.action.label).toBe('Ver novidades');
  });

  it('acabou de actualizar sem novidades: só confirma', async () => {
    localStorage.setItem('livraria:novidades-vistas', '2026-11-08T00:00:00Z');
    sessionStorage.setItem(UPDATED_KEY, '2026.11.07-ccccccc');
    latest = { id: 'r1', title: 'Já vista', published_at: '2026-11-08T00:00:00Z' };
    await mount();
    const [, opts] = toast.success.mock.calls[0];
    expect(opts.description).toBe('Já tem a versão mais recente.');
    expect(opts.action).toBeUndefined();
  });
});
