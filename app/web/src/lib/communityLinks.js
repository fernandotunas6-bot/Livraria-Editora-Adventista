// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Links nas publicações da comunidade. Só `http` e `https`: um `javascript:` ou `data:` numa
 * publicação seria execução de código no browser de quem lê. E nada de conteúdo adulto nem de
 * sites perigosos (`linkProblem`), as mesmas regras de private.community_link_problem.
 */
import { BLOCKED_ADULT, BLOCKED_MALICIOUS, BLOCKED_SHORTENERS } from './communityBlocklist';

export const MAX_LINKS = 5;
const MAX_URL = 500;

const ADULT = 'Links para conteúdo adulto não são permitidos na comunidade.';
// No nome do site: em qualquer parte, as palavras que não têm outro sentido; como palavra
// inteira (entre pontos e hífenes) as que fazem parte de outras ("sex" está em "sussex").
const ADULT_IN_HOST = /(porn|xvideo|xnxx|xhamster|hentai|onlyfans|brazzers|chaturbate|redtube|youporn|spankbang|stripchat|bongacams|livejasmin|camsoda|eporner|tnaflix|rule34|fapello|redgifs|fansly|xxx|nsfw|camgirl|sexcam|livesex|camsex)/;
const ADULT_HOST_WORDS = new Set(['sex', 'sexy', 'sexo', 'porno', 'nude', 'nudes', 'nudez', 'escort', 'escorts', 'milf',
  'fetish', 'fetiche', 'erotic', 'erotica', 'erotico', 'putaria', 'puta', 'putas', 'safada', 'safadas']);
const ADULT_PATH_WORDS = new Set(['xxx', 'nsfw', 'hentai', 'onlyfans', 'xvideos', 'xnxx', 'pornhub', 'porno']);
const EXECUTABLE = /\.(exe|msi|bat|cmd|scr|pif|vbs|vbe|jse|wsf|ps1|apk|xapk|dmg|pkg|jar|lnk|hta|cpl|reg)$/;
const BLOCKED = new Map([
  ...BLOCKED_ADULT.map((d) => [d, ADULT]),
  ...BLOCKED_SHORTENERS.map((d) => [d, 'Links encurtados não são permitidos: escreva o endereço completo do site.']),
  ...BLOCKED_MALICIOUS.map((d) => [d, 'Este site foi marcado como perigoso e não pode ser publicado.']),
]);
const VALID_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Motivo por que o link não pode ir para a comunidade, ou `''` se pode. */
export function linkProblem(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_URL || !/^https?:\/\/[^\s<>"']+$/i.test(text)) return 'Link inválido: só endereços http ou https.';
  const authority = (text.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1] || '').toLowerCase();
  if (authority.includes('@')) return 'Link inválido: endereços com utilizador ou palavra-passe não são permitidos.';
  if (/:[0-9]*$/.test(authority) && !/:(80|443)$/.test(authority)) return 'Links com número de porta (como :8080) não são permitidos.';
  const host = authority.replace(/:[0-9]*$/, '').replace(/\.+$/, '');
  if (!host || host.startsWith('[') || /^[0-9.]+$/.test(host)) return 'Links para endereços IP não são permitidos: use o nome do site.';
  if (/(^|\.)xn--/.test(host)) return 'Sites com letras disfarçadas (xn--) não são permitidos.';
  if (!VALID_HOST.test(host)) return 'Link inválido: o nome do site não é válido.';
  const tld = host.slice(host.lastIndexOf('.') + 1);
  if (['xxx', 'porn', 'sex', 'adult'].includes(tld)) return ADULT;
  if (tld === 'zip' || tld === 'mov') return 'Sites .zip e .mov não são permitidos: confundem-se com ficheiros.';
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    const reason = BLOCKED.get(labels.slice(i).join('.'));
    if (reason) return reason;
  }
  if (ADULT_IN_HOST.test(host) || host.split(/[.-]/).some((w) => ADULT_HOST_WORDS.has(w))) return ADULT;
  const rest = text.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').toLowerCase();
  if (rest.split(/[^a-z0-9]+/).some((w) => ADULT_PATH_WORDS.has(w))) return ADULT;
  if (EXECUTABLE.test(rest.split('?')[0].split('#')[0])) return 'Links para programas e ficheiros executáveis (.exe, .apk…) não são permitidos.';
  return '';
}

/** Endereço seguro para `href`, ou `''` se não for http(s). */
export function safeHref(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > MAX_URL) return '';
  try {
    const u = new URL(text);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (u.username || u.password) return '';
    return u.href;
  } catch {
    return '';
  }
}

/** Domínio para mostrar ao lado do link (sem `www.`), ou `''`. */
export function linkHost(value) {
  const href = safeHref(value);
  if (!href) return '';
  return new URL(href).hostname.replace(/^www\./, '');
}

/** Links encontrados no texto, sem repetir, até `limit`. Só os que são seguros. */
export function extractLinks(text, limit = MAX_LINKS) {
  const found = String(text ?? '').match(/https?:\/\/[^\s<>"']+/gi) || [];
  const seen = new Set();
  const out = [];
  for (const raw of found) {
    // Pontuação colada ao fim ("…aqui.") não faz parte do endereço.
    const href = safeHref(raw.replace(/[.,;:!?)\]]+$/, ''));
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= limit) break;
  }
  return out;
}

/** Valida a lista de links que vai para a base de dados. Devolve só os seguros, sem repetir. */
export function cleanLinks(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const raw = typeof item === 'string' ? item : item?.url;
    const href = safeHref(raw);
    if (!href || linkProblem(raw) || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

/**
 * Texto de uma publicação partido em pedaços, com os links seguros à parte, para o React os
 * mostrar como `<a>` sem `dangerouslySetInnerHTML`. Um link inseguro fica como texto.
 */
export function linkifySegments(text) {
  const value = String(text ?? '');
  const out = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m;
  while ((m = re.exec(value))) {
    const raw = m[0];
    const trail = raw.match(/[.,;:!?)\]]+$/)?.[0] || '';
    const candidate = trail ? raw.slice(0, -trail.length) : raw;
    const href = safeHref(candidate);
    // Um link que as regras recusam (publicado antes delas) fica como texto, sem ser clicável.
    if (!href || linkProblem(candidate)) continue;
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'link', href, label: candidate });
    last = m.index + candidate.length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}
