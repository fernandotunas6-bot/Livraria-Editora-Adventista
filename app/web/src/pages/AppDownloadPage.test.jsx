import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A página /app: o painel de download dos apps (as ligações vêm das Configurações do painel).

vi.mock('@/components/Header.jsx', () => ({ default: () => null }));
vi.mock('@/components/Footer.jsx', () => ({ default: () => null }));
vi.mock('@/components/ShoppingCart.jsx', () => ({ default: () => null }));
vi.mock('@/components/PageBannerSlider', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-helmet', () => ({ Helmet: () => null }));
vi.mock('@/components/InstalarApp', () => ({ BotaoInstalarApp: ({ semApp }) => <button type="button" data-instalar-web={semApp ? 'sem-app' : ''}>Instalar a app</button> }));
let settings = {};
vi.mock('@/hooks/useSiteSettings', () => ({ useSiteSettings: () => ({ settings }) }));
// Este telemóvel instala a app web agora? (Não, se já está instalada ou o navegador não deixa.)
let instalavel = true;
vi.mock('@/hooks/useInstalarApp', () => ({ useInstalarApp: () => ({ visivel: instalavel }) }));

const { default: AppDownloadPage, CodigoQr, ENDERECO_DA_PAGINA, PainelDeDownload } = await import('@/pages/AppDownloadPage');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const APK = 'https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista/releases/latest/download/livraria-adventista.apk';
const APP_STORE = 'https://apps.apple.com/ao/app/livraria-adventista/id1234567890';

let root;
let host;
async function render(el) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  settings = {};
  instalavel = true;
  delete window.Capacitor;
});

describe('PainelDeDownload', () => {
  it('com as ligações: um botão por telemóvel, para onde o painel disse', async () => {
    const el = await render(<PainelDeDownload settings={{ app_android_url: APK, app_ios_url: APP_STORE }} aparelho="android" />);
    const android = el.querySelector('a[data-descarregar="android"]');
    expect(android.getAttribute('href')).toBe(APK);
    expect(android.textContent).toBe('Descarregar paraAndroid');
    const ios = el.querySelector('a[data-descarregar="ios"]');
    expect(ios.getAttribute('href')).toBe(APP_STORE);
    expect(ios.textContent).toBe('Descarregar naApp Store');
    // O APK instala-se à mão: a página diz como. A App Store não precisa de passos.
    expect(el.querySelector('[data-app="android"]').textContent).toContain('autorizar a instalação');
    expect(el.querySelector('[data-app="ios"]').textContent).not.toContain('Como instalar');
  });

  it('cada botão leva o ícone do sítio para onde vai: só a ligação da Google Play tem o da Google Play', async () => {
    const icones = async (android, ios) => {
      const el = await render(<PainelDeDownload settings={{ app_android_url: android, app_ios_url: ios }} aparelho="outro" />);
      const de = (p) => {
        const a = el.querySelector(`a[data-descarregar="${p}"]`);
        // O triângulo da Google Play é o único com quatro cores; os outros são de uma cor só.
        return { loja: a.dataset.loja, cores: a.querySelectorAll('svg path[fill^="#"]').length, texto: a.textContent };
      };
      const r = { android: de('android'), ios: de('ios') };
      act(() => root.unmount());
      host.remove();
      return r;
    };
    const lojas = await icones('https://play.google.com/store/apps/details?id=ao.livrariaadventista.app', APP_STORE);
    expect(lojas.android).toEqual({ loja: 'play', cores: 4, texto: 'Disponível noGoogle Play' });
    expect(lojas.ios).toEqual({ loja: 'appstore', cores: 0, texto: 'Descarregar naApp Store' });
    const testes = await icones(APK, 'https://testflight.apple.com/join/AbCd1234');
    expect(testes.android).toEqual({ loja: 'apk', cores: 0, texto: 'Descarregar paraAndroid' });
    expect(testes.ios).toEqual({ loja: 'testflight', cores: 0, texto: 'Experimentar noTestFlight' });
  });

  it('o telemóvel de quem visita vem primeiro e em destaque', async () => {
    let el = await render(<PainelDeDownload settings={{ app_android_url: APK, app_ios_url: APP_STORE }} aparelho="ios" />);
    expect([...el.querySelectorAll('[data-app]')].map((c) => c.dataset.app)).toEqual(['ios', 'android']);
    expect(el.querySelector('[data-o-meu]').dataset.app).toBe('ios');
    expect(el.querySelector('[data-qr]')).toBeNull();
    act(() => root.unmount());
    host.remove();
    el = await render(<PainelDeDownload settings={{ app_android_url: APK }} aparelho="android" />);
    expect([...el.querySelectorAll('[data-app]')].map((c) => c.dataset.app)).toEqual(['android', 'ios']);
    expect(el.querySelector('[data-o-meu]').dataset.app).toBe('android');
  });

  it('sem ligação, a app está a chegar e oferece-se a app web só no telemóvel onde serve', async () => {
    const el = await render(<PainelDeDownload settings={{}} aparelho="ios" />);
    expect(el.querySelector('a[data-descarregar]')).toBeNull();
    expect(el.querySelector('[data-a-chegar="ios"]').textContent).toContain('está a chegar');
    // No iPhone de quem visita: o botão da app web, o de sempre (e não outra vez esta página).
    expect(el.querySelector('[data-a-chegar="ios"] [data-instalar-web="sem-app"]')).not.toBeNull();
    expect(el.querySelector('[data-a-chegar="android"] [data-instalar-web]')).toBeNull();
    expect(el.querySelector('[data-a-chegar="android"]').textContent).toContain('Abra esta página no telemóvel Android');
  });

  it('não promete a app web onde ela não se instala', async () => {
    // A loja tem a instalação desligada no painel: só «está a chegar».
    let el = await render(<PainelDeDownload settings={{ pwa_enabled: false }} aparelho="android" />);
    expect(el.querySelector('[data-instalar-web]')).toBeNull();
    expect(el.textContent).not.toContain('instala-se no telemóvel');
    expect(el.textContent).not.toContain('Abra esta página');
    expect(el.querySelector('[data-a-chegar="android"]').textContent).toContain('A app para Android está a chegar.');
    act(() => root.unmount());
    host.remove();
    // Já instalada neste telemóvel (ou o navegador não deixa): sem botão nem promessa no cartão dele.
    instalavel = false;
    el = await render(<PainelDeDownload settings={{}} aparelho="android" />);
    expect(el.querySelector('[data-instalar-web]')).toBeNull();
    expect(el.querySelector('[data-a-chegar="android"]').textContent).not.toContain('instala-se no telemóvel');
    expect(el.querySelector('[data-a-chegar="ios"]').textContent).toContain('Abra esta página no iPhone ou iPad');
  });

  it('uma ligação que não é https não chega a botão', async () => {
    const el = await render(<PainelDeDownload settings={{ app_android_url: 'javascript:alert(1)', app_ios_url: 'http://exemplo.ao' }} aparelho="android" />);
    expect(el.querySelector('a[data-descarregar]')).toBeNull();
  });

  it('no computador, o código QR leva a página para o telemóvel', async () => {
    const el = await render(<PainelDeDownload settings={{ app_android_url: APK }} aparelho="outro" />);
    expect(el.querySelector('[data-o-meu]')).toBeNull();
    expect(el.querySelector('[data-qr] svg path').getAttribute('d').length).toBeGreaterThan(200);
    expect(el.querySelector('[data-qr]').textContent).toContain('livrariaadventista.ao/app');
    expect(ENDERECO_DA_PAGINA).toBe('https://livrariaadventista.ao/app');
  });

  it('dentro dos apps não há nada para descarregar, nem se fala das outras lojas', async () => {
    const el = await render(<PainelDeDownload settings={{ app_android_url: APK, app_ios_url: APP_STORE }} aparelho="ios" noApp />);
    expect(el.querySelector('[data-ja-na-app]').textContent).toContain('Já está a usar a app');
    expect(el.querySelector('[data-app]')).toBeNull();
    expect(el.querySelector('a[data-descarregar]')).toBeNull();
    expect(el.textContent).not.toMatch(/Android|Google Play|App Store|iPhone/);
  });
});

describe('CodigoQr', () => {
  it('desenha o mesmo código para o mesmo endereço, e outro para outro', async () => {
    const el = await render(<><CodigoQr texto="https://livrariaadventista.ao/app" /><CodigoQr texto="https://livrariaadventista.ao/app" /><CodigoQr texto="https://livrariaadventista.ao/shop" /></>);
    const [a, b, c] = [...el.querySelectorAll('svg path')].map((p) => p.getAttribute('d'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('AppDownloadPage', () => {
  it('mostra o painel com as ligações das Configurações', async () => {
    settings = { app_android_url: APK };
    const el = await render(<AppDownloadPage />);
    expect(el.querySelector('h1').textContent).toBe('Descarregar a app');
    expect(el.querySelector('a[data-descarregar="android"]').getAttribute('href')).toBe(APK);
  });

  it('dentro do app iOS, só «Já está a usar a app»', async () => {
    settings = { app_android_url: APK, app_ios_url: APP_STORE };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    const el = await render(<AppDownloadPage />);
    expect(el.querySelector('[data-ja-na-app]')).not.toBeNull();
    expect(el.querySelector('a[data-descarregar]')).toBeNull();
  });
});
