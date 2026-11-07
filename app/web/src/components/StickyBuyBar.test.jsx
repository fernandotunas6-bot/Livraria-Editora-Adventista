import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mobile = true;
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mobile }));
const { default: StickyBuyBar, buttonsOffScreen } = await import('./StickyBuyBar');

describe('buttonsOffScreen', () => {
  it('fora do ecrã por baixo (ao chegar) ou por cima (ao descer); dentro, não', () => {
    expect(buttonsOffScreen({ top: 1000, bottom: 1100 }, 844)).toBe(true);
    expect(buttonsOffScreen({ top: -200, bottom: -10 }, 844)).toBe(true);
    expect(buttonsOffScreen({ top: 700, bottom: 900 }, 844)).toBe(false);
    expect(buttonsOffScreen({ top: -50, bottom: 40 }, 844)).toBe(false);
    expect(buttonsOffScreen(null, 844)).toBe(false);
  });
});

describe('StickyBuyBar', () => {
  let root;
  let host;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    mobile = true;
    document.documentElement.style.removeProperty('--barra-compra');
  });

  async function mount(rect, props = {}) {
    const alvo = document.createElement('div');
    alvo.getBoundingClientRect = () => rect;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<StickyBuyBar alvo={alvo} price="Kz 7 880,00" onBuy={() => {}} {...props} />));
  }

  it('aparece logo à chegada quando os botões estão abaixo do ecrã, com comprar e juntar ao carrinho', async () => {
    const onAdd = vi.fn();
    await mount({ top: 1000, bottom: 1100 }, { onAdd });
    expect(host.textContent).toContain('Kz 7 880,00');
    expect(document.documentElement.style.getPropertyValue('--barra-compra')).toBe('72px');
    const add = host.querySelector('button[aria-label="Adicionar ao carrinho"]');
    act(() => add.click());
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('não repete os botões quando eles estão à vista', async () => {
    await mount({ top: 300, bottom: 420 });
    expect(host.textContent).toBe('');
    expect(document.documentElement.style.getPropertyValue('--barra-compra')).toBe('0px');
  });

  it('fora do telemóvel não aparece nem empurra os flutuantes', async () => {
    mobile = false;
    await mount({ top: 1000, bottom: 1100 });
    expect(host.textContent).toBe('');
    expect(document.documentElement.style.getPropertyValue('--barra-compra')).toBe('0px');
  });
});
