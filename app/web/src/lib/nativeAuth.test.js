// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Entrar com a Google e com a Apple dentro do app iOS (lib/nativeAuth.js). O Supabase, o perfil e
// os plugins do app são simulados: nada fala com a rede.

const auth = {
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  signInWithIdToken: vi.fn(),
};
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth } }));

const ouvintes = new Set();
const store = {
  token: '',
  record: null,
  get isValid() { return !!this.token && !!this.record; },
  onChange(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
};
const update = vi.fn();
vi.mock('@/lib/dataClient', () => ({ default: { authStore: store, collection: () => ({ update }) } }));

/** O que o dataClient faz depois do `SIGNED_IN`: lê o perfil e põe a conta no site. */
const abrirConta = (record) => {
  store.token = 'jwt';
  store.record = record;
  ouvintes.forEach((fn) => fn(store.token, record));
};

const webAuthStart = vi.fn();
const appleAuthorize = vi.fn();
vi.mock('@capacitor/core', () => ({
  registerPlugin: (nome) => (nome === 'WebAuth' ? { start: webAuthStart } : { authorize: appleAuthorize }),
}));

const {
  abrirEEsperarRegresso, concluirRegressoDoLogin, entrarComApple, entrarComGoogleNoApp, esperarConta, foiCancelado, lerRegressoDoLogin, novoNonce,
} = await import('./nativeAuth');

const REGRESSO = 'ao.livrariaadventista.app://auth/callback';

beforeEach(() => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
});
afterEach(() => {
  delete window.Capacitor;
  store.token = '';
  store.record = null;
  ouvintes.clear();
  vi.clearAllMocks();
});

describe('lerRegressoDoLogin', () => {
  it('o código (PKCE) ou os tokens depois do #', () => {
    expect(lerRegressoDoLogin(`${REGRESSO}?code=abc`)).toEqual({ code: 'abc' });
    expect(lerRegressoDoLogin(`${REGRESSO}#access_token=a&refresh_token=r&expires_in=3600`))
      .toEqual({ access_token: 'a', refresh_token: 'r' });
  });

  it('o erro que o Supabase devolve, em texto', () => {
    expect(lerRegressoDoLogin(`${REGRESSO}?error=access_denied&error_description=Recusado+pela+pessoa`))
      .toEqual({ error: 'Recusado pela pessoa' });
    expect(lerRegressoDoLogin(`${REGRESSO}#error=server_error`)).toEqual({ error: 'server_error' });
  });

  it('nada de sessão vinda de outro endereço', () => {
    expect(lerRegressoDoLogin('https://livrariaadventista.ao/profile#access_token=a&refresh_token=r').error).toBeTruthy();
    expect(lerRegressoDoLogin(REGRESSO).error).toBeTruthy();
    expect(lerRegressoDoLogin(`${REGRESSO}#access_token=a`).error).toBeTruthy();
  });
});

describe('concluirRegressoDoLogin', () => {
  it('troca o código pela sessão', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    expect(await concluirRegressoDoLogin(`${REGRESSO}?code=abc`)).toEqual({ id: 'u1' });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('ou guarda os tokens', async () => {
    auth.setSession.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await concluirRegressoDoLogin(`${REGRESSO}#access_token=a&refresh_token=r`);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
  });

  it('um erro do Supabase não abre sessão', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: new Error('código expirado') });
    await expect(concluirRegressoDoLogin(`${REGRESSO}?code=abc`)).rejects.toThrow('código expirado');
  });
});

describe('esperarConta', () => {
  it('espera pelo perfil da conta certa', async () => {
    const pronta = esperarConta('u1');
    abrirConta({ id: 'outra' });
    abrirConta({ id: 'u1', name: 'Ana' });
    await expect(pronta).resolves.toEqual({ id: 'u1', name: 'Ana' });
    expect(ouvintes.size).toBe(0);
  });

  it('desiste ao fim do tempo', async () => {
    await expect(esperarConta('u1', 10)).rejects.toThrow('A sessão não abriu');
  });
});

describe('entrarComGoogleNoApp', () => {
  it('abre o login na folha do sistema e volta com a conta', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://x.supabase.co/auth/v1/authorize?provider=google' }, error: null });
    webAuthStart.mockResolvedValue({ url: `${REGRESSO}#access_token=a&refresh_token=r` });
    auth.setSession.mockImplementation(async () => {
      setTimeout(() => abrirConta({ id: 'u1', name: 'Ana' }), 0);
      return { data: { user: { id: 'u1' } }, error: null };
    });

    const { record } = await entrarComGoogleNoApp({ queryParams: { login_hint: 'ana@x.ao' } });
    expect(record).toEqual({ id: 'u1', name: 'Ana' });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REGRESSO, skipBrowserRedirect: true, queryParams: { login_hint: 'ana@x.ao' } },
    });
    expect(webAuthStart).toHaveBeenCalledWith({ url: 'https://x.supabase.co/auth/v1/authorize?provider=google', scheme: 'ao.livrariaadventista.app' });
  });

  it('fechar a folha é cancelar, não um erro', async () => {
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://x/authorize' }, error: null });
    webAuthStart.mockRejectedValue(Object.assign(new Error('Cancelado.'), { code: 'CANCELLED' }));
    const err = await entrarComGoogleNoApp().catch((e) => e);
    expect(foiCancelado(err)).toBe(true);
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

describe('entrarComApple', () => {
  it('a Apple recebe o SHA-256 do nonce; o Supabase, o nonce', async () => {
    appleAuthorize.mockResolvedValue({ identityToken: 'id-token', givenName: 'Ana', familyName: 'Silva' });
    auth.signInWithIdToken.mockImplementation(async () => {
      setTimeout(() => abrirConta({ id: 'u1', name: '' }), 0);
      return { data: { user: { id: 'u1' } }, error: null };
    });
    update.mockResolvedValue({ id: 'u1', name: 'Ana Silva' });

    const { record } = await entrarComApple();
    const { nonce: hash } = appleAuthorize.mock.calls[0][0];
    const { nonce } = auth.signInWithIdToken.mock.calls[0][0];
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'id-token', nonce });
    const esperado = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hash).toBe(esperado);
    // A Apple só dá o nome na primeira vez: o perfil sem nome fica com ele.
    expect(update).toHaveBeenCalledWith('u1', { name: 'Ana Silva' });
    expect(record.name).toBe('Ana Silva');
  });

  it('não mexe no nome que o perfil já tem', async () => {
    appleAuthorize.mockResolvedValue({ identityToken: 'id-token', givenName: 'Ana' });
    auth.signInWithIdToken.mockImplementation(async () => {
      setTimeout(() => abrirConta({ id: 'u1', name: 'Ana Maria' }), 0);
      return { data: { user: { id: 'u1' } }, error: null };
    });
    const { record } = await entrarComApple();
    expect(update).not.toHaveBeenCalled();
    expect(record.name).toBe('Ana Maria');
  });

  it('fora do app iOS não há Apple', async () => {
    delete window.Capacitor;
    await expect(entrarComApple()).rejects.toThrow('só está disponível na app');
  });
});

describe('novoNonce', () => {
  it('64 algarismos hexadecimais, diferentes de cada vez', async () => {
    const a = await novoNonce();
    const b = await novoNonce();
    expect(a.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe('abrirEEsperarRegresso (Android: separador do Chrome)', () => {
  /** O plugin App e o Browser do Capacitor, com os ouvintes à vista do teste. */
  const fingir = () => {
    const ouvintes = {};
    const ouvir = (nome) => vi.fn(async (_evento, fn) => { ouvintes[nome] = fn; return { remove: vi.fn(() => { delete ouvintes[nome]; }) }; });
    const app = { addListener: ouvir('appUrlOpen') };
    const browser = { addListener: ouvir('browserFinished'), open: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    return { app, browser, ouvintes };
  };
  const espera = () => new Promise((r) => setTimeout(r, 0));

  it('abre o login e volta com o endereço do regresso; as outras ligações não contam', async () => {
    const { app, browser, ouvintes } = fingir();
    const regresso = abrirEEsperarRegresso('https://x.supabase.co/auth/v1/authorize', { app, browser });
    await espera();
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://x.supabase.co/auth/v1/authorize' });
    ouvintes.appUrlOpen({ url: 'https://livrariaadventista.ao/track' });
    ouvintes.appUrlOpen({ url: `${REGRESSO}#access_token=a&refresh_token=r` });
    await expect(regresso).resolves.toBe(`${REGRESSO}#access_token=a&refresh_token=r`);
    expect(ouvintes.appUrlOpen).toBeUndefined();
  });

  it('o separador fecha-se ao voltar ao app antes de o regresso chegar: não é cancelar', async () => {
    const { app, browser, ouvintes } = fingir();
    const regresso = abrirEEsperarRegresso('https://x/authorize', { app, browser, folgaMs: 50 });
    await espera();
    ouvintes.browserFinished();
    ouvintes.appUrlOpen({ url: `${REGRESSO}?code=abc` });
    await expect(regresso).resolves.toBe(`${REGRESSO}?code=abc`);
  });

  it('fechar o separador sem entrar é cancelar', async () => {
    const { app, browser, ouvintes } = fingir();
    const regresso = abrirEEsperarRegresso('https://x/authorize', { app, browser, folgaMs: 10 });
    await espera();
    ouvintes.browserFinished();
    const err = await regresso.catch((e) => e);
    expect(foiCancelado(err)).toBe(true);
  });
});
