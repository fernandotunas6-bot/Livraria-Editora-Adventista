import { afterEach, describe, expect, it, vi } from 'vitest';

const browserOpen = vi.fn(async () => {});
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));
const splashHide = vi.fn(async () => {});
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: splashHide } }));
const impact = vi.fn(async () => {});
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact } }));
const numeroNoIconeNativo = vi.fn(async () => {});
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ numeroNoIcone: numeroNoIconeNativo }) }));

const {
  REGRESSO_DO_LOGIN, abrirNoNavegadorDoApp, caminhoDaLigacao, eAppIos, eAppNativa, eRegressoDoLogin,
  esconderArranque, estiloDaBarraDeEstado, numeroNoIcone, plataformaNativa, vibrar,
} = await import('./nativeApp');

/** O que o Capacitor injecta no WKWebView do app. */
const capacitorIos = () => ({ isNativePlatform: () => true, getPlatform: () => 'ios' });

afterEach(() => {
  delete window.Capacitor;
  vi.clearAllMocks();
});

describe('o site dentro do app', () => {
  it('num navegador normal não há app', () => {
    expect(eAppNativa(window)).toBe(false);
    expect(plataformaNativa(window)).toBe('web');
    expect(eAppIos(window)).toBe(false);
    expect(eAppNativa(undefined)).toBe(false);
  });

  it('no app iOS', () => {
    const win = { Capacitor: capacitorIos() };
    expect(eAppNativa(win)).toBe(true);
    expect(plataformaNativa(win)).toBe('ios');
    expect(eAppIos(win)).toBe(true);
  });

  it('o Capacitor do site sem a parte nativa (num navegador) não conta', () => {
    expect(eAppNativa({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } })).toBe(false);
    expect(eAppNativa({ Capacitor: { isNativePlatform: () => { throw new Error('x'); } } })).toBe(false);
  });
});

describe('caminhoDaLigacao', () => {
  it('as ligações do site vão para a página, com a pesquisa e a âncora', () => {
    expect(caminhoDaLigacao('https://livrariaadventista.ao/track?order=LA-123')).toBe('/track?order=LA-123');
    expect(caminhoDaLigacao('https://www.livrariaadventista.ao/comunidade/p/9#c')).toBe('/comunidade/p/9#c');
    expect(caminhoDaLigacao('https://livrariaadventista.com/product/abc')).toBe('/product/abc');
    expect(caminhoDaLigacao('https://livrariaadventista.ao')).toBe('/');
  });

  it('o resto não abre por dentro', () => {
    for (const url of [
      'https://exemplo.com/track',
      'https://livrariaadventista.ao.exemplo.com/x',
      'http://livrariaadventista.ao/track',
      'https://user:pw@livrariaadventista.ao/x',
      'https://livrariaadventista.ao:8443/x',
      `${REGRESSO_DO_LOGIN}?code=abc`,
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(caminhoDaLigacao(url)).toBeNull();
    }
  });
});

describe('eRegressoDoLogin', () => {
  it('reconhece o regresso do login, com código ou com tokens', () => {
    expect(eRegressoDoLogin(`${REGRESSO_DO_LOGIN}?code=abc`)).toBe(true);
    expect(eRegressoDoLogin(`${REGRESSO_DO_LOGIN}#access_token=x`)).toBe(true);
    expect(eRegressoDoLogin(REGRESSO_DO_LOGIN)).toBe(true);
    expect(eRegressoDoLogin(`${REGRESSO_DO_LOGIN}x?code=abc`)).toBe(false);
    expect(eRegressoDoLogin('https://livrariaadventista.ao/auth/callback?code=abc')).toBe(false);
  });
});

describe('estiloDaBarraDeEstado', () => {
  it('texto claro sobre o azul da loja; escuro sobre o painel branco', () => {
    expect(estiloDaBarraDeEstado('/')).toBe('DARK');
    expect(estiloDaBarraDeEstado('/product/1')).toBe('DARK');
    expect(estiloDaBarraDeEstado('/admin')).toBe('LIGHT');
    expect(estiloDaBarraDeEstado('/admin', true)).toBe('DARK');
  });
});

describe('abrirNoNavegadorDoApp', () => {
  it('fora do app não abre nada (o site faz como sempre)', async () => {
    expect(await abrirNoNavegadorDoApp('https://x/livro.pdf')).toBe(false);
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('no app abre a folha do Safari', async () => {
    window.Capacitor = capacitorIos();
    expect(await abrirNoNavegadorDoApp('https://x/livro.pdf')).toBe(true);
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://x/livro.pdf', presentationStyle: 'popover' });
    browserOpen.mockRejectedValueOnce(new Error('não'));
    expect(await abrirNoNavegadorDoApp('https://x/livro.pdf')).toBe(false);
  });
});

describe('arranque, vibração e número no ícone', () => {
  it('fora do app não chamam nada', async () => {
    await esconderArranque();
    await vibrar();
    await numeroNoIcone(3);
    expect(splashHide).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
    expect(numeroNoIconeNativo).not.toHaveBeenCalled();
  });

  it('no app iOS', async () => {
    window.Capacitor = capacitorIos();
    await esconderArranque();
    expect(splashHide).toHaveBeenCalledWith({ fadeOutDuration: 250 });
    await vibrar();
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    await numeroNoIcone(4.7);
    expect(numeroNoIconeNativo).toHaveBeenCalledWith({ numero: 4 });
    await numeroNoIcone(-2);
    expect(numeroNoIconeNativo).toHaveBeenLastCalledWith({ numero: 0 });
  });

  it('um plugin que falha não estraga o site', async () => {
    window.Capacitor = capacitorIos();
    impact.mockRejectedValueOnce(new Error('sem motor'));
    await expect(vibrar()).resolves.toBeUndefined();
  });
});
