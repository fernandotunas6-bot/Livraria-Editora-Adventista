import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Entrada automática e palavras-passe guardadas no `AuthProvider` (lib/savedCredentials.js).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const changeListeners = new Set();
const authStore = {
  token: '',
  record: null,
  get isValid() { return !!this.record; },
  isReady: true,
  method: '',
  onChange(cb) { changeListeners.add(cb); return () => changeListeners.delete(cb); },
  onReady(cb) { cb(); return () => {}; },
  onSessionEnded() { return () => {}; },
  noteUserSignOut: vi.fn(),
  clear: vi.fn(() => { authStore.record = null; }),
};
const authWithPassword = vi.fn(async (email) => {
  authStore.record = { id: 'u1', name: 'Maria Lopes', email };
  changeListeners.forEach((cb) => cb('t', authStore.record));
  return { token: 't', record: authStore.record };
});
vi.mock('@/lib/dataClient', () => ({
  default: {
    authStore,
    collection: () => ({ authWithPassword, create: vi.fn(), update: vi.fn() }),
    send: vi.fn(async () => ({})),
  },
}));
const signInWithOAuth = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabaseClient', () => ({
  IS_PASSWORD_RECOVERY_REDIRECT: false,
  supabase: { auth: { signInWithOAuth, signOut: vi.fn(async () => ({ error: null })) } },
}));
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: (...a) => toastSuccess(...a), error: vi.fn() }) }));

const { AuthProvider, useAuth } = await import('@/hooks/useAuth');

let saved = null;
const credentials = {
  get: vi.fn(async () => saved),
  store: vi.fn(async () => {}),
  preventSilentAccess: vi.fn(async () => {}),
};

let root;
let host;
let api;
function Probe() {
  api = useAuth();
  return null;
}
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
  // A tentativa silenciosa corre depois do efeito: deixar as promessas acabarem.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
  saved = null;
  authStore.record = null;
  sessionStorage.clear();
  localStorage.clear();
  Object.values(credentials).forEach((f) => f.mockClear());
  authWithPassword.mockClear();
  toastSuccess.mockClear();
  signInWithOAuth.mockClear();
  window.PasswordCredential = class {
    constructor(data) { Object.assign(this, data, { type: 'password' }); }
  };
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: credentials });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  delete window.PasswordCredential;
  delete navigator.credentials;
});

describe('entrada automática ao abrir a app', () => {
  it('com uma conta guardada no navegador, entra sozinho e diz quem entrou', async () => {
    saved = { type: 'password', id: 'Maria@Exemplo.ao', password: 'segredo123', name: 'Maria' };
    await mount();
    expect(credentials.get).toHaveBeenCalledWith({ password: true, mediation: 'silent' });
    expect(authWithPassword).toHaveBeenCalledWith('maria@exemplo.ao', 'segredo123');
    expect(api.user?.id).toBe('u1');
    expect(toastSuccess).toHaveBeenCalledWith('Bem-vindo de volta, Maria', expect.anything());
  });

  it('só tenta uma vez por arranque', async () => {
    await mount();
    expect(credentials.get).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    host.remove();
    await mount();
    expect(credentials.get).toHaveBeenCalledTimes(1);
  });

  it('depois de "Sair" não entra sozinho', async () => {
    localStorage.setItem('livraria_saida', JSON.stringify({ reason: 'user', at: Date.now() }));
    saved = { type: 'password', id: 'maria@exemplo.ao', password: 'segredo123' };
    await mount();
    expect(credentials.get).not.toHaveBeenCalled();
    expect(authWithPassword).not.toHaveBeenCalled();
  });

  it('com a palavra-passe guardada já errada, o navegador deixa de a oferecer', async () => {
    saved = { type: 'password', id: 'maria@exemplo.ao', password: 'antiga' };
    authWithPassword.mockRejectedValueOnce(Object.assign(new Error('Email ou palavra-passe incorrectos.'), { status: 400 }));
    await mount();
    expect(credentials.preventSilentAccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('sem rede, não desiste da palavra-passe guardada', async () => {
    saved = { type: 'password', id: 'maria@exemplo.ao', password: 'segredo123' };
    authWithPassword.mockRejectedValueOnce(Object.assign(new Error('Servidor indisponível.'), { status: 0 }));
    await mount();
    expect(credentials.preventSilentAccess).not.toHaveBeenCalled();
  });
});

describe('palavras-passe guardadas', () => {
  it('entrar pede ao navegador que guarde a conta', async () => {
    await mount();
    await act(async () => { await api.login(' Maria@Exemplo.ao ', 'segredo123'); });
    const stored = credentials.store.mock.calls[0][0];
    expect(stored).toMatchObject({ id: 'maria@exemplo.ao', password: 'segredo123', name: 'Maria Lopes' });
  });

  it('sair pede ao navegador que não volte a entrar sozinho', async () => {
    await mount();
    await act(async () => { await api.logout(); });
    expect(authStore.clear).toHaveBeenCalled();
    expect(credentials.preventSilentAccess).toHaveBeenCalled();
  });

  it('a Google abre já na conta lembrada', async () => {
    await mount();
    await act(async () => { await api.loginWithGoogle('/profile', { loginHint: 'maria@gmail.com' }); });
    expect(signInWithOAuth.mock.calls[0][0].options.queryParams).toEqual({ login_hint: 'maria@gmail.com' });
    await act(async () => { await api.loginWithGoogle('/profile', { loginHint: 'não é email' }); });
    expect(signInWithOAuth.mock.calls[1][0].options.queryParams).toBeUndefined();
  });
});
