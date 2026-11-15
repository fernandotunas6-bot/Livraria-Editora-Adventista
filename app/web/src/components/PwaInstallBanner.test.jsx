import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: { pwa_enabled: true, site_name: 'Livraria' } }) }));
const { default: PwaInstallBanner } = await import('./PwaInstallBanner');
const { ENGAGE_AFTER_MS, HOME_TOP_PX } = await import('@/lib/installPrompt');

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

  it('no topo da página inicial espera, mesmo passado o tempo, e sai quando se volta ao topo', async () => {
    vi.useFakeTimers();
    try {
      await mount('/');
      await act(async () => { vi.advanceTimersByTime(ENGAGE_AFTER_MS + 1000); });
      // Passou o tempo, mas o banner de destaques está à vista: o chat subia para cima da seta.
      expect(banner()).toBeNull();
      expect(document.documentElement.style.getPropertyValue('--aviso-instalar')).toBe('0px');
      await scroll(HOME_TOP_PX + 40);
      expect(banner()).not.toBeNull();
      await scroll(0);
      expect(banner()).toBeNull();
      expect(document.documentElement.style.getPropertyValue('--aviso-instalar')).toBe('0px');
    } finally {
      vi.useRealTimers();
    }
  });

  it('noutras páginas, o tempo chega', async () => {
    vi.useFakeTimers();
    try {
      await mount('/shop');
      await act(async () => { vi.advanceTimersByTime(ENGAGE_AFTER_MS + 1000); });
      expect(banner()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fechar guarda a escolha e tira o afastamento', async () => {
    await mount('/');
    await scroll(700);
    await act(async () => document.querySelector('[aria-label="Fechar o aviso de instalação"]').click());
    expect(banner()).toBeNull();
    // Adiado, não para sempre: guarda quando foi fechado.
    expect(Number(localStorage.getItem('pwa-dismissed'))).toBeGreaterThan(1e12);
    expect(document.documentElement.style.getPropertyValue('--aviso-instalar')).toBe('0px');
  });

  it('fechado há mais de 14 dias (ou com o valor antigo «1»), volta a aparecer', async () => {
    localStorage.setItem('pwa-dismissed', String(Date.now() - 15 * 86_400_000));
    await mount('/shop');
    await scroll(700);
    expect(banner()).not.toBeNull();
    act(() => root.unmount()); host.remove();
    localStorage.setItem('pwa-dismissed', '1');
    await mount('/shop');
    await scroll(700);
    expect(banner()).not.toBeNull();
  });

  it('fechado há pouco, não aparece', async () => {
    localStorage.setItem('pwa-dismissed', String(Date.now() - 86_400_000));
    await mount('/shop');
    await scroll(700);
    expect(banner()).toBeNull();
  });
});
