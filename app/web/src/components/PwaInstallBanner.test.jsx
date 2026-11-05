import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: { pwa_enabled: true, site_name: 'Livraria' } }) }));
const { default: PwaInstallBanner } = await import('./PwaInstallBanner');

let root;
let host;
let scrollY = 0;
async function mount(path) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><PwaInstallBanner /></MemoryRouter>));
  const prompt = new Event('beforeinstallprompt');
  prompt.prompt = vi.fn();
  prompt.userChoice = Promise.resolve({ outcome: 'dismissed' });
  await act(async () => { window.dispatchEvent(prompt); });
}
const scroll = async (y) => {
  scrollY = y;
  await act(async () => { window.dispatchEvent(new Event('scroll')); });
};
const banner = () => document.querySelector('[aria-label="Instalar a aplicação"]');

beforeEach(() => {
  localStorage.clear();
  scrollY = 0;
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.innerWidth = 390;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.documentElement.style.removeProperty('--aviso-instalar');
});

describe('PwaInstallBanner', () => {
  it('não aparece mal a página abre; aparece depois de deslizar, e afasta o chat', async () => {
    await mount('/shop');
    expect(banner()).toBeNull();
    await scroll(700);
    expect(banner()).not.toBeNull();
    expect(document.documentElement.style.getPropertyValue('--aviso-instalar')).toMatch(/px$/);
    expect(document.querySelector('[aria-label="Fechar o aviso de instalação"]')).not.toBeNull();
  });

  it('nunca na ficha do livro, mesmo depois de deslizar', async () => {
    await mount('/product/abc');
    await scroll(2000);
    expect(banner()).toBeNull();
  });

  it('fechar guarda a escolha e tira o afastamento', async () => {
    await mount('/');
    await scroll(700);
    await act(async () => document.querySelector('[aria-label="Fechar o aviso de instalação"]').click());
    expect(banner()).toBeNull();
    expect(localStorage.getItem('pwa-dismissed')).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--aviso-instalar')).toBe('0px');
  });
});
