import { describe, expect, it, vi } from 'vitest';
import {
  SILENT_TRIED_KEY, getSilentPasswordCredential, keepSiteDataOnDevice, markSilentSignInTried, passwordCredentialsSupported,
  preventSilentSignIn, shouldTrySilentSignIn, silentSignInState, storePasswordCredential,
} from '@/lib/savedCredentials';

/** Uma janela de mentira com o gestor de palavras-passe do Chrome. */
function chromeLike({ saved = null, getError = null } = {}) {
  class PasswordCredential {
    constructor({ id, password, name }) {
      Object.assign(this, { id, password, name, type: 'password' });
    }
  }
  const credentials = {
    store: vi.fn(async (c) => c),
    get: vi.fn(async () => {
      if (getError) throw getError;
      return saved;
    }),
    preventSilentAccess: vi.fn(async () => {}),
  };
  const session = new Map();
  const local = new Map();
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) });
  return {
    isSecureContext: true,
    PasswordCredential,
    navigator: { credentials },
    sessionStorage: storage(session),
    localStorage: storage(local),
  };
}

describe('passwordCredentialsSupported', () => {
  it('só com a API completa e em ligação segura', () => {
    expect(passwordCredentialsSupported(chromeLike())).toBe(true);
    expect(passwordCredentialsSupported({ ...chromeLike(), isSecureContext: false })).toBe(false);
    // Safari e Firefox: sem PasswordCredential.
    expect(passwordCredentialsSupported({ isSecureContext: true, navigator: { credentials: { get() {} } } })).toBe(false);
    expect(passwordCredentialsSupported(undefined)).toBe(false);
  });
});

describe('storePasswordCredential', () => {
  it('pede ao navegador que guarde o email e a palavra-passe, com o nome', async () => {
    const win = chromeLike();
    expect(await storePasswordCredential({ email: 'maria@exemplo.ao', password: 'segredo123', name: 'Maria' }, win)).toBe(true);
    const stored = win.navigator.credentials.store.mock.calls[0][0];
    expect(stored).toMatchObject({ id: 'maria@exemplo.ao', password: 'segredo123', name: 'Maria' });
  });

  it('sem palavra-passe, sem API ou com o navegador a recusar, não faz nada nem rebenta', async () => {
    const win = chromeLike();
    expect(await storePasswordCredential({ email: 'maria@exemplo.ao', password: '' }, win)).toBe(false);
    expect(await storePasswordCredential({ email: 'a@b.ao', password: 'x' }, { isSecureContext: true })).toBe(false);
    win.navigator.credentials.store.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(await storePasswordCredential({ email: 'a@b.ao', password: 'x' }, win)).toBe(false);
  });
});

describe('getSilentPasswordCredential', () => {
  it('pede em silêncio e devolve a conta guardada', async () => {
    const win = chromeLike({ saved: { type: 'password', id: 'maria@exemplo.ao', password: 'segredo123', name: 'Maria' } });
    expect(await getSilentPasswordCredential(win)).toEqual({ email: 'maria@exemplo.ao', password: 'segredo123', name: 'Maria' });
    expect(win.navigator.credentials.get).toHaveBeenCalledWith({ password: true, mediation: 'silent' });
  });

  it('nada guardado, conta federada ou erro do navegador dão null', async () => {
    expect(await getSilentPasswordCredential(chromeLike())).toBeNull();
    expect(await getSilentPasswordCredential(chromeLike({ saved: { type: 'federated', id: 'x@y.ao' } }))).toBeNull();
    expect(await getSilentPasswordCredential(chromeLike({ getError: new Error('falhou') }))).toBeNull();
  });
});

describe('preventSilentSignIn', () => {
  it('pede ao navegador que não volte a entrar sozinho', async () => {
    const win = chromeLike();
    expect(await preventSilentSignIn(win)).toBe(true);
    expect(win.navigator.credentials.preventSilentAccess).toHaveBeenCalledTimes(1);
  });

  it('sem a API não rebenta', async () => {
    expect(await preventSilentSignIn({ navigator: {} })).toBe(false);
    expect(await preventSilentSignIn(undefined)).toBe(false);
  });
});

describe('shouldTrySilentSignIn', () => {
  const base = { ready: true, isAuthed: false, pathname: '/', triedThisLaunch: false, signOut: null };

  it('ao abrir a app sem sessão, tenta', () => {
    expect(shouldTrySilentSignIn(base)).toBe(true);
    expect(shouldTrySilentSignIn({ ...base, pathname: '/login' })).toBe(true);
  });

  it('não antes de se saber se há sessão, nem com sessão, nem duas vezes no mesmo arranque', () => {
    expect(shouldTrySilentSignIn({ ...base, ready: false })).toBe(false);
    expect(shouldTrySilentSignIn({ ...base, isAuthed: true })).toBe(false);
    expect(shouldTrySilentSignIn({ ...base, triedThisLaunch: true })).toBe(false);
    expect(shouldTrySilentSignIn({ ...base, supported: false })).toBe(false);
  });

  it('sair é sair: nem depois de "Sair", nem depois de o servidor terminar a sessão', () => {
    expect(shouldTrySilentSignIn({ ...base, signOut: JSON.stringify({ reason: 'user', at: 1 }) })).toBe(false);
    expect(shouldTrySilentSignIn({ ...base, signOut: JSON.stringify({ reason: 'ended', at: 1 }) })).toBe(false);
    // Uma marca estragada não conta como saída.
    expect(shouldTrySilentSignIn({ ...base, signOut: 'lixo' })).toBe(true);
  });

  it('nunca na recuperação de palavra-passe nem ao voltar de um erro de entrada', () => {
    expect(shouldTrySilentSignIn({ ...base, pathname: '/reset-password' })).toBe(false);
    expect(shouldTrySilentSignIn({ ...base, pathname: '/forgot-password' })).toBe(false);
    expect(shouldTrySilentSignIn({ ...base, recovery: true })).toBe(false);
  });
});

describe('silentSignInState / markSilentSignInTried', () => {
  it('lê o arranque e a marca de saída do armazenamento', () => {
    const win = chromeLike();
    expect(silentSignInState(win)).toEqual({ triedThisLaunch: false, signOut: null });
    markSilentSignInTried(win);
    win.localStorage.setItem('livraria_saida', '{"reason":"user","at":1}');
    expect(silentSignInState(win)).toEqual({ triedThisLaunch: true, signOut: '{"reason":"user","at":1}' });
    expect(win.sessionStorage.getItem(SILENT_TRIED_KEY)).toBe('1');
  });

  it('sem armazenamento, conta como já tentado (não repetir a cada página)', () => {
    const broken = { get sessionStorage() { throw new Error('bloqueado'); }, get localStorage() { throw new Error('bloqueado'); } };
    expect(silentSignInState(broken)).toEqual({ triedThisLaunch: true, signOut: null });
    expect(() => markSilentSignInTried(broken)).not.toThrow();
  });
});

describe('keepSiteDataOnDevice', () => {
  const app = (standalone, persisted = false) => ({
    matchMedia: () => ({ matches: standalone }),
    navigator: { storage: { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => true) } },
  });

  it('na app instalada, pede para não apagar os dados do site', async () => {
    const win = app(true);
    expect(await keepSiteDataOnDevice(win)).toBe(true);
    expect(win.navigator.storage.persist).toHaveBeenCalledTimes(1);
  });

  it('num separador normal não pergunta nada; já protegido, não volta a pedir', async () => {
    const tab = app(false);
    expect(await keepSiteDataOnDevice(tab)).toBe(false);
    expect(tab.navigator.storage.persist).not.toHaveBeenCalled();
    const done = app(true, true);
    expect(await keepSiteDataOnDevice(done)).toBe(true);
    expect(done.navigator.storage.persist).not.toHaveBeenCalled();
  });

  it('o iPhone instalado no ecrã inicial também conta', async () => {
    const win = { matchMedia: () => ({ matches: false }), navigator: { standalone: true, storage: { persist: vi.fn(async () => true) } } };
    expect(await keepSiteDataOnDevice(win)).toBe(true);
  });
});
