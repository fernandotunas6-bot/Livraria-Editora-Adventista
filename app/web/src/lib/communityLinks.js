/**
 * Links nas publicações da comunidade. Só `http` e `https`: um `javascript:` ou `data:` numa
 * publicação seria execução de código no browser de quem lê.
 */
export const MAX_LINKS = 5;
const MAX_URL = 500;

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
    const href = safeHref(typeof item === 'string' ? item : item?.url);
    if (!href || seen.has(href)) continue;
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
    if (!href) continue;
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'link', href, label: candidate });
    last = m.index + candidate.length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}
