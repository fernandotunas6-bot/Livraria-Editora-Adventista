// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.
// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SeccaoExpansivel from './SeccaoExpansivel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let caixa;
let raiz;
beforeEach(() => {
  caixa = document.createElement('div');
  document.body.appendChild(caixa);
  raiz = createRoot(caixa);
});
afterEach(() => {
  act(() => raiz.unmount());
  caixa.remove();
});

const regiao = () => document.querySelector('[role="region"][aria-label="Secção expandida"]');
const botao = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(texto));
const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

describe('SeccaoExpansivel', () => {
  it('expande para o ecrã inteiro e volta com Esc, com o mesmo conteúdo', () => {
    act(() => raiz.render(<SeccaoExpansivel><p>Encomenda LA-1</p></SeccaoExpansivel>));
    expect(regiao()).toBeNull();
    act(() => botao('Expandir').click());
    expect(regiao().textContent).toContain('Encomenda LA-1');
    expect(document.body.style.overflow).toBe('hidden');
    esc();
    expect(regiao()).toBeNull();
    expect(caixa.textContent).toContain('Encomenda LA-1');
    expect(document.body.style.overflow).toBe('');
  });

  it('com uma janela aberta, o Esc fecha a janela e não a secção', () => {
    act(() => raiz.render(<SeccaoExpansivel><div role="dialog" data-state="open">Janela</div></SeccaoExpansivel>));
    act(() => botao('Expandir').click());
    esc();
    expect(regiao()).not.toBeNull();
    act(() => botao('Voltar').click());
    expect(regiao()).toBeNull();
  });
});
