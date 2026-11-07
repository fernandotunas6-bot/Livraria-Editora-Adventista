/**
 * Ligações vindas da configuração do site, postas em segurança antes de irem para um `href`.
 *
 * As colunas do rodapé (`site_settings.footer_columns`) são JSON escrito no painel por quem
 * tem a permissão "Configurações", e o rodapé está em quase todas as páginas. O React **não**
 * trava um `href="javascript:…"`: desde a versão 16.9 escreve um aviso na consola a dizer que
 * "uma versão futura do React vai bloquear" — e entretanto rende o atributo tal e qual
 * (verificado com o React 18.3 deste projecto). Quem escrevesse
 *
 *     [{ "title": "Ajuda", "links": [{ "label": "FAQ", "url": "javascript:…" }] }]
 *
 * punha um link desses no rodapé de todas as páginas, incluindo as que um administrador abre.
 *
 * Hoje o CSP (`script-src` sem `unsafe-inline`) trava a execução, por isso não é explorável;
 * isto é a segunda tranca, que é a regra que o resto do projecto segue — o `sanitizeHtml`
 * limita os esquemas, o `safeInternalPath` recusa `//host`, o `emails.ts` tem o `safeUrl`. O
 * rodapé era o sítio que faltava.
 *
 * Aproveita-se para arrumar duas coisas que não são de segurança mas davam links partidos:
 * um endereço `http://` numa página `https://` (conteúdo misto, que o navegador bloqueia) e
 * um link externo marcado como interno, que o React Router tentava tratar como caminho.
 */

/** Esquemas que podem ir para um `href`. Tudo o resto é recusado. */
const ESQUEMAS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * O endereço, se for seguro; `''` se não for.
 *
 * Aceita caminhos do próprio site (`/faq`, `/profile?tab=orders`, `#secao`) e endereços
 * completos em http(s), mailto e tel.
 */
export function safeLinkUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // Caminho do próprio site. `//host` e `/\host` são endereços para fora disfarçados de
  // caminho (é a mesma armadilha que o `safeInternalPath` fecha no regresso do login).
  if (raw.startsWith('/')) {
    return /^\/[/\\]/.test(raw) ? '' : raw;
  }
  if (raw.startsWith('#') || raw.startsWith('?')) return raw;

  try {
    const url = new URL(raw);
    return ESQUEMAS.has(url.protocol.toLowerCase()) ? raw : '';
  } catch {
    // Não é um endereço nem um caminho: nada feito.
    return '';
  }
}

/** O endereço fica dentro do site (um caminho, e não outro domínio)? */
export function isInternalLink(value) {
  const seguro = safeLinkUrl(value);
  return !!seguro && (seguro.startsWith('/') || seguro.startsWith('#') || seguro.startsWith('?'));
}
