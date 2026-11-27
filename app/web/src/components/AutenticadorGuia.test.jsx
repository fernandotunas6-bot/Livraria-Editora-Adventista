// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GOOGLE_AUTHENTICATOR, PassosAutenticador, otpauthValido } from './AutenticadorGuia';
import { textoDosDoisPassos } from './MfaSettings';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let el;
const mount = async (ui) => {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(ui));
};
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  el?.remove();
  root = null;
});

describe('o guia do Google Authenticator', () => {
  it('só um endereço otpauth://totp abre a aplicação', () => {
    expect(otpauthValido('otpauth://totp/Livraria:eu%40x.ao?secret=ABC&issuer=Livraria')).toBe(true);
    expect(otpauthValido('javascript:alert(1)')).toBe(false);
    expect(otpauthValido('otpauth://hotp/x?secret=ABC')).toBe(false);
    expect(otpauthValido('')).toBe(false);
  });

  it('mostra os quatro passos e as ligações para o iPhone e o Android', async () => {
    await mount(<PassosAutenticador uri="" />);
    expect(el.querySelectorAll('ol li')).toHaveLength(4);
    const ligacoes = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(ligacoes).toEqual([GOOGLE_AUTHENTICATOR.ios, GOOGLE_AUTHENTICATOR.android]);
    expect(el.textContent).not.toMatch(/Abrir na aplicação/);
  });

  it('com o otpauth da activação, o botão abre a aplicação já com a conta', async () => {
    const uri = 'otpauth://totp/Livraria:eu%40x.ao?secret=ABC&issuer=Livraria';
    await mount(<PassosAutenticador uri={uri} />);
    const abrir = [...el.querySelectorAll('a')].find((a) => /Abrir na aplicação/.test(a.textContent));
    expect(abrir?.getAttribute('href')).toBe(uri);
  });

  it('o texto conforme a política da equipa (opcional desde 27/11)', () => {
    expect(textoDosDoisPassos(true, true)).toMatch(/^Obrigatória para a equipa/);
    expect(textoDosDoisPassos(true, false)).toMatch(/^Opcional, mas recomendada/);
    expect(textoDosDoisPassos(false, true)).toMatch(/^Opcional:/);
  });
});
