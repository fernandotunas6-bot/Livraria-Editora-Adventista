/**
 * Arranque da sessão e destinos de redireccionamento.
 *
 * O problema que isto resolve: o `authStore` do `dataClient` só conhece a sessão depois de o
 * supabase-js terminar a inicialização (ler o armazenamento, renovar o token ou consumir o
 * `#access_token=…` que a Google devolve). Até lá `isValid` é `false`, e as páginas protegidas
 * mandavam o utilizador para `/login` mesmo com sessão válida — era o que acontecia sempre a
 * seguir ao login com a Google, que volta com a sessão no endereço e não no armazenamento.
 *
 * `createReadyGate()` dá um sinal único de "a sessão já é conhecida" (com ou sem utilizador),
 * para as guardas esperarem em vez de decidirem com informação incompleta.
 */

import { isMissingRoute } from '@/lib/apiCompat';

/** Tempo máximo à espera do arranque da sessão: sem rede, mais vale mostrar o ecrã de entrada. */
export const AUTH_READY_TIMEOUT_MS = 8000;

/**
 * Sinal de uma só passagem. `resolve()` pode ser chamado as vezes que for preciso: só a
 * primeira conta, por isso serve tanto para o primeiro evento de autenticação como para o
 * temporizador de recurso, sem ciclos nem corridas entre os dois.
 */
export function createReadyGate({ timeoutMs = AUTH_READY_TIMEOUT_MS, setTimer = setTimeout } = {}) {
  let done = false;
  const listeners = new Set();

  const gate = {
    get ready() {
      return done;
    },
    resolve() {
      if (done) return false;
      done = true;
      listeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // um ouvinte partido não pode impedir os restantes
        }
      });
      listeners.clear();
      return true;
    },
    /** Avisa quando a sessão passa a ser conhecida; devolve a função que cancela a subscrição. */
    onReady(callback) {
      if (done) {
        callback();
        return () => {};
      }
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };

  if (timeoutMs > 0) setTimer(() => gate.resolve(), timeoutMs);
  return gate;
}

// Caracteres de controlo que alguns navegadores ignoram dentro de um endereço: permitiriam
// esconder `//evil.com` no meio de um caminho que parece interno.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Valida um destino interno antes de lá redireccionar.
 *
 * Aceita só caminhos do próprio site (`/perfil`, `/shop?cat=1`). Recusa endereços absolutos
 * (`https://…`), caminhos sem barra inicial, e `//evil.com` ou `/\evil.com`, que os
 * navegadores tratam como sítio externo. Sem isto, `?redirect=` seria uma porta aberta para
 * levar quem acaba de entrar para fora da loja.
 */
export function safeInternalPath(value, fallback = '/') {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  // `//host` e `/\host` saem do site; `/` sozinho é a página inicial e é válido.
  if (raw.length > 1 && (raw[1] === '/' || raw[1] === '\\')) return fallback;
  if (CONTROL_CHARS.test(raw)) return fallback;
  return raw;
}

/** Caminho actual (com busca e âncora) para voltar ao mesmo sítio depois de entrar. */
export function currentPathWithQuery(location) {
  if (!location) return '/';
  return safeInternalPath(`${location.pathname || '/'}${location.search || ''}${location.hash || ''}`);
}

/**
 * Decide o que fazer numa página protegida.
 *
 * Existe como função separada porque a regra é sempre a mesma (`/admin` e `/profile`) e porque
 * a ordem importa: `wait` tem de vir antes de tudo. Decidir sem esperar era o que mandava para
 * `/login` quem tinha sessão válida mas ainda não lida.
 *
 * - `wait`      — o arranque ainda não sabe se há sessão; não decidir nada
 * - `login`     — não há sessão; pedir autenticação
 * - `forbidden` — há sessão, mas sem a permissão necessária
 * - `allow`     — mostrar a página
 */
export function sessionDecision({ ready, isAuthed, allowed = true }) {
  if (!ready) return 'wait';
  if (!isAuthed) return 'login';
  if (!allowed) return 'forbidden';
  return 'allow';
}

/**
 * O que fazer com cada aviso do Supabase Auth (`onAuthStateChange`).
 *
 * - `signed-in`  — há sessão: carregar o perfil e mostrar a conta
 * - `signed-out` — já não há sessão: limpar
 * - `keep`       — o aviso vem sem sessão, mas a sessão continua guardada: manter a conta à vista
 *
 * O `keep` é o caso de quem abre a app no telemóvel com rede fraca ou sem rede, mais de uma hora
 * depois da última vez. O token de acesso já expirou, a renovação falha por falta de rede, e o
 * supabase-js avisa `INITIAL_SESSION` sem sessão — mas guarda a sessão, para tentar de novo
 * quando a rede voltar (só a apaga, e avisa `SIGNED_OUT`, quando o servidor recusa a renovação).
 * Tratado como "sem sessão", isto tirava a pessoa da conta a cada arranque sem rede: o perfil
 * mandava para `/login` e o perfil em cache era apagado.
 *
 * `stored` é a sessão no armazenamento do navegador, lida no momento do aviso.
 */
export function authEventAction(event, session, stored) {
  if (session?.user) return 'signed-in';
  if (event === 'INITIAL_SESSION' && stored?.refresh_token && stored?.user?.id) return 'keep';
  return 'signed-out';
}

/**
 * O endereço traz o regresso de uma entrada (a sessão da Google no `#access_token=…`, o código
 * de um link de email, um erro)? Nesse caso a sessão guardada pode não ser a que vai ficar, e
 * espera-se pelo supabase-js antes de mostrar a conta.
 */
export function authReturnInUrl(href = '') {
  try {
    const url = new URL(String(href));
    const params = `${url.hash.replace(/^#/, '&')}&${url.search.replace(/^\?/, '')}`;
    return /(^|&)(access_token|refresh_token|code|token_hash|error|error_code)=/.test(params) || /(^|&)type=recovery(&|$)/.test(params);
  } catch {
    return false;
  }
}

// Métodos de entrada no `amr` do token do Supabase. Os da verificação em dois passos (`totp`,
// `mfa/…`) vêm depois do principal e não dizem como a pessoa entrou.
const EMAIL_METHODS = new Set(['password', 'recovery', 'invite', 'email/signup']);

/** Lê o conteúdo de um JWT sem o validar (só para mostrar coisas; quem valida é o servidor). */
function jwtPayload(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Como se entrou nesta sessão: `'email'` (palavra-passe), `'google'` ou `''` (não se sabe).
 * Serve para, da próxima vez, o ecrã de entrada mostrar logo o caminho certo à pessoa.
 */
export function sessionMethod(token) {
  try {
    const amr = jwtPayload(token)?.amr;
    if (!Array.isArray(amr)) return '';
    const primary = amr
      .filter((a) => a && (a.method === 'oauth' || EMAIL_METHODS.has(a.method)))
      .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))[0];
    if (!primary) return '';
    return primary.method === 'oauth' ? 'google' : 'email';
  } catch {
    return '';
  }
}

/**
 * Como acabou a última sessão neste aparelho: `{ reason: 'user' | 'ended', at }`.
 *
 * - `user`  — a pessoa carregou em "Sair" (aqui ou noutro separador);
 * - `ended` — o servidor terminou-a: "Terminar sessão em todos os aparelhos" noutro sítio,
 *   palavra-passe mudada, conta suspensa ou apagada.
 *
 * Enquanto houver esta marca, a app não entra sozinha com a palavra-passe guardada (ver
 * `lib/savedCredentials.js`): sair tem de ser sair. Apaga-se quando volta a haver sessão.
 */
export const SIGN_OUT_KEY = 'livraria_saida';

/** Uma saída pedida pela pessoa conta como dela durante este tempo (os outros separadores
 *  recebem o `SIGNED_OUT` pelo canal do supabase-js uns instantes depois). */
export const USER_SIGN_OUT_WINDOW_MS = 30_000;

export function readSignOut(raw) {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || (v.reason !== 'user' && v.reason !== 'ended')) return null;
    return { reason: v.reason, at: Number(v.at) || 0 };
  } catch {
    return null;
  }
}

/**
 * Um `SIGNED_OUT` que chega com a conta à vista foi pedido pela pessoa ou veio do servidor?
 * Sem uma saída da pessoa nos últimos segundos, foi o servidor que terminou a sessão.
 */
export function signOutReason(previous, now = Date.now()) {
  const last = readSignOut(previous);
  if (last?.reason === 'user' && now - last.at >= 0 && now - last.at < USER_SIGN_OUT_WINDOW_MS) return 'user';
  return 'ended';
}

/** Contas a que já se pediu o email de boas-vindas neste navegador. */
const WELCOME_KEY = 'livraria_welcome_sent';

/** A função publicada ainda não tem `/account/welcome`? Não insistir nesta sessão. */
let missingWelcomeRoute = false;

/**
 * Pede o email de boas-vindas uma vez por conta.
 *
 * O Supabase Auth cria a conta sem passar pela nossa API, por isso não há gancho no servidor
 * para o registo: é o cliente que pede, no primeiro acesso com sessão. A marca local evita
 * pedidos repetidos a cada carregamento, e o servidor tem a palavra final — a chave de
 * idempotência dele garante um só envio mesmo que esta marca se perca (outro navegador,
 * armazenamento limpo).
 */
export async function requestWelcomeEmail(pb, userId) {
  if (!pb || !userId) return false;
  let seen = [];
  try {
    seen = JSON.parse(localStorage.getItem(WELCOME_KEY) || '[]');
    if (seen.includes(userId)) return false;
  } catch {
    seen = [];
  }
  if (missingWelcomeRoute) return false;
  try {
    await pb.send('/account/welcome', { method: 'POST', body: {} });
  } catch (err) {
    // Falhar aqui não pode estragar a entrada na loja: o email é um extra, e o pedido
    // repete-se no acesso seguinte porque a marca só é guardada em caso de sucesso.
    // A excepção é a rota ainda não existir na função publicada: aí não vale a pena voltar
    // a pedir nesta sessão, porque a resposta vai ser a mesma até haver um deploy novo.
    if (isMissingRoute(err)) missingWelcomeRoute = true;
    return false;
  }
  try {
    localStorage.setItem(WELCOME_KEY, JSON.stringify([...seen, userId].slice(-20)));
  } catch {
    // armazenamento indisponível
  }
  return true;
}

/** Contas para as quais este separador já pediu o aviso de novo acesso. */
const SESSION_NOTICE_KEY = 'livraria_session_notice';

/**
 * Pede ao servidor o aviso de novo acesso, uma vez por conta e por sessão do navegador.
 *
 * Quem decide se o aparelho é novo é o servidor (pelo `User-Agent` do pedido e pelos
 * aparelhos que a conta já usou). Aqui só se evita repetir o pedido a cada página aberta.
 * Uma falha não estraga nada: o aviso é um extra, e o pedido repete-se na próxima sessão.
 */
export async function requestSessionNotice(pb, userId) {
  if (!pb || !userId) return false;
  try {
    if (sessionStorage.getItem(SESSION_NOTICE_KEY) === userId) return false;
  } catch {
    // armazenamento indisponível: pede na mesma, o servidor não repete o aviso
  }
  try {
    await pb.send('/account/session-notice', { method: 'POST', body: {} });
  } catch {
    return false;
  }
  try {
    sessionStorage.setItem(SESSION_NOTICE_KEY, userId);
  } catch {
    // armazenamento indisponível
  }
  return true;
}
