import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import RichTextEditor from './RichTextEditor';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let host;

function mount(value) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<RichTextEditor value={value} onChange={() => {}} />));
  return host.querySelector('[contenteditable]');
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('RichTextEditor', () => {
  it('não põe no painel atributos de evento vindos da base de dados', () => {
    const editor = mount('<p>Descrição</p><img src="x" onerror="window.__xss = 1"><svg onload="window.__xss = 2"></svg>');
    expect(editor).not.toBeNull();
    expect(editor.innerHTML).toContain('<p>Descrição</p>');
    expect(editor.innerHTML).not.toMatch(/onerror|onload|<svg/i);
    expect(window.__xss).toBeUndefined();
  });

  it('mantém o que o próprio editor produz', () => {
    const html = '<h3>Título</h3><p><strong>negrito</strong> e <em>itálico</em></p><ul><li>um</li></ul><blockquote>citação</blockquote>';
    const editor = mount(html);
    expect(editor.innerHTML).toBe(html);
  });

  it('tira ligações javascript:', () => {
    const editor = mount('<p><a href="javascript:alert(1)">clique</a></p>');
    expect(editor.innerHTML).not.toMatch(/javascript:/i);
    expect(editor.textContent).toContain('clique');
  });
});
