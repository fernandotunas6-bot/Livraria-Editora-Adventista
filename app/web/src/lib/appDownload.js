// As apps iOS e Android para descarregar (página /app, docs/APPS.md).
//
// As ligações vêm das Configurações do painel (site_settings.app_android_url e app_ios_url): no
// Android, o APK publicado no GitHub ou a Google Play; no iPhone, a App Store ou o TestFlight.
// Sem ligação, a página oferece a app web (PWA), que já se instalava (lib/pwaInstall.js).
//
// O mesmo filtro das ligações vive no servidor (supabase/functions/app/appLinks.ts): o painel
// escreve o que quiser, mas só uma ligação https chega a um botão.

import { eIos } from '@/lib/pwaInstall';

/** Uma ligação que pode ir num botão: https, sem espaços nem credenciais. Senão, ''. */
export function ligacaoDaApp(valor) {
  const s = String(valor ?? '').trim();
  if (!s || s.length > 500 || /\s/.test(s)) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  return u.href;
}

/** O que a ligação é: 'play', 'apk', 'appstore', 'testflight' ou 'outra'; '' sem ligação. */
export function tipoDeLigacao(valor) {
  const s = ligacaoDaApp(valor);
  if (!s) return '';
  const u = new URL(s);
  const host = u.hostname.toLowerCase();
  if (host === 'play.google.com') return 'play';
  if (host === 'apps.apple.com' || host === 'itunes.apple.com') return 'appstore';
  if (host === 'testflight.apple.com') return 'testflight';
  if (/\.apk$/i.test(u.pathname)) return 'apk';
  return 'outra';
}

/** O aparelho de quem visita: 'android', 'ios' ou 'outro' (computador). */
export function aparelhoDe(ua = '', toques = 0) {
  if (eIos(ua, toques)) return 'ios';
  if (/Android/i.test(String(ua))) return 'android';
  return 'outro';
}

/** O texto do botão, em duas linhas como nos das lojas: a pequena por cima, o nome por baixo. */
const TEXTO_DO_BOTAO = {
  play: ['Disponível no', 'Google Play'],
  apk: ['Descarregar para', 'Android'],
  appstore: ['Descarregar na', 'App Store'],
  testflight: ['Experimentar no', 'TestFlight'],
};

/**
 * As apps que a loja tem para descarregar: `{ android, ios }`, cada uma
 * `{ url, tipo, linhas: [cima, baixo], botao }` (`botao` é o texto inteiro), ou null sem ligação
 * (ou com uma ligação que não serve).
 */
export function appsParaDescarregar(settings) {
  const uma = (valor, porOmissao) => {
    const url = ligacaoDaApp(valor);
    if (!url) return null;
    const tipo = tipoDeLigacao(url);
    const linhas = TEXTO_DO_BOTAO[tipo] || porOmissao;
    return { url, tipo, linhas, botao: linhas.join(' ') };
  };
  return {
    android: uma(settings?.app_android_url, ['Descarregar para', 'Android']),
    ios: uma(settings?.app_ios_url, ['Descarregar para', 'iPhone']),
  };
}
