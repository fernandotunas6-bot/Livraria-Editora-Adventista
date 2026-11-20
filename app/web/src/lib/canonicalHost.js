// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Um só endereço para a loja: https://livrariaadventista.ao (desde 2026-11-07; antes era o .com).
 *
 * O `www` e o endereço de produção do Cloudflare Pages serviam a loja inteira. Como a sessão,
 * o carrinho e os favoritos ficam guardados por domínio, quem entrava pelo `www` tinha uma
 * sessão e um carrinho à parte (auditoria, 9.6). O `_redirects` do Pages não redirecciona por
 * domínio e o CSP não deixa correr scripts inline, por isso faz-se aqui, no primeiro módulo a
 * correr. O `.com` (com e sem www) passou a endereço antigo: vem para aqui também, para os
 * links já partilhados continuarem a dar na loja. O Cloudflare faz o mesmo com um 301 no
 * servidor (regra de redireccionamento da zona); isto cobre o que a regra ainda não apanhar.
 *
 * Só estes endereços exactos: as pré-visualizações (<ramo>.livraria-editora-adventista-ben.pages.dev)
 * e o localhost ficam como estão. O caminho, a pesquisa e o `#` vão junto — é no `#` que a
 * Google devolve a sessão.
 */
export const CANONICAL_ORIGIN = 'https://livrariaadventista.ao';

const REDIRECT_HOSTS = new Set([
  'www.livrariaadventista.ao',
  'livrariaadventista.com',
  'www.livrariaadventista.com',
  'livraria-editora-adventista-ben.pages.dev',
]);

/** Endereço para onde ir, ou null se este já é o certo. */
export function canonicalRedirect(loc) {
  if (!loc || !REDIRECT_HOSTS.has(String(loc.hostname || '').toLowerCase())) return null;
  return `${CANONICAL_ORIGIN}${loc.pathname || '/'}${loc.search || ''}${loc.hash || ''}`;
}

export const REDIRECTING_TO_CANONICAL = (() => {
  if (typeof window === 'undefined') return false;
  const target = canonicalRedirect(window.location);
  if (!target) return false;
  window.location.replace(target);
  return true;
})();
