import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: (...a) => rpc(...a) } }));

const { default: SiteHealthTab } = await import('./SiteHealthTab');

let host;
let root;
const mount = async () => {
  await act(async () => root.render(<SiteHealthTab />));
  await act(async () => {});
};

beforeEach(() => {
  rpc.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const VITALS = [
  { page: '*', device: 'mobile', name: 'LCP', p75: 4300, median: 3100, samples: 12 },
  { page: '/', device: 'mobile', name: 'LCP', p75: 4800, median: 3500, samples: 8 },
  { page: '/', device: 'mobile', name: 'CLS', p75: 0.02, median: 0, samples: 8 },
  { page: '/product/:id', device: 'mobile', name: 'LCP', p75: 2200, median: 1900, samples: 4 },
  { page: '/', device: 'desktop', name: 'LCP', p75: 900, median: 800, samples: 3 },
];
const ERRORS = [{
  message: 'TypeError: x is undefined', occurrences: 3, pages: ['/shop'], devices: ['mobile'],
  last_seen: '2026-11-11T10:00:00Z', last_version: '2026.11.11-abc', sample: { source: '/assets/index.js', line: 1, col: 9, stack: 'at f' },
}];

describe('SiteHealthTab', () => {
  it('mostra o p75 por página no telemóvel, com a cor de cada limiar, e os erros', async () => {
    rpc.mockImplementation(async (fn) => ({ data: fn === 'site_health_vitals' ? VITALS : ERRORS, error: null }));
    await mount();
    expect(rpc).toHaveBeenCalledWith('site_health_vitals', { p_days: 7 });
    const linhas = [...host.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('th').textContent);
    expect(linhas).toEqual(['Todas as páginas', 'Página inicial/', 'Ficha de produto/product/:id']);
    const lcpInicial = host.querySelectorAll('tbody tr')[1].querySelector('td span');
    expect(lcpInicial.textContent).toContain('4,8 s');
    expect(lcpInicial.className).toContain('bg-red-50');
    expect(host.querySelectorAll('tbody tr')[2].querySelector('td span').className).toContain('bg-emerald-50');
    expect(host.textContent).toContain('TypeError: x is undefined');
    expect(host.textContent).toContain('3 vezes');
  });

  it('o computador à parte', async () => {
    rpc.mockImplementation(async (fn) => ({ data: fn === 'site_health_vitals' ? VITALS : [], error: null }));
    await mount();
    const computador = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('Computador'));
    await act(async () => computador.click());
    expect([...host.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('th').textContent)).toEqual(['Página inicial/']);
    expect(host.textContent).toContain('Nenhum erro neste período.');
  });

  it('sem a migração aplicada, diz qual falta', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.site_health_vitals' } });
    await mount();
    expect(host.textContent).toContain('20261111090000_saude_do_site');
  });
});
