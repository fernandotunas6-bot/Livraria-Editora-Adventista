import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// O arranque da sessão no cliente de dados, com o supabase-js simulado: os avisos do Auth chegam
// por `onAuthStateChange` e decide-se o que mostrar (lib/authSession.js, `authEventAction`).

let authCallback = null;
const getSession = vi.fn(async () => ({ data: { session: null } }));
const signOut = vi.fn(async () => ({ error: null }));

vi.mock('@/lib/supabaseClient', () => ({
  SUPABASE_URL: 'http://supabase.invalid',
  APP_API_URL: 'http://supabase.invalid/functions/v1/app',
  IS_PASSWORD_RECOVERY_REDIRECT: false,
  mediaUrl: () => '',
  supabase: {
    auth: {
      onAuthStateChange: (cb) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession,
      signOut,
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u1', name: 'Maria Lopes', role: 'member' } }) }) }),
    }),
  },
}));

const STORED = { access_token: 'token-velho', refresh_token: 'r1', user: { id: 'u1', email: 'maria@exemplo.ao' } };
const PROFILE = { id: 'u1', name: 'Maria Lopes', role: 'member', email: 'maria@exemplo.ao' };
const preventSilentAccess = vi.fn(async () => {});
const tick = () => new Promise((r) => setTimeout(r, 0));

// Cada teste carrega o módulo de novo; os ouvintes de `online` dos anteriores saem no fim.
const onlineListeners = [];
const visibilityListeners = [];
const realAdd = window.addEventListener.bind(window);
const realDocAdd = document.addEventListener.bind(document);

async function load({ stored = STORED, profile = PROFILE } = {}) {
  vi.resetModules();
  localStorage.clear();
  if (stored) localStorage.setItem('sb-teste-auth-token', JSON.stringify(stored));
  if (profile) localStorage.setItem('livraria_profile', JSON.stringify(profile));
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
    if (type === 'online') onlineListeners.push(fn);
    return realAdd(type, fn, opts);
  });
  const docSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
    if (type === 'visibilitychange') visibilityListeners.push(fn);
    return realDocAdd(type, fn, opts);
  });
  const { default: pb } = await import('@/lib/dataClient');
  spy.mockRestore();
  docSpy.mockRestore();
  return pb;
}

beforeEach(() => {
  authCallback = null;
  getSession.mockClear();
  signOut.mockClear();
  preventSilentAccess.mockClear();
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: { preventSilentAccess } });
});
afterEach(() => {
  delete navigator.credentials;
  localStorage.clear();
  onlineListeners.splice(0).forEach((fn) => window.removeEventListener('online', fn));
  visibilityListeners.splice(0).forEach((fn) => document.removeEventListener('visibilitychange', fn));
});

describe('arranque da sessão', () => {
  it('a conta guardada aparece logo, pronta, antes de o supabase-js responder (sem esperar pela rede)', async () => {
    const pb = await load();
    expect(pb.authStore.isValid).toBe(true);
    expect(pb.authStore.record.name).toBe('Maria Lopes');
    expect(pb.authStore.isReady).toBe(true);
  });

  it('com o regresso da Google no endereço, espera pelo supabase-js', async () => {
    window.history.replaceState(null, '', '/profile#access_token=abc&refresh_token=def');
    try {
      const pb = await load();
      expect(pb.authStore.isReady).toBe(false);
      authCallback('INITIAL_SESSION', { access_token: 'abc', user: { id: 'u1', email: 'maria@exemplo.ao' } });
      await tick();
      expect(pb.authStore.isReady).toBe(true);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('perfil em cache de outra conta: espera pelo supabase-js', async () => {
    const pb = await load({ profile: { ...PROFILE, id: 'outra' } });
    expect(pb.authStore.isValid).toBe(false);
    expect(pb.authStore.isReady).toBe(false);
  });

  it('ao abrir sem rede, a conta fica à vista e o perfil em cache não se apaga', async () => {
    const pb = await load();
    // Renovação falhada por falta de rede: aviso sem sessão, mas a sessão continua guardada.
    authCallback('INITIAL_SESSION', null);
    expect(pb.authStore.isValid).toBe(true);
    expect(pb.authStore.isReady).toBe(true);
    expect(pb.authStore.offline).toBe(true);
    expect(JSON.parse(localStorage.getItem('livraria_profile')).id).toBe('u1');
    // A rede volta: tenta-se renovar logo, sem a espera de um minuto do supabase-js.
    const { supabase } = await import('@/lib/supabaseClient');
    supabase.auth.lastRefreshFailure = { refreshToken: 'r1', expiresAt: Date.now() + 60_000 };
    window.dispatchEvent(new Event('online'));
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.lastRefreshFailure).toBeNull();
    delete supabase.auth.lastRefreshFailure;
  });

  it('voltar à app com a sessão por renovar também tenta logo', async () => {
    await load();
    authCallback('INITIAL_SESSION', null);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('a renovação que chega depois volta a pôr a sessão em dia', async () => {
    const pb = await load();
    authCallback('INITIAL_SESSION', null);
    authCallback('TOKEN_REFRESHED', { access_token: 'token-novo', user: { id: 'u1', email: 'maria@exemplo.ao' } });
    await tick();
    expect(pb.authStore.token).toBe('token-novo');
    expect(pb.authStore.offline).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(getSession).not.toHaveBeenCalled();
  });

  it('sem sessão guardada, um arranque sem sessão é mesmo sem sessão', async () => {
    const pb = await load({ stored: null, profile: null });
    authCallback('INITIAL_SESSION', null);
    expect(pb.authStore.isValid).toBe(false);
    expect(pb.authStore.isReady).toBe(true);
  });
});

describe('fim da sessão', () => {
  it('terminada pelo servidor: sai, avisa quem ouve e o navegador deixa de entrar sozinho', async () => {
    const pb = await load();
    authCallback('INITIAL_SESSION', { access_token: 'a', user: { id: 'u1', email: 'maria@exemplo.ao' } });
    await tick();
    const ended = vi.fn();
    pb.authStore.onSessionEnded(ended);
    authCallback('SIGNED_OUT', null);
    expect(pb.authStore.isValid).toBe(false);
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', email: 'maria@exemplo.ao' }));
    expect(JSON.parse(localStorage.getItem('livraria_saida')).reason).toBe('ended');
    expect(preventSilentAccess).toHaveBeenCalled();
  });

  it('um fim de sessão no arranque espera pelo primeiro ouvinte', async () => {
    const pb = await load();
    authCallback('SIGNED_OUT', null);
    const ended = vi.fn();
    pb.authStore.onSessionEnded(ended);
    await tick();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('"Sair" é da pessoa: sem aviso de sessão terminada, nem neste separador nem nos outros', async () => {
    const pb = await load();
    const ended = vi.fn();
    pb.authStore.onSessionEnded(ended);
    pb.authStore.clear();
    expect(JSON.parse(localStorage.getItem('livraria_saida')).reason).toBe('user');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    authCallback('SIGNED_OUT', null);
    expect(ended).not.toHaveBeenCalled();
  });

  it('"Terminar em todos os aparelhos" marca a saída antes do signOut', async () => {
    const pb = await load();
    const ended = vi.fn();
    pb.authStore.onSessionEnded(ended);
    pb.authStore.noteUserSignOut();
    // O signOut global avisa SIGNED_OUT com a conta ainda à vista.
    authCallback('SIGNED_OUT', null);
    expect(ended).not.toHaveBeenCalled();
  });

  it('voltar a entrar apaga a marca da saída', async () => {
    const pb = await load();
    pb.authStore.clear();
    authCallback('SIGNED_IN', { access_token: 'b', user: { id: 'u1' } });
    expect(localStorage.getItem('livraria_saida')).toBeNull();
    await tick();
    expect(pb.authStore.isValid).toBe(true);
  });
});
