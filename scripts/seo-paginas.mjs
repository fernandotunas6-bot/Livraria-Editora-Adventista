// Funções puras do pós-build de SEO (ver seo-catalogo.mjs): sem rede nem disco, para serem
// testadas no `npm test` (seo-paginas.test.mjs).

/** Endereço em que o build é feito; o pós-build troca-o pelo endereço de destino. */
export const SOURCE_URL = 'https://livraria-adventista.pages.dev';
export const SITE_NAME = 'Livraria Adventista';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Ids do catálogo (15 caracteres, PocketBase) e slugs das colecções: o que pode ser nome de ficheiro. */
export const isSafeId = (value) => /^[a-z0-9]{1,64}$/i.test(String(value || ''));
export const isSafeSlug = (value) => /^[a-z0-9][a-z0-9-]{0,99}$/i.test(String(value || ''));

/** Texto simples de uma descrição em HTML (o editor do painel grava HTML), cortado numa palavra. */
export function plainSummary(html, max = 160) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

/**
 * Etiquetas de partilha de uma página, a partir do `index.html` do build.
 *
 * Cada etiqueta tem de existir exactamente uma vez: se o `index.html` mudar e uma deixar de
 * bater, é preferível rebentar aqui (o pós-build avisa e não gera páginas) do que publicar
 * páginas com a etiqueta genérica da loja.
 */
export function renderSharePage(indexHtml, { title, description, image, url, type = 'website', imageAlt = '' }) {
  let html = indexHtml;
  const set = (pattern, replacement, label) => {
    const matches = html.match(pattern);
    if (!matches || matches.length !== 1) throw new Error(`index.html: etiqueta ${label} encontrada ${matches ? matches.length : 0} vezes`);
    html = html.replace(pattern, replacement);
  };
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  set(/<title>[^<]*<\/title>/g, `<title>${t} — ${SITE_NAME}</title>`, '<title>');
  set(/<meta name="description" content="[^"]*" \/>/g, `<meta name="description" content="${d}" />`, 'description');
  set(/<link rel="canonical" href="[^"]*" \/>/g, `<link rel="canonical" href="${u}" />`, 'canonical');
  set(/<meta property="og:type" content="[^"]*" \/>/g, `<meta property="og:type" content="${escapeHtml(type)}" />`, 'og:type');
  set(/<meta property="og:title" content="[^"]*" \/>/g, `<meta property="og:title" content="${t}" />`, 'og:title');
  set(/<meta property="og:description" content="[^"]*" \/>/g, `<meta property="og:description" content="${d}" />`, 'og:description');
  set(/<meta property="og:url" content="[^"]*" \/>/g, `<meta property="og:url" content="${u}" />`, 'og:url');
  set(/<meta name="twitter:title" content="[^"]*" \/>/g, `<meta name="twitter:title" content="${t}" />`, 'twitter:title');
  set(/<meta name="twitter:description" content="[^"]*" \/>/g, `<meta name="twitter:description" content="${d}" />`, 'twitter:description');
  if (image) {
    const i = escapeHtml(image);
    set(/<meta property="og:image" content="[^"]*" \/>/g, `<meta property="og:image" content="${i}" />`, 'og:image');
    set(/<meta name="twitter:image" content="[^"]*" \/>/g, `<meta name="twitter:image" content="${i}" />`, 'twitter:image');
    // As medidas e a legenda eram as da imagem genérica (1200×630); uma capa é vertical e de
    // tamanho variável — medidas erradas fazem o WhatsApp desenhar a pré-visualização mal.
    set(/\s*<meta property="og:image:width" content="[^"]*" \/>/g, '', 'og:image:width');
    set(/\s*<meta property="og:image:height" content="[^"]*" \/>/g, '', 'og:image:height');
    set(/<meta property="og:image:alt" content="[^"]*" \/>/g, `<meta property="og:image:alt" content="${escapeHtml(imageAlt || title)}" />`, 'og:image:alt');
    // Capa vertical: o cartão grande do X cortava-a ao meio.
    set(/<meta name="twitter:card" content="[^"]*" \/>/g, '<meta name="twitter:card" content="summary" />', 'twitter:card');
  }
  return html;
}

/** Descrição de partilha de um livro: a sinopse, ou uma frase com o autor quando não há. */
export function bookShareDescription(book) {
  const summary = plainSummary(book?.description);
  if (summary) return summary;
  const author = String(book?.author || '').trim();
  return author
    ? `${book.title}, de ${author}. À venda na ${SITE_NAME}, com entrega em Angola e levantamento nas lojas.`
    : `${book?.title || 'Livro'}. À venda na ${SITE_NAME}, com entrega em Angola e levantamento nas lojas.`;
}

export function sitemapEntry(loc, lastmod, changefreq, priority) {
  return `  <url><loc>${escapeHtml(loc)}</loc>${lastmod ? `<lastmod>${String(lastmod).slice(0, 10)}</lastmod>` : ''}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

/** Troca o endereço de origem pelo de destino; recusa se o ficheiro já não o tiver. */
export function rewriteSiteUrl(text, siteUrl, label = 'ficheiro') {
  const target = String(siteUrl).replace(/\/$/, '');
  if (target === SOURCE_URL) return text;
  if (!text.includes(SOURCE_URL)) throw new Error(`${label} não tem ${SOURCE_URL}: o build mudou e o pós-build tem de ser revisto.`);
  return text.split(SOURCE_URL).join(target);
}
