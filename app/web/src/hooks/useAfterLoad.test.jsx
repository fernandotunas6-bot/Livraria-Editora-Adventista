import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useAfterLoad } from './useAfterLoad';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
let seen = [];
function Probe() {
  seen.push(useAfterLoad({ maxWaitMs: 50 }));
  return null;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  seen = [];
  delete window.requestIdleCallback;
});

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
}

describe('useAfterLoad', () => {
  it('começa a falso e passa a verdadeiro depois do load, sem requestIdleCallback', async () => {
    await mount();
    expect(seen[0]).toBe(false);
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
    expect(seen.at(-1)).toBe(true);
  });

  it('usa o requestIdleCallback quando existe', async () => {
    let pending = null;
    window.requestIdleCallback = (fn) => { pending = fn; return 1; };
    await mount();
    expect(seen.at(-1)).toBe(false);
    await act(async () => { pending?.(); });
    expect(seen.at(-1)).toBe(true);
  });
});
