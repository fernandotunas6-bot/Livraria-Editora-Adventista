import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useAfterLoad } from './useAfterLoad';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
let seen = [];
function Probe({ delayMs }) {
  seen.push(useAfterLoad({ delayMs }));
  return null;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  seen = [];
  delete window.requestIdleCallback;
});

async function mount(delayMs) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe delayMs={delayMs} />));
}

const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe('useAfterLoad', () => {
  it('sem gesto, fica pronto depois do atraso (sem requestIdleCallback)', async () => {
    await mount(40);
    expect(seen[0]).toBe(false);
    await wait(10);
    expect(seen.at(-1)).toBe(false);
    await wait(80);
    expect(seen.at(-1)).toBe(true);
  });

  it('o primeiro gesto da pessoa adianta-o', async () => {
    await mount(60_000);
    expect(seen.at(-1)).toBe(false);
    await act(async () => { window.dispatchEvent(new Event('pointerdown')); });
    expect(seen.at(-1)).toBe(true);
  });

  it('depois do atraso, espera que o navegador fique livre', async () => {
    let pending = null;
    window.requestIdleCallback = (fn) => { pending = fn; return 1; };
    await mount(10);
    await wait(40);
    expect(seen.at(-1)).toBe(false);
    await act(async () => { pending?.(); });
    expect(seen.at(-1)).toBe(true);
  });
});
