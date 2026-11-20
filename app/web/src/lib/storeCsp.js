// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Política de scripts mais apertada nas páginas da loja (análise crítica de 2026-11-20).
 *
 * O `Content-Security-Policy` do `_headers` serve o site todo e deixa entrar scripts de
 * apis.google.com, accounts.google.com, www.googleapis.com e www.gstatic.com — precisos só no painel
 * (Google Workspace e o selector do Drive). Esses domínios têm endpoints JSONP e bibliotecas antigas
 * que servem para contornar um CSP: se algum dia uma injecção de HTML escapasse ao DOMPurify, um
 * script vindo de lá correria na loja, onde estão as sessões dos clientes.
 *
 * Os navegadores aplicam todas as políticas que a página tiver, e um `<meta http-equiv>` acrescenta
 * uma. Por isso, fora do painel, junta-se esta, só com o que a loja carrega de facto: o próprio site,
 * o beacon do Cloudflare Web Analytics e o Turnstile. Uma política acrescentada só pode apertar, nunca
 * alargar — e também não se tira sem recarregar: quem entra no painel vindo da loja recarrega uma vez
 * (`needsReloadForStaff`), para o painel abrir sem ela.
 */

export const STORE_SCRIPT_POLICY = [
  "script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
  // Sem isto, os workers caíam no script-src desta política (e um `blob:` seria recusado).
  "worker-src 'self' blob:",
].join('; ');

/** O painel (`/admin`, `/gestao`, as moradas antigas `/painel…`) e o domínio do Painel de Gestão. */
export function isStaffPath(pathname, emGestao = false) {
  if (emGestao) return true;
  return /^\/(admin|gestao|painel)(?=$|[/.?#-])/.test(String(pathname || ''));
}

/**
 * Onde a política não entra ao abrir a página: o painel e o perfil. No perfil, a equipa tem os
 * separadores do Google Workspace e dos contactos, que carregam scripts da Google; o perfil não
 * mostra HTML vindo do painel (descrições, slides), que é o que a política protege.
 */
export function isPolicyExempt(pathname, emGestao = false) {
  return isStaffPath(pathname, emGestao) || /^\/profile(?=$|[/?#])/.test(String(pathname || ''));
}

/** O documento tem a política da loja (abriu numa página da loja). */
export const hasStoreScriptPolicy = (doc = document) => !!doc.querySelector('meta[data-politica="loja"]');

/** Junta a política da loja ao documento, antes de qualquer script da página. `true` se a juntou. */
export function applyStoreScriptPolicy({ doc = document, pathname = window.location.pathname, emGestao = false } = {}) {
  if (isPolicyExempt(pathname, emGestao)) return false;
  if (doc.querySelector('meta[data-politica="loja"]')) return true;
  const meta = doc.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = STORE_SCRIPT_POLICY;
  meta.dataset.politica = 'loja';
  doc.head.prepend(meta);
  return true;
}

/** A página tem a política da loja e a pessoa entrou no painel: precisa de recarregar. */
export function needsReloadForStaff(pathname, { emGestao = false, doc = document } = {}) {
  return hasStoreScriptPolicy(doc) && isStaffPath(pathname, emGestao);
}

/** Separadores do perfil que usam os scripts da Google (só a equipa os vê). */
export const GOOGLE_PROFILE_TABS = ['workspace', 'crm'];
