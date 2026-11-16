import { describe, expect, it } from 'vitest';
import { aparelhoDe, appsParaDescarregar, ligacaoDaApp, tipoDeLigacao } from './appDownload';

const APK = 'https://github.com/fernandotunas6-bot/Livraria-Editora-Adventista/releases/latest/download/livraria-adventista.apk';

describe('ligacaoDaApp', () => {
  it('só uma ligação https chega a um botão', () => {
    expect(ligacaoDaApp(` ${APK} `)).toBe(APK);
    expect(ligacaoDaApp('https://apps.apple.com/ao/app/livraria-adventista/id1234567890')).toContain('apps.apple.com');
    for (const ma of ['', null, undefined, 'livraria.apk', 'http://exemplo.ao/app.apk', 'javascript:alert(1)', 'https://a b.ao/x',
      'https://utilizador:senha@exemplo.ao/app.apk', 'ao.livrariaadventista.app://auth', `https://exemplo.ao/${'a'.repeat(500)}`]) {
      expect(ligacaoDaApp(ma), String(ma)).toBe('');
    }
  });
});

describe('tipoDeLigacao', () => {
  it('distingue as lojas, o TestFlight e o APK', () => {
    expect(tipoDeLigacao('https://play.google.com/store/apps/details?id=ao.livrariaadventista.app')).toBe('play');
    expect(tipoDeLigacao(APK)).toBe('apk');
    expect(tipoDeLigacao('https://exemplo.ao/app/Livraria.APK?v=2')).toBe('apk');
    expect(tipoDeLigacao('https://apps.apple.com/ao/app/livraria-adventista/id1234567890')).toBe('appstore');
    expect(tipoDeLigacao('https://testflight.apple.com/join/AbCd1234')).toBe('testflight');
    expect(tipoDeLigacao('https://exemplo.ao/descarregar')).toBe('outra');
    expect(tipoDeLigacao('http://play.google.com/x')).toBe('');
    // Só o endereço da loja conta, não um que o imite.
    expect(tipoDeLigacao('https://play.google.com.exemplo.ao/x')).toBe('outra');
  });
});

describe('aparelhoDe', () => {
  it('Android, iPhone e iPad (que se diz Macintosh), e o computador', () => {
    expect(aparelhoDe('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile', 5)).toBe('android');
    expect(aparelhoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari', 5)).toBe('ios');
    expect(aparelhoDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe('ios');
    expect(aparelhoDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe('outro');
    expect(aparelhoDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', 0)).toBe('outro');
    expect(aparelhoDe()).toBe('outro');
  });
});

describe('appsParaDescarregar', () => {
  it('sem ligações não há apps: a página oferece a app web', () => {
    expect(appsParaDescarregar({})).toEqual({ android: null, ios: null });
    expect(appsParaDescarregar(null)).toEqual({ android: null, ios: null });
    expect(appsParaDescarregar({ app_android_url: 'javascript:alert(1)', app_ios_url: '   ' })).toEqual({ android: null, ios: null });
  });

  it('o botão diz para onde leva', () => {
    const apps = appsParaDescarregar({ app_android_url: APK, app_ios_url: 'https://testflight.apple.com/join/AbCd1234' });
    expect(apps.android).toEqual({ url: APK, tipo: 'apk', linhas: ['Descarregar para', 'Android'], botao: 'Descarregar para Android' });
    expect(apps.ios).toEqual({
      url: 'https://testflight.apple.com/join/AbCd1234', tipo: 'testflight', linhas: ['Experimentar no', 'TestFlight'], botao: 'Experimentar no TestFlight',
    });
    expect(appsParaDescarregar({ app_android_url: 'https://play.google.com/store/apps/details?id=x' }).android.botao).toBe('Disponível no Google Play');
    expect(appsParaDescarregar({ app_ios_url: 'https://apps.apple.com/ao/app/x/id1' }).ios.botao).toBe('Descarregar na App Store');
    expect(appsParaDescarregar({ app_ios_url: 'https://exemplo.ao/iphone' }).ios.botao).toBe('Descarregar para iPhone');
  });
});
