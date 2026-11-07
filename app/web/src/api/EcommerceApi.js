import pb from '@/lib/dataClient';
import { APP_API_URL, mediaUrl, supabase } from '@/lib/supabaseClient';
import { effectivePrice, isSaleActive, variantPrices } from '@/lib/pricing';
import { escapeFilterValue } from '@/lib/sanitizeHtml';
import { getSearchRelevance } from '@/lib/searchUtils';
import { toSiteRelativeUrl } from '@/lib/imageUrl';
import { looksLikeProductCode, normalizeProductCode, variantNames } from '@/lib/productTypes';
import { getRecentlyViewed } from '@/lib/recentlyViewed';
import { sanitizeYoutubeUrl } from '@/lib/youtube';

// Só livros visíveis na loja (quem gere o catálogo também lê os ocultos, mas não os vê na loja).
const VISIBLE = 'active = true';

const CURRENCY = { code: 'AOA', symbol: 'Kz' };

function resolveBookCover(book) {
  if (book.cover) return book.cover;
  if (book.cover_image) {
    try {
      return pb.files.getURL(book, book.cover_image);
    } catch {
      return mediaUrl('stock_books', book.id, book.cover_image);
    }
  }
  return '';
}

export function formatCurrency(amountInCents, currencyInfo = CURRENCY) {
  const amount = amountInCents / 100;
  const symbol = currencyInfo?.symbol || 'Kz';
  return `${symbol} ${amount.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function bookToProduct(book, collectionsMap = {}) {
  const priceInCents = Math.round((Number(book.price) || 0) * 100);
  const onSale = isSaleActive(book);
  const saleInCents = onSale ? Math.round(effectivePrice(book) * 100) : null;
  const stock = Number(book.stock) || 0;
  const variantId = `${book.id}-default`;
  const collectionId = book.collection_id || '';
  const cover = resolveBookCover(book);

  const variant = {
    id: variantId,
    title: 'Standard',
    price_in_cents: priceInCents,
    sale_price_in_cents: saleInCents,
    price_formatted: formatCurrency(priceInCents),
    sale_price_formatted: onSale ? formatCurrency(saleInCents) : null,
    currency_info: CURRENCY,
    inventory_quantity: stock,
    manage_inventory: true,
    image_url: cover || null,
  };

  return {
    id: book.id,
    title: book.title,
    subtitle: book.author || '',
    description: book.description || '',
    image: cover || '',
    images: cover ? [{ url: cover }] : [],
    price_in_cents: priceInCents,
    type: { value: book.genre || 'Geral' },
    purchasable: stock > 0,
    ribbon_text: book.urgency_text || (onSale ? `Promoção −${Math.round((1 - saleInCents / priceInCents) * 100)}%` : book.featured ? 'Destaque' : book.stock_low && stock > 0 ? 'Últimas unidades' : null),
    on_sale: onSale,
    sale_ends_at: onSale ? book.sale_ends_at || null : null,
    active: book.active !== false,
    variants: [variant],
    options: [],
    collections: collectionId && collectionsMap[collectionId]
      ? [{ collection_id: collectionId, title: collectionsMap[collectionId] }]
      : [],
    collection_id: collectionId || null,
    collection_title: collectionsMap[collectionId] || null,
    order: book.year ? Number(book.year) * 1000 : 0,
    // Quando o produto entrou no catálogo. O `order` acima é o ano de publicação, que não é
    // a mesma coisa: um clássico reeditado este mês é novidade da livraria e não de 1950.
    // A ordenação "Novidades" usa esta data (ver lib/productSort.js).
    created: book.created || null,
    updated: book.updated || null,
    // O autor também em campo próprio: o `subtitle` serve para o mostrar no cartão, mas as
    // sugestões e os filtros precisam do nome, não da linha de apresentação.
    author: book.author || '',
    featured: !!book.featured,
    product_type: book.product_type || 'livro',
    book_code: book.book_code || null,
    sku: book.sku || book.book_code || null,
    isbn: book.isbn || null,
    publisher: book.publisher || null,
    language: book.language || null,
    pages: book.pages || null,
    year: book.year || null,
    marketing_hook: book.marketing_hook || null,
    social_proof: book.social_proof || null,
    urgency_text: book.urgency_text || null,
    benefit_bullets: book.benefit_bullets || [],
    target_audience: book.target_audience || null,
    seo_keywords: book.seo_keywords || null,
    author_bio: book.author_bio || null,
    author_photo: book.author_photo || null,
    sample_pages: book.sample_pages || [],
    versions: book.versions || [],
    preview_enabled: !!book.preview_enabled,
    // Vídeo de apresentação (YouTube). Só sai daqui se for um endereço do YouTube que o
    // `lib/youtube.js` reconhece: o que está na base de dados nunca vai directo para um
    // `src` de moldura.
    video_url: sanitizeYoutubeUrl(book.video_url),
    sales_count: Number(book.sales_count) || 0,
    views_count: Number(book.views_count) || 0,
    stock_low: !!book.stock_low,
    stock_alert: !!book.stock_alert,
  };
}

const BOOK_SORT = '-featured,title';

let collectionsCache = null;
let collectionsCacheAt = 0;

async function getCollectionsMap() {
  if (collectionsCache && Date.now() - collectionsCacheAt < 60000) return collectionsCache;
  try {
    const records = await pb.collection('book_collections').getFullList({ sort: 'sort_order' });
    collectionsCache = Object.fromEntries(records.map((c) => [c.id, c.title || c.name || '']));
    collectionsCacheAt = Date.now();
    return collectionsCache;
  } catch {
    return {};
  }
}

/**
 * Leituras do catálogo em curso ou acabadas de fazer, para não as repetir.
 *
 * Medido no navegador, com cada descarga do catálogo contada: **a página inicial pedia o
 * catálogo inteiro três vezes** (o cabeçalho, as prateleiras e o "Mais para si"), a ficha do
 * produto duas e a loja duas. São sete os componentes que chamam `getProducts({})`, e o
 * cabeçalho está em todas as páginas. A auditoria mediu a API a 0,85–1,5 s por pedido a
 * partir de Angola: três descargas dos 102 livros são segundos de espera e de dados pagos
 * pelo visitante, para a mesma lista.
 *
 * Duas coisas, e as duas são precisas:
 *
 * - **`emCurso`** junta os pedidos simultâneos. É o que resolve o caso real: os três
 *   componentes da página inicial pedem no mesmo instante, antes de qualquer resposta
 *   chegar, por isso uma cache por tempo sozinha não apanharia nenhum deles.
 * - **`cache`** cobre quem chega a seguir (descer a página, abrir a folha das categorias,
 *   navegar para outra página do catálogo).
 *
 * `VALIDADE` é curta de propósito. O catálogo muda quando a equipa grava no painel, e o
 * painel não passa por aqui (lê `stock_books` directamente), por isso ninguém fica a ver
 * dados velhos no sítio onde os está a mudar. Para o visitante, meio minuto de atraso num
 * preço é incomparavelmente melhor do que três segundos de espera em cada página — e o
 * checkout recalcula tudo no servidor de qualquer maneira.
 */
const VALIDADE = 60_000;
const cache = new Map();
const emCurso = new Map();

/** Esquece o que está guardado. Para os testes e para quem acabou de gravar. */
export function clearCatalogCache() {
  cache.clear();
  emCurso.clear();
}

async function fetchBooks(options = {}) {
  const limit = Number(options.limit);
  const chave = `${options.featured ? 'destaques' : 'todos'}|${limit > 0 ? limit : 'tudo'}`;

  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.at < VALIDADE) return guardado.valor;
  const aDecorrer = emCurso.get(chave);
  if (aDecorrer) return aDecorrer;

  const ler = (async () => {
    const collectionsMap = await getCollectionsMap();
    const filter = options.featured ? `featured = true && ${VISIBLE}` : VISIBLE;

    let items;
    if (limit > 0) {
      const records = await pb.collection('stock_books').getList(1, limit, {
        sort: BOOK_SORT,
        filter: filter || undefined,
      });
      items = records.items;
    } else {
      items = await pb.collection('stock_books').getFullList({
        sort: BOOK_SORT,
        filter: filter || undefined,
      });
    }
    return { items, collectionsMap, total: items.length };
  })();

  emCurso.set(chave, ler);
  try {
    const valor = await ler;
    cache.set(chave, { valor, at: Date.now() });
    return valor;
  } finally {
    // Um erro não fica guardado: o pedido seguinte tenta outra vez.
    emCurso.delete(chave);
  }
}

function mapSlideRecord(s) {
  return {
    id: s.id,
    title: s.title,
    subtitle: s.subtitle || '',
    // Os slides já gravados têm o endereço completo do projecto antigo; ver toSiteRelativeUrl.
    image: toSiteRelativeUrl(s.image),
    cta_text: s.cta_text || 'Explorar',
    cta_link: s.cta_link || '/shop',
    template: s.template || 'classic',
    book_id: s.book_id || '',
    body_html: s.body_html || '',
    promo_badge: s.promo_badge || '',
    promo_price: s.promo_price ?? null,
    book_cover: toSiteRelativeUrl(s.book_cover || ''),
    book_title: s.book_title || '',
    book_author: s.book_author || '',
    placement: s.placement || 'home',
    is_primary: !!s.is_primary,
    transition: s.transition || 'fade',
    media_type: s.media_type || 'image',
    video_url: toSiteRelativeUrl(s.video_url || ''),
    duration_ms: s.duration_ms ?? null,
    sort_order: s.sort_order ?? 0,
  };
}

function sortSlidesList(slides) {
  return [...slides].sort((a, b) => {
    const ap = a.is_primary ? 1 : 0;
    const bp = b.is_primary ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
  });
}

export async function getHeroSlides(placement = 'home') {
  try {
    const records = await pb.collection('hero_slides').getFullList({
      filter: 'active = true',
      sort: 'sort_order',
    });
    // Quem gere o catálogo também lê os slides agendados; a loja mostra só os que estão no ar.
    const now = Date.now();
    const filtered = records
      .filter((r) => (!r.starts_at || new Date(r.starts_at).getTime() <= now) && (!r.ends_at || new Date(r.ends_at).getTime() > now))
      .map(mapSlideRecord)
      .filter((s) => s.placement === placement || s.placement === 'both' || (!s.placement && placement === 'home'));
    return sortSlidesList(filtered);
  } catch {
    return [];
  }
}

export async function getShopSlides() {
  return getHeroSlides('shop');
}

export async function getProducts(options = {}) {
  const { items, collectionsMap } = await fetchBooks(options);
  return { products: items.map((b) => bookToProduct(b, collectionsMap)), total: items.length };
}

export async function getFeaturedProducts(limit = 8) {
  try {
    const { items, collectionsMap } = await fetchBooks({ limit, featured: true });
    if (items.length > 0) return { products: items.map((b) => bookToProduct(b, collectionsMap)) };
  } catch {
    // fallback
  }
  const { items, collectionsMap } = await fetchBooks({ limit });
  return { products: items.slice(0, limit).map((b) => bookToProduct(b, collectionsMap)) };
}

/** Stock vendável de uma variante: o dela, sem passar o do produto (o `place_order` verifica os dois). */
export function variantStock(book, version) {
  const total = Math.max(0, Math.floor(Number(book?.stock) || 0));
  const raw = version?.stock;
  if (raw === null || raw === undefined || String(raw).trim() === '') return total;
  const own = Number(raw);
  return Number.isFinite(own) ? Math.max(0, Math.min(Math.floor(own), total)) : total;
}

export async function getProduct(id) {
  const book = await pb.collection('stock_books').getOne(id);
  const collectionsMap = await getCollectionsMap();
  const product = bookToProduct(book, collectionsMap);
  // Variantes adicionais definidas no admin
  const extraVersions = Array.isArray(book.versions) ? book.versions : [];
  if (extraVersions.length > 0) {
    product.variants = extraVersions.map((v, i) => {
      // O promocional da variante só conta se for menor que o preço dela e dentro da janela
      // de datas do produto — a mesma regra que o `place_order` cobra (ver lib/pricing.js).
      const { price, sale } = variantPrices(book, v);
      const priceInCents = Math.round(price * 100);
      const saleInCents = sale != null ? Math.round(sale * 100) : null;
      return {
        id: `${book.id}-v${i}`,
        title: v.label || v.title || `${variantNames(book.product_type).one} ${i + 1}`,
        price_in_cents: priceInCents,
        sale_price_in_cents: saleInCents,
        price_formatted: formatCurrency(priceInCents),
        sale_price_formatted: saleInCents != null ? formatCurrency(saleInCents) : null,
        currency_info: CURRENCY,
        // O `place_order` exige stock no produto e na variante: o disponível é o menor dos dois.
        inventory_quantity: variantStock(book, v),
        manage_inventory: true,
        image_url: v.cover || book.cover || null,
        format: v.format || '',
        isbn: v.isbn || '',
      };
    });
  }
  return product;
}

/**
 * Os produtos de uma colecção, pela conversão de sempre (`bookToProduct`).
 *
 * A página das colecções tinha a sua própria conversão, escrita à mão, e isso saía caro:
 *
 * - a variante chamava-se `variant_<id>` em vez de `<id>-default`, e o carrinho tira o id do
 *   livro do id da variante (`bookIdOf`, em `hooks/useCart.jsx`). O id fabricado não batia com
 *   livro nenhum, por isso **tudo o que fosse posto no carrinho a partir de uma colecção
 *   desaparecia na revalidação seguinte**, com a mensagem "já não está disponível";
 * - `inventory_quantity: book.stock || 99` transformava um livro esgotado (stock 0) em 99
 *   unidades, com o botão "Comprar" activo — e a recusa só aparecia no fim do checkout;
 * - não havia preço promocional: um livro em promoção aparecia aqui pelo preço de tabela e na
 *   loja pelo de promoção;
 * - sem descrição, inventava uma ("Este livro é uma leitura excelente que edifica a alma"),
 *   para os 100 livros do catálogo que ainda não têm texto. É o mesmo problema do achado 44.
 */
export async function getCollectionProducts(collectionId) {
  const id = String(collectionId || '').trim();
  if (!id) return [];
  const collectionsMap = await getCollectionsMap();
  const items = await pb.collection('stock_books').getFullList({
    filter: `collection_id = "${escapeFilterValue(id)}" && ${VISIBLE}`,
    sort: BOOK_SORT,
  });
  return items.map((b) => bookToProduct(b, collectionsMap));
}

export async function getCategories() {
  const { items } = await fetchBooks({});
  const seen = new Map();

  items.forEach((book) => {
    const genre = book.genre || 'Geral';
    if (!seen.has(genre.toLowerCase())) {
      seen.set(genre.toLowerCase(), {
        id: genre.toLowerCase().replace(/\s+/g, '-'),
        title: genre,
      });
    }
  });

  return { categories: Array.from(seen.values()) };
}

export async function getBookCollections() {
  try {
    const records = await pb.collection('book_collections').getFullList({ sort: 'sort_order' });
    return records.map((c) => ({
      id: c.id,
      title: c.title || c.name || '',
      slug: c.slug || '',
      description: c.description || '',
      cover: c.cover || '',
    }));
  } catch {
    return [];
  }
}

export async function getProductQuantities({ product_ids = [] }) {
  const variants = [];

  for (const productId of product_ids) {
    try {
      const book = await pb.collection('stock_books').getOne(productId);
      variants.push({
        id: `${book.id}-default`,
        inventory_quantity: Number(book.stock) || 0,
      });
    } catch {
      // ignore
    }
  }

  return { variants };
}

export async function initializeCheckout({
  items, successUrl, customerEmail, customerName,
  phone, address, city, paymentMethod, paymentMethodCode, paymentReference, notes, shippingCost,
  saleChannel, shippingMethod, pickupStore,
  deliveryProvince, deliveryProvinceId, deliveryMunicipality, deliveryMunicipalityId,
  deliveryLocality, deliveryLocalityId, deliveryStreet, deliveryReference, deliveryAddressFull,
  deliveryRelativeName, deliveryRelativePhone, checkoutSignature,
  deliveryGpsLat, deliveryGpsLng,
  idempotencyKey,
  colporteurCode,
}) {
  // A sessão vai no pedido para o servidor ligar a encomenda à conta (`customer_id`): é por
  // ela que o cliente recebe as notificações da encomenda e a vê no centro de atendimento.
  // Sem o cabeçalho, toda a encomenda chegava como anónima, com ou sem sessão iniciada.
  const { data: { session } = {} } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const res = await fetch(`${APP_API_URL}/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      items, successUrl, customerEmail, customerName,
      phone, address, city,
      paymentMethod: paymentMethodCode || paymentMethod,
      paymentMethodCode: paymentMethodCode || paymentMethod,
      paymentReference,
      notes, shippingCost,
      saleChannel: saleChannel || 'web_purchase',
      shippingMethod: shippingMethod || 'delivery',
      pickupStore: pickupStore || '',
      deliveryProvince, deliveryProvinceId, deliveryMunicipality, deliveryMunicipalityId,
      deliveryLocality, deliveryLocalityId, deliveryStreet, deliveryReference, deliveryAddressFull,
      deliveryRelativeName, deliveryRelativePhone,
      checkoutSignature,
      // O carrinho já mandava as coordenadas, mas esta função só reenviava os campos que
      // nomeia, e estes não estavam na lista: nenhuma encomenda chegou a ter GPS.
      deliveryGpsLat, deliveryGpsLng,
      // A mesma em cada repetição da mesma compra: o servidor devolve a encomenda já criada
      // em vez de fazer outra (ver lib/checkoutIdempotency.js).
      ...(idempotencyKey ? { idempotencyKey } : {}),
      // Código do colportor que trouxe a venda (o servidor confirma se é válido).
      ...(colporteurCode ? { colporteurCode } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Não foi possível finalizar a compra.');
  return { url: data.url, orderId: data.orderId, total: data.total, orderNumber: data.orderNumber, order_type: data.order_type, email_queued: data.email_queued, whatsapp_sent: data.whatsapp_sent };
}

export async function subscribeNewsletter(email) {
  const res = await fetch(`${APP_API_URL}/newsletter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Erro na subscrição');
  return data;
}

export async function getLowStockBooks() {
  try {
    const records = await pb.collection('stock_books').getFullList({
      filter: 'stock_alert = true || stock_low = true',
      sort: 'stock',
    });
    return records;
  } catch {
    return [];
  }
}

/**
 * Conta uma visualização do livro (uma vez por sessão do navegador); falhas são ignoradas.
 * Com sessão, o livro fica também no histórico da conta, que alimenta as sugestões em
 * /sugestoes e nos emails (sem sessão, contam os vistos de `lib/recentlyViewed`).
 */
export function trackBookView(bookId) {
  if (!bookId) return;
  const key = `viewed:${bookId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* sem sessionStorage: conta na mesma */ }
  fetch(`${APP_API_URL}/catalog/view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
    },
    body: JSON.stringify({ book_id: bookId }),
    keepalive: true,
  }).catch(() => {});
}

/** Lê livros visíveis pelos ids, pela ordem pedida. */
async function productsByIds(ids) {
  const unique = [...new Set(ids)].slice(0, 60);
  if (!unique.length) return new Map();
  const [{ data, error }, collectionsMap] = await Promise.all([
    supabase.from('stock_books').select('*').in('id', unique).eq('active', true),
    getCollectionsMap(),
  ]);
  if (error) throw error;
  return new Map((data || []).map((b) => [b.id, bookToProduct(b, collectionsMap)]));
}

/**
 * Sugestões para a página /sugestoes: "para si", vistos recentemente e novidades.
 * A ordem vem da Edge Function (desejos, vistos, compras, género); os livros lêem-se aqui.
 */
export async function getRecommendations() {
  const res = await fetch(`${APP_API_URL}/recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
    },
    body: JSON.stringify({ viewed: getRecentlyViewed().map((e) => e.id).filter(Boolean).slice(0, 30) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível carregar as sugestões.');
  const forYou = data.for_you || [];
  const recent = data.recent || [];
  const newest = data.newest || [];
  const map = await productsByIds([...forYou, ...recent, ...newest]);
  const pick = (ids) => ids.map((id) => map.get(id)).filter(Boolean);
  return { personal: !!data.personal, forYou: pick(forYou), recent: pick(recent), newest: pick(newest) };
}

export async function searchProducts(query, limit = 50) {
  const q = query.trim();
  if (!q) return getProducts({ limit });

  // Código de produto escrito de qualquer forma ("liv63", "uni-4"): procura esse código exacto.
  if (looksLikeProductCode(q)) {
    const code = escapeFilterValue(normalizeProductCode(q));
    const exact = await pb.collection('stock_books').getList(1, 1, { filter: `book_code = "${code}" && ${VISIBLE}` });
    if (exact.items.length) {
      const collectionsMap = await getCollectionsMap();
      return { products: exact.items.map((b) => bookToProduct(b, collectionsMap)) };
    }
  }
  const v = escapeFilterValue(q);
  const filter = `(title ~ "${v}" || author ~ "${v}" || genre ~ "${v}" || book_code ~ "${v}" || isbn ~ "${v}") && ${VISIBLE}`;
  // Pede-se um grupo maior do que o pedido e ordena-se por relevância antes de cortar.
  //
  // A base de dados ordena por `-featured,title` e só depois aplica o limite: com `limit` 6
  // (é o que o selector de livros da comunidade usa), os 6 que voltavam eram "os mais
  // destacados, por ordem alfabética" de entre os que combinam — e o livro que a pessoa
  // escreveu podia nem estar lá. A relevância é a mesma da pesquisa do cabeçalho
  // (`getSearchRelevance`): o título ganha ao autor, que ganha ao género.
  const pool = Math.min(Math.max(limit * 5, 30), 200);
  const records = await pb.collection('stock_books').getList(1, pool, { filter, sort: BOOK_SORT });
  const collectionsMap = await getCollectionsMap();
  const products = records.items
    .map((b) => bookToProduct(b, collectionsMap))
    .map((p) => ({ p, r: getSearchRelevance(p, q) }))
    .sort((a, b) => b.r - a.r || String(a.p.title || '').localeCompare(String(b.p.title || ''), 'pt'))
    .slice(0, limit)
    .map(({ p }) => p);
  return { products };
}
