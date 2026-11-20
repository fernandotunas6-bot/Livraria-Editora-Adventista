// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import SkipToContent, { focusMainContent } from './SkipToContent';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.querySelectorAll('main').forEach((m) => m.remove());
});

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<SkipToContent />));
  return host.querySelector('a');
}

describe('SkipToContent', () => {
  it('é um link com o texto em português', async () => {
    const link = await mount();
    expect(link.textContent).toBe('Saltar para o conteúdo');
    expect(link.getAttribute('href')).toBe('#conteudo');
  });

  it('leva o foco para o <main> sem mudar o endereço', async () => {
    const main = document.createElement('main');
    document.body.appendChild(main);
    const link = await mount();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');
  });

  it('sem <main>, deixa a âncora seguir o caminho normal', async () => {
    expect(focusMainContent(document)).toBe(false);
    const link = await mount();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => { link.dispatchEvent(click); });
    expect(click.defaultPrevented).toBe(false);
  });

  it('não mexe num tabindex que a página já tenha', () => {
    const main = document.createElement('main');
    main.setAttribute('tabindex', '0');
    document.body.appendChild(main);
    expect(focusMainContent(document)).toBe(true);
    expect(main.getAttribute('tabindex')).toBe('0');
  });
});
