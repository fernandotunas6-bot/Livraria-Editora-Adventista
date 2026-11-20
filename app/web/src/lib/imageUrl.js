// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Normaliza URLs de imagem — inclui links partilhados do Google Drive.
 */
import SLIDE_VARIANTS from './slideVariants.json';
export function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

// Endereços onde o próprio site já foi ou vai ser servido: os dois projectos do Cloudflare
// Pages (e as pré-visualizações por ramo, `<ramo>.livraria-adventista.pages.dev`) — o novo
// serve-se em `livraria-editora-adventista-ben.pages.dev`, com o sufixo que o Cloudflare lhe
// acrescentou — e os domínios próprios, o `.ao` (oficial desde 2026-11-07) e o `.com` (antigo,
// a redireccionar para o `.ao`). Uma imagem guardada com um destes endereços é um ficheiro do site, e tem
// de ficar como caminho relativo: com o endereço completo, a mudança de projecto ou de
// domínio tornava-a um pedido a outra origem, que o CSP (`img-src 'self'`) bloqueia — e
// desligar o projecto antigo apagava-a de vez.
const OWN_SITE_HOST = /^(?:[a-z0-9-]+\.)?livraria-(?:editora-)?adventista(?:-ben)?\.pages\.dev$|^(?:www\.)?livrariaadventista\.(?:com|ao)$/i;

/** `https://livraria-adventista.pages.dev/images/x.webp` → `/images/x.webp`; o resto fica igual. */
export function toSiteRelativeUrl(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url || '';
  try {
    const u = new URL(url);
    return OWN_SITE_HOST.test(u.hostname) ? `${u.pathname}${u.search}${u.hash}` : url;
  } catch {
    return url;
  }
}

/** Caminho do próprio site (`/images/…`), não um URL sem protocolo (`//outro.site/…`). */
const isSitePath = (s) => s.startsWith('/') && !s.startsWith('//');

export function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:')) return trimmed;

  const driveId = extractDriveFileId(trimmed);
  if (driveId) {
    return `https://drive.google.com/uc?export=view&id=${driveId}`;
  }

  if (/^https?:\/\//i.test(trimmed)) return toSiteRelativeUrl(trimmed);
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

export function isPersistableImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const n = normalizeImageUrl(url);
  return (/^https?:\/\//i.test(n) || isSitePath(n)) && !n.startsWith('blob:');
}

/** URL pronta para guardar na base de dados (sem blob:). */
export function sanitizeImageUrlForSave(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('blob:')) return '';
  const normalized = normalizeImageUrl(url);
  return isPersistableImageUrl(normalized) ? normalized : '';
}

export function withCacheBust(url, version) {
  if (!url || !version) return url || '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(version)}`;
}

// Slides com variantes de 960 e 1280 px (geradas por scripts/imagens/variantes.py, que escreve a
// lista; as larguras são as mesmas do script).
const SLIDES_REDUZIDOS = new Set(SLIDE_VARIANTS);
const LARGURAS = [960, 1280];

/**
 * `srcset` de um slide do próprio site: as variantes de 960 e 1280 px para os telemóveis e o
 * original de 1920 px para os ecrãs grandes. Vazio para o resto (imagens carregadas no painel,
 * Drive, Supabase), que ficam só com o `src`.
 */
export function siteSrcSet(url) {
  const path = toSiteRelativeUrl(url || '').split(/[?#]/)[0];
  if (!SLIDES_REDUZIDOS.has(path)) return '';
  const reduzidas = LARGURAS.map((w) => `${path.replace(/^\/images\/site\//, `/images/site/${w}/`)} ${w}w`);
  return [...reduzidas, `${path} 1920w`].join(', ');
}
