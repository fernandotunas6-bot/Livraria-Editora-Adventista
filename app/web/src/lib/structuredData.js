// Dados estruturados (schema.org, em JSON-LD) da ficha de cada produto e das lojas físicas.
//
// Para que serve: a Google lê o preço, a disponibilidade, o autor e o caminho (Início › Loja ›
// género) e pode mostrá-los nos resultados, em vez de uma linha de texto solto. O `index.html`
// já diz quem é a loja (Organization e WebSite); isto acrescenta o produto da página.
//
// Funções puras, sem React nem rede, para os testes. A página passa o produto tal como vem de
// `api/EcommerceApi.js` (preços em cêntimos, `images: [{ url }]`, `purchasable`…).

import { localDigits } from '@/lib/angolaPhone';
import { CANONICAL_ORIGIN } from '@/lib/canonicalHost';
import { hasCoords, storeGallery } from '@/lib/stores';

export const SCHEMA_CURRENCY = 'AOA';
const SELLER = 'Livraria Adventista';

// A base de dados guarda o idioma por extenso ("Português"); o schema.org pede o código.
const LANGUAGE_CODES = {
  portugues: 'pt', portuguese: 'pt', ingles: 'en', english: 'en', frances: 'fr', francais: 'fr',
  french: 'fr', espanhol: 'es', spanish: 'es', umbundu: 'umb', kimbundu: 'kmb', kikongo: 'kg',
};

const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Código do idioma (BCP 47) a partir do nome que está na base de dados; `null` se não o conhecer. */
export function languageCode(value) {
  const raw = String(value || '').trim();
  if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(raw)) return raw;
  return LANGUAGE_CODES[fold(raw)] || null;
}

/** Texto simples de uma descrição em HTML (o editor do painel grava HTML). */
export function plainText(html, max = 5000) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]))
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function absoluteUrl(url, origin) {
  const value = String(url || '').trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return `${origin}${value}`;
  return '';
}

/** ISBN-13 válido (só dígitos, com o dígito de controlo certo), ou `null`. */
export function isbn13(value) {
  const digits = String(value || '').replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) return null;
  const sum = [...digits.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : null;
}

const price = (cents) => (Number(cents) > 0 ? (Number(cents) / 100).toFixed(2) : null);
const dateOnly = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
};

/**
 * O produto da página, como `Product` (e também `Book` quando é um livro, uma Bíblia ou uma
 * revista: `isBook` vem de `lib/productTypes.js`). Sem preço, sai sem `offers`: a Google
 * prefere nenhuma oferta a uma oferta errada.
 */
export function productJsonLd(product, { origin, variant, isBook = false } = {}) {
  if (!product?.id || !product?.title || !origin) return null;
  const url = `${origin}/product/${encodeURIComponent(product.id)}`;
  const chosen = variant || product.variants?.[0] || null;
  const images = (product.images || []).map((i) => absoluteUrl(i?.url, origin)).filter(Boolean);
  const description = plainText(product.description);
  const gtin = isbn13(chosen?.isbn || product.isbn);

  const data = {
    '@context': 'https://schema.org',
    '@type': isBook ? ['Product', 'Book'] : 'Product',
    '@id': `${url}#produto`,
    name: product.title,
    url,
  };
  if (images.length) data.image = images;
  if (description) data.description = description;
  if (product.sku || product.book_code) data.sku = product.sku || product.book_code;
  if (gtin) data.gtin13 = gtin;
  if (product.type?.value) data.category = product.type.value;
  if (product.publisher) data.brand = { '@type': 'Brand', name: product.publisher };

  if (isBook) {
    if (product.author) data.author = { '@type': 'Person', name: product.author };
    if (gtin) data.isbn = gtin;
    if (Number(product.pages) > 0) data.numberOfPages = Math.round(Number(product.pages));
    const lang = languageCode(product.language);
    if (lang) data.inLanguage = lang;
    if (product.publisher) data.publisher = { '@type': 'Organization', name: product.publisher };
    if (Number(product.year) > 0) data.datePublished = String(Math.round(Number(product.year)));
  }

  const amount = price(chosen?.sale_price_in_cents ?? chosen?.price_in_cents ?? product.price_in_cents);
  if (amount) {
    const offer = {
      '@type': 'Offer',
      url,
      priceCurrency: SCHEMA_CURRENCY,
      price: amount,
      availability: product.purchasable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SELLER },
    };
    // Um preço de promoção tem fim: diz-se até quando vale.
    const until = chosen?.sale_price_in_cents != null && product.on_sale ? dateOnly(product.sale_ends_at) : null;
    if (until) offer.priceValidUntil = until;
    data.offers = offer;
  }
  return data;
}

/** O caminho da página (Início › Loja › género › produto), como `BreadcrumbList`. */
/**
 * Uma loja física para a Google (`Store`, um tipo de `LocalBusiness`).
 *
 * Para que serve: quem procura «livraria adventista no Huambo» vê a morada, o telefone e uma
 * fotografia no resultado, e a loja pode aparecer no mapa. Sem isto, a página
 * das lojas era texto solto para quem a lê de fora.
 *
 * A morada é uma linha só (é assim que está na base de dados) e a província vai como região.
 * O telefone sai em formato internacional, que é o que a Google espera. As fotografias são as
 * da galeria, com a miniatura à frente, em endereço absoluto.
 *
 * O horário fica de fora: o `openingHours` do schema.org tem uma escrita própria («Mo-Th
 * 08:00-17:30») e o que a equipa escreve na ficha é uma frase em português, com feriados pelo
 * meio. Mandá-la como está era dar à Google um horário que ela não sabe ler — pior do que não
 * mandar nenhum. O horário continua à vista na página, que é quem o lê.
 */
export function storeJsonLd(store, { origin } = {}) {
  if (!store?.id || !store?.name || !origin) return null;
  const imagens = [...new Set([store.image_url, ...storeGallery(store).map((f) => f.url)]
    .map((u) => absoluteUrl(u, origin)).filter(Boolean))];
  const telefone = localDigits(store.phone || store.whatsapp);
  const lat = Number(store.latitude);
  const lng = Number(store.longitude);
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: store.name,
    url: `${origin}/lojas#${encodeURIComponent(store.id)}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: store.address || undefined,
      addressRegion: store.province || undefined,
      addressCountry: 'AO',
    },
    ...(telefone.length === 9 ? { telephone: `+244${telefone}` } : {}),
    ...(store.email ? { email: store.email } : {}),
    ...(imagens.length ? { image: imagens } : {}),
    ...(hasCoords(store) ? { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } } : {}),
    ...(store.maps_url ? { hasMap: store.maps_url } : {}),
    // Liga a loja à empresa que o `index.html` já declara, para a Google as ler como uma só
    // casa com várias moradas, e não como seis negócios com o mesmo nome.
    parentOrganization: { '@id': `${CANONICAL_ORIGIN}/#organizacao` },
  };
}

export function breadcrumbJsonLd(items) {
  const list = (items || []).filter((i) => i?.name && i?.url);
  if (list.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * O texto do `<script type="application/ld+json">`. O `<` passa a `<`: um título com
 * "</script>" não fecha o bloco antes do tempo (continua a ser o mesmo JSON).
 */
export function jsonLdString(data) {
  const list = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (!list.length) return '';
  return JSON.stringify(list.length === 1 ? list[0] : list)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
