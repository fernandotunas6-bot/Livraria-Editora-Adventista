import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let accountLayout = null;
const updateUser = vi.fn(async () => ({}));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { user_metadata: accountLayout ? { painel_disposicao: accountLayout } : {} } } })),
      updateUser: (...args) => updateUser(...args),
    },
  },
}));

const { DEFAULT_ADMIN_LAYOUT, readAdminLayout, readSidebarOpen, useAdminLayout } = await import('@/hooks/useAdminLayout');

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  accountLayout = null;
  updateUser.mockClear();
});

describe('readAdminLayout', () => {
  it('por omissão os separadores; valores estranhos não contam', () => {
    expect(readAdminLayout('u1')).toBe(DEFAULT_ADMIN_LAYOUT);
    localStorage.setItem('livraria:painel:disposicao:u1', 'grelha');
    expect(readAdminLayout('u1')).toBe('tabs');
    localStorage.setItem('livraria:painel:disposicao:u1', 'sidebar');
    expect(readAdminLayout('u1')).toBe('sidebar');
  });

  it('cada pessoa no mesmo aparelho tem a sua', () => {
    localStorage.setItem('livraria:painel:disposicao:u1', 'sidebar');
    expect(readAdminLayout('u2')).toBe('tabs');
  });

  it('sem armazenamento, a de omissão', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(readAdminLayout('u1')).toBe('tabs');
  });
});

describe('readSidebarOpen', () => {
  it('aberta em ecrãs largos e recolhida nos estreitos, até a pessoa escolher', () => {
    expect(readSidebarOpen('u1', 1440)).toBe(true);
    expect(readSidebarOpen('u1', 900)).toBe(false);
    localStorage.setItem('livraria:painel:barra-aberta:u1', 'false');
    expect(readSidebarOpen('u1', 1440)).toBe(false);
    localStorage.setItem('livraria:painel:barra-aberta:u1', 'true');
    expect(readSidebarOpen('u1', 900)).toBe(true);
  });
});

describe('useAdminLayout', () => {
  it('muda e lembra a disposição e a barra aberta', () => {
    let api;
    function Probe() { api = useAdminLayout('u1'); return null; }
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    expect(api.layout).toBe('tabs');
    act(() => api.setLayout('sidebar'));
    expect(api.layout).toBe('sidebar');
    expect(localStorage.getItem('livraria:painel:disposicao:u1')).toBe('sidebar');
    expect(updateUser).toHaveBeenCalledWith({ data: { painel_disposicao: 'sidebar' } });
    act(() => api.setLayout('outra'));
    expect(api.layout).toBe('sidebar');
    const before = api.sidebarOpen;
    act(() => api.setSidebarOpen((v) => !v));
    expect(api.sidebarOpen).toBe(!before);
    expect(localStorage.getItem('livraria:painel:barra-aberta:u1')).toBe(String(!before));
    act(() => root.unmount());
  });

  it('num aparelho novo vale a escolha guardada na conta', async () => {
    accountLayout = 'sidebar';
    let api;
    function Probe() { api = useAdminLayout('u9'); return null; }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Probe />); });
    expect(api.layout).toBe('sidebar');
    expect(localStorage.getItem('livraria:painel:disposicao:u9')).toBe('sidebar');
    act(() => root.unmount());
  });

  it('outro separador mudou a disposição: acompanha', () => {
    let api;
    function Probe() { api = useAdminLayout('u1'); return null; }
    localStorage.setItem('livraria:painel:disposicao:u1', 'tabs');
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'livraria:painel:disposicao:u1', newValue: 'sidebar' })); });
    expect(api.layout).toBe('sidebar');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'livraria:painel:disposicao:u2', newValue: 'tabs' })); });
    expect(api.layout).toBe('sidebar');
    act(() => root.unmount());
  });

  it('a conta chega depois da primeira pintura: passa a valer a escolha dessa pessoa', () => {
    localStorage.setItem('livraria:painel:disposicao:u5', 'sidebar');
    let api;
    function Probe({ id }) { api = useAdminLayout(id); return null; }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe id={undefined} />));
    expect(api.layout).toBe('tabs');
    act(() => root.render(<Probe id="u5" />));
    expect(api.layout).toBe('sidebar');
    act(() => root.unmount());
  });
});
