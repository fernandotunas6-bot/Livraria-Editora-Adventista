import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeCache } from '@/lib/localCache';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let resolveFetch;
vi.mock('@/api/PlatformApi', () => ({
  fetchSiteSettings: vi.fn(() => new Promise((resolve, reject) => { resolveFetch = { resolve, reject }; })),
}));
vi.mock('@/lib/shopTheme', () => ({ applyShopTheme: vi.fn() }));

const { SiteSettingsProvider, useSiteSettings } = await import('@/hooks/useSiteSettings');

let root;
let host;
let seen;
function Probe() {
  seen = useSiteSettings();
  return null;
}
async function mount() {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(<SiteSettingsProvider><Probe /></SiteSettingsProvider>));
}
afterEach(() => { act(() => root?.unmount()); localStorage.clear(); });

describe('configurações entre visitas', () => {
  it('quem volta vê logo as da última visita, sem esperar', async () => {
    writeCache('definicoes:v1', { site_name: 'Livraria (guardada)', shop_default_sort: 'title' });
    await mount();
    expect(seen.loading).toBe(false);
    expect(seen.settings.site_name).toBe('Livraria (guardada)');
    await act(async () => resolveFetch.resolve({ site_name: 'Livraria (nova)', shop_default_sort: 'price' }));
    expect(seen.settings.site_name).toBe('Livraria (nova)');
    expect(JSON.parse(localStorage.getItem('livraria:cache:definicoes:v1')).data.site_name).toBe('Livraria (nova)');
  });

  it('na primeira visita espera; se o servidor falhar, não guarda nada', async () => {
    await mount();
    expect(seen.loading).toBe(true);
    await act(async () => resolveFetch.reject(new Error('sem rede')));
    expect(seen.loading).toBe(false);
    expect(localStorage.getItem('livraria:cache:definicoes:v1')).toBeNull();
  });
});
