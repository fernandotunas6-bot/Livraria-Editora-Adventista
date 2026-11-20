// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O formulário de entrada a identificar a conta lembrada neste aparelho.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const login = vi.fn(async () => ({ record: { id: 'u1', name: 'Maria' } }));
const signup = vi.fn(async () => ({ record: { id: 'u1' } }));
const loginWithGoogle = vi.fn(async () => {});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ login, signup, loginWithGoogle }) }));
let google = true;
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings: { google_oauth_enabled: google } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const { default: AuthForm } = await import('./AuthForm');

let root;
let host;
async function mount(props = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(
    <MemoryRouter><AuthForm returnPath="/profile" onDone={() => {}} {...props} /></MemoryRouter>,
  ));
}
const $ = (sel) => host.querySelector(sel);
const byText = (text) => [...host.querySelectorAll('button, p, a')].find((el) => el.textContent.includes(text));
async function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const click = (el) => act(async () => { el.click(); });

const MARIA = { email: 'maria@exemplo.ao', name: 'Maria Lopes', provider: 'email' };

beforeEach(() => {
  google = true;
  localStorage.clear();
  [login, signup, loginWithGoogle].forEach((f) => f.mockClear());
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('AuthForm — conta lembrada', () => {
  it('identifica a conta: nome e email em vez do campo, palavra-passe pronta a preencher', async () => {
    await mount({ remembered: MARIA, defaultEmail: MARIA.email, autoFocus: true });
    expect(byText('Bem-vindo de volta, Maria')).toBeTruthy();
    expect(host.textContent).toContain('maria@exemplo.ao');
    // O email segue escondido, como `username`: é por ele que o gestor de palavras-passe sabe a conta.
    const user = $('input[autocomplete="username"]');
    expect(user.hidden).toBe(true);
    expect(user.value).toBe('maria@exemplo.ao');
    const pass = $('input[name="password"]');
    expect(pass.getAttribute('autocomplete')).toBe('current-password');
    expect(document.activeElement).toBe(pass);
  });

  it('entrar com a conta lembrada usa o email dela', async () => {
    await mount({ remembered: MARIA });
    await type($('input[name="password"]'), 'segredo123');
    await click($('button[type="submit"]'));
    expect(login).toHaveBeenCalledWith('maria@exemplo.ao', 'segredo123');
  });

  it('conta da Google: "Continuar com Google" já na conta certa, palavra-passe só a pedido', async () => {
    await mount({ remembered: { ...MARIA, provider: 'google' } });
    expect($('input[name="password"]')).toBeNull();
    const card = $('[data-conta-lembrada]');
    await click([...card.querySelectorAll('button')].find((b) => b.textContent.includes('Continuar com Google')));
    expect(loginWithGoogle).toHaveBeenCalledWith('/profile', { loginHint: 'maria@exemplo.ao' });
    await click(byText('Entrar com a palavra-passe'));
    expect($('input[name="password"]')).not.toBeNull();
  });

  it('"Não é a Maria?" esquece a conta neste aparelho e mostra o formulário de sempre', async () => {
    localStorage.setItem('livraria_teve_conta', JSON.stringify(MARIA));
    await mount({ remembered: MARIA });
    await click(byText('Usar outra conta'));
    expect(localStorage.getItem('livraria_teve_conta')).toBeNull();
    expect($('[data-conta-lembrada]')).toBeNull();
    const email = $('input[name="email"]');
    expect(email.hidden).toBe(false);
    expect(email.value).toBe('');
    expect(email.getAttribute('autocomplete')).toBe('username');
  });

  it('a conta lembrada não aparece quando se pede outro email (ex.: o da encomenda)', async () => {
    await mount({ remembered: MARIA, defaultEmail: 'outra@exemplo.ao' });
    expect($('[data-conta-lembrada]')).toBeNull();
    expect($('input[name="email"]').value).toBe('outra@exemplo.ao');
  });

  it('sem Google ligada, uma conta Google lembrada mostra a palavra-passe', async () => {
    google = false;
    await mount({ remembered: { ...MARIA, provider: 'google' } });
    expect($('input[name="password"]')).not.toBeNull();
  });
});

describe('AuthForm — registo com email que já tem conta', () => {
  it('passa a entrar, com o aviso e a palavra-passe escrita', async () => {
    signup.mockResolvedValueOnce({ alreadyRegistered: true, email: 'maria@exemplo.ao' });
    const onModeChange = vi.fn();
    await mount({ initialMode: 'signup', onModeChange });
    expect($('input[name="email"]').getAttribute('autocomplete')).toBe('email');
    await type($('input[name="name"]'), 'Maria');
    await type($('input[name="email"]'), 'maria@exemplo.ao');
    await type($('input[name="password"]'), 'segredo123');
    await click($('button[type="submit"]'));
    expect(host.textContent).toContain('maria@exemplo.ao já tem conta');
    expect(onModeChange).toHaveBeenLastCalledWith('login');
    expect($('button[type="submit"]').textContent).toContain('Entrar');
    expect($('input[name="password"]').value).toBe('segredo123');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.activeElement).toBe($('input[name="password"]'));
  });
});
