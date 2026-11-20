// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Erros com que o Supabase Auth devolve o utilizador ao site.
 *
 * Quando um link de email expira ou já foi usado, ou quando a entrada com a Google falha ou é
 * cancelada, o Supabase redirecciona para o site com o erro no endereço:
 *   /login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid…
 * (no `#` no fluxo implícito, no `?` em alguns erros do OAuth). Antes ninguém o lia: o `/login`
 * mostrava o formulário como se nada fosse e o cliente não sabia porque não tinha entrado.
 */

const MESSAGES = {
  otp_expired: 'O link do email expirou ou já foi usado. Peça um novo.',
  flow_state_expired: 'A entrada demorou de mais e expirou. Tente outra vez.',
  flow_state_not_found: 'A entrada demorou de mais e expirou. Tente outra vez.',
  bad_oauth_state: 'A entrada com a Google não foi concluída. Tente outra vez.',
  bad_oauth_callback: 'A entrada com a Google não foi concluída. Tente outra vez.',
  oauth_provider_not_supported: 'A entrada com a Google não está disponível de momento.',
  provider_disabled: 'A entrada com a Google não está disponível de momento.',
  signup_disabled: 'De momento não é possível criar contas novas.',
  user_banned: 'Esta conta está suspensa. Fale connosco para saber mais.',
  email_address_not_authorized: 'Não foi possível enviar o email para este endereço. Fale connosco.',
  identity_already_exists: 'Esta conta Google já está ligada a outro utilizador.',
  provider_email_needs_verification: 'Confirme o email da sua conta Google e tente outra vez.',
};

const FALLBACK = 'Não foi possível concluir a entrada. Tente outra vez.';

/** Lê o erro de um endereço (hash ou query). Devolve null quando não há erro. */
export function readAuthRedirectError(href) {
  let url;
  try { url = new URL(String(href || '')); } catch { return null; }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const query = url.searchParams;
  const pick = (k) => hash.get(k) || query.get(k) || '';
  const error = pick('error');
  const code = pick('error_code');
  if (!error && !code) return null;
  const description = pick('error_description');
  let message = MESSAGES[code];
  // Cancelar no ecrã da Google chega como access_denied sem código, ou com a descrição a dizê-lo.
  if (!message && error === 'access_denied') {
    message = /expired|invalid/i.test(description)
      ? MESSAGES.otp_expired
      : 'A entrada com a Google foi cancelada.';
  }
  return { error, code, description, message: message || FALLBACK };
}

const AUTH_PARAMS = ['error', 'error_code', 'error_description', 'sb'];

/** O mesmo endereço sem os parâmetros de erro (para não voltar a mostrar a mensagem). */
export function withoutAuthError(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  AUTH_PARAMS.forEach((k) => { hash.delete(k); url.searchParams.delete(k); });
  const rest = hash.toString();
  url.hash = rest ? `#${rest}` : '';
  return url.pathname + url.search + url.hash;
}

/** Capturado no arranque, antes de alguém limpar o endereço. */
export const AUTH_REDIRECT_ERROR = typeof window !== 'undefined'
  ? readAuthRedirectError(window.location.href)
  : null;
