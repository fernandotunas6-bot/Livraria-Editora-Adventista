// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretField } from './SettingsTab';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let host;
function mount(props) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<SecretField id="s" label="Password SMTP" value="" onChange={() => {}} {...props} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('SecretField', () => {
  it('guardada: diz que está definida, não mostra o valor e deixa retirar', () => {
    const onClear = vi.fn();
    const el = mount({ status: { set: true }, onClear });
    expect(el.textContent).toContain('Definida');
    expect(el.querySelector('input').value).toBe('');
    expect(el.querySelector('input').placeholder).toMatch(/escreva só para substituir/);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent.includes('Retirar')).click());
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('não guardada: sem botão de retirar', () => {
    const el = mount({ status: { set: false }, placeholder: 'SG....' });
    expect(el.textContent).toContain('Não definida');
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('input').placeholder).toBe('SG....');
  });

  it('base de dados antiga (sem estado): campo como antes, sem etiqueta', () => {
    const el = mount({ status: null, value: 'valor-antigo' });
    expect(el.textContent).not.toMatch(/Definida|Não definida/);
    expect(el.querySelector('input').value).toBe('valor-antigo');
  });
});
