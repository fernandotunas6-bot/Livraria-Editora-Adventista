// Funções puras do pós-build de SEO (ver seo-catalogo.mjs): sem rede nem disco, para serem
// testadas no `npm test` (seo-paginas.test.mjs).

/**
 * Endereço escrito no `index.html`, no `sitemap.xml` e no `robots.txt` do repositório; o
 * pós-build troca-o pelo endereço de destino quando este é outro (uma pré-visualização).
 *
 * É o domínio oficial, e não um endereço de trabalho: um build publicado sem o pós-build
 * (outro caminho de deploy, um passo saltado) sai na mesma com o canonical, o og:url e o
 * sitemap certos. Antes era o `livraria-adventista.pages.dev`, um projecto antigo, e um deploy
 * assim dizia à Google que a loja era lá.
 */
export const SOURCE_URL = 'https://livrariaadventista.ao';
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

/**
 * Páginas fixas do sitemap, cada uma com o seu HTML no build (`shop.html`, `faq.html`…).
 *
 * Sem isto, o Cloudflare Pages servia o `index.html` em todas — e o `index.html` diz
 * `<link rel="canonical" href="https://livrariaadventista.ao/">`. Cada uma destas páginas
 * estava no sitemap e, ao mesmo tempo, declarava a página inicial como a versão oficial: a
 * Google junta-as à inicial e não as mostra nos resultados. Com o ficheiro próprio, o Pages
 * serve `/faq` a partir de `faq.html` (como já faz com `product/<id>.html`), com o canonical,
 * o título e a descrição certos, antes de correr qualquer JavaScript.
 *
 * Os títulos e as descrições são os do `<Helmet>` de cada página (mantê-los iguais). O caminho
 * de cada uma tem de estar no `public/sitemap.xml` — há um teste para isso.
 */
export const FIXED_PAGES = [
  { path: '/shop', title: 'Loja', description: 'O catálogo completo da livraria — pesquisa avançada, pré-visualização e compra segura.' },
  { path: '/colecoes', title: 'Coleções', description: `Os livros da ${SITE_NAME} organizados em colecções.` },
  { path: '/lojas', title: 'Lojas físicas', description: 'Moradas, horários, contactos e mapa das lojas da Livraria Adventista em Angola.' },
  { path: '/about', title: 'Sobre Nós', description: `Conheça a ${SITE_NAME} — a nossa missão de difundir literatura cristã e educacional.` },
  { path: '/contact', title: 'Contacto', description: `Entre em contacto com a ${SITE_NAME}. Estamos aqui para ajudar.` },
  { path: '/faq', title: 'FAQ', description: 'Perguntas frequentes sobre encomendas, envios, devoluções e pagamentos.' },
  { path: '/materiais', title: 'Materiais para descarregar', description: 'Revistas, lições e folhetos em PDF para descarregar.' },
  { path: '/comunidade', title: 'Comunidade de Leitores', description: 'Converse com outros leitores sobre livros, a Bíblia e a vida: citações, perguntas e recomendações.' },
  { path: '/shipping-returns', title: 'Envios e Devoluções', description: 'Prazos de entrega, custos de envio em Angola e como devolver um livro.' },
  { path: '/privacidade', title: 'Política de privacidade', description: 'Que dados pessoais tratamos na loja, na comunidade de leitores e no atendimento, com quem os partilhamos e como exercer os seus direitos.' },
];

/** Nome do ficheiro de uma página fixa no build: `/shipping-returns` → `shipping-returns.html`. */
export function fixedPageFile(pagePath) {
  const name = String(pagePath || '').replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`página fixa com caminho inválido: ${pagePath}`);
  return `${name}.html`;
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
