// Entrar com a Google e com a Apple dentro do app iOS (lib/nativeApp.js, docs/APP_IOS.md).
//
// · Google: a Google recusa o login dentro de um WKWebView. Pede-se o endereço ao Supabase sem
//   sair da página (`skipBrowserRedirect`), abre-se na folha de login do sistema (WebAuthPlugin)
//   e o regresso a `ao.livrariaadventista.app://auth/callback` traz a sessão: um `code` (PKCE) ou
//   os tokens depois do `#` (fluxo implícito, o do site).
// · Apple: a folha nativa dá um token de identidade, que o Supabase troca por uma sessão
//   (`signInWithIdToken`). A Apple só dá o nome na primeira vez: se o perfil não tiver nome,
//   fica com esse.
//
// Nos dois casos a sessão chega pelo mesmo `onAuthStateChange` do resto do site (lib/dataClient.js),
// que lê o perfil; aqui espera-se por ele para devolver a conta a quem chamou.

import pb from '@/lib/dataClient';
import { supabase } from '@/lib/supabaseClient';
import { ESQUEMA_DO_APP, REGRESSO_DO_LOGIN, eRegressoDoLogin, pluginAppleSignIn, pluginWebAuth } from '@/lib/nativeApp';

/** A pessoa fechou a folha de login: não é um erro a mostrar. */
export const LOGIN_CANCELADO = 'CANCELLED';
export const foiCancelado = (err) => err?.code === LOGIN_CANCELADO;

/**
 * O que veio no endereço de regresso do login: `{ code }`, `{ access_token, refresh_token }` ou
 * `{ error }`. Endereços que não são o regresso dão `{ error }`.
 */
export function lerRegressoDoLogin(url) {
  if (!eRegressoDoLogin(url)) return { error: 'O login voltou por um endereço desconhecido.' };
  const s = String(url);
  const hashAt = s.indexOf('#');
  const queryAt = s.indexOf('?');
  const query = new URLSearchParams(queryAt >= 0 ? s.slice(queryAt + 1, hashAt >= 0 && hashAt > queryAt ? hashAt : undefined) : '');
  const hash = new URLSearchParams(hashAt >= 0 ? s.slice(hashAt + 1) : '');
  const erro = query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error');
  if (erro) return { error: erro.replace(/\+/g, ' ') };
  const code = query.get('code');
  if (code) return { code };
  const access = hash.get('access_token');
  const refresh = hash.get('refresh_token');
  if (access && refresh) return { access_token: access, refresh_token: refresh };
  return { error: 'O login voltou sem sessão.' };
}

/** Espera que o site tenha a conta desta sessão (o perfil é lido a seguir ao `SIGNED_IN`). */
export function esperarConta(userId, ms = 15000) {
  const pronta = () => pb.authStore.isValid && pb.authStore.record?.id === userId;
  if (pronta()) return Promise.resolve(pb.authStore.record);
  return new Promise((resolve, reject) => {
    let off = () => {};
    const t = setTimeout(() => { off(); reject(new Error('A sessão não abriu. Tente outra vez.')); }, ms);
    off = pb.authStore.onChange(() => {
      if (!pronta()) return;
      clearTimeout(t);
      off();
      resolve(pb.authStore.record);
    });
  });
}

/** Cria a sessão a partir do endereço de regresso. Devolve o utilizador do Supabase. */
export async function concluirRegressoDoLogin(url) {
  const r = lerRegressoDoLogin(url);
  if (r.error) throw new Error(r.error);
  const { data, error } = r.code
    ? await supabase.auth.exchangeCodeForSession(r.code)
    : await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
  if (error) throw error;
  if (!data?.user?.id) throw new Error('O login voltou sem sessão.');
  return data.user;
}

/** Google dentro do app. Devolve `{ record }` com a conta já aberta. */
export async function entrarComGoogleNoApp({ queryParams } = {}) {
  const webAuth = await pluginWebAuth();
  if (!webAuth) throw new Error('O login com a Google não está disponível nesta versão da app.');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REGRESSO_DO_LOGIN, skipBrowserRedirect: true, ...(queryParams ? { queryParams } : {}) },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('A Google não respondeu. Tente outra vez.');
  const { url } = await webAuth.start({ url: data.url, scheme: ESQUEMA_DO_APP });
  const user = await concluirRegressoDoLogin(url);
  return { record: await esperarConta(user.id) };
}

const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/** Um nonce aleatório e o seu SHA-256 (a Apple recebe o SHA-256; o Supabase, o original). */
export async function novoNonce() {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
  return { nonce, hash };
}

/** «Iniciar sessão com a Apple» dentro do app. Devolve `{ record }` com a conta já aberta. */
export async function entrarComApple() {
  const apple = await pluginAppleSignIn();
  if (!apple) throw new Error('Iniciar sessão com a Apple só está disponível na app para iPhone e iPad.');
  const { nonce, hash } = await novoNonce();
  const resposta = await apple.authorize({ nonce: hash });
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: resposta.identityToken, nonce });
  if (error) throw error;
  let record = await esperarConta(data.user.id);
  const nome = [resposta.givenName, resposta.familyName].filter(Boolean).join(' ').trim();
  if (nome && !String(record?.name || '').trim()) {
    try {
      record = await pb.collection('users').update(record.id, { name: nome });
    } catch {
      // Sem o nome a conta funciona na mesma; muda-se no perfil.
    }
  }
  return { record };
}
