// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Organizador de produtos: uma só forma de ordenar e agrupar o catálogo, para a loja, as
 * categorias e as colecções.
 *
 * Antes cada página tinha a sua ordenação escrita à mão. A loja tinha cinco critérios, a
 * página de categoria tinha três — e os dois chamavam "Novidades" a ordens opostas (a loja
 * `(b.order) - (a.order)`, a categoria `(a.order) - (b.order)`, ou seja os livros mais
 * antigos à frente). O mesmo livro aparecia em primeiro lugar numa página e em último na
 * outra, com o mesmo nome de critério no ecrã.
 *
 * Três regras valem para todos os critérios:
 *
 * 1. **O que está esgotado vai para o fim.** Uma loja não abre a lista com o que não pode
 *    vender. Vale também no "preço do menor para o maior": o primeiro da lista é o mais
 *    barato *que se pode comprar*.
 * 2. **O preço que ordena é o que o cliente paga.** A ordenação antiga usava
 *    `price_in_cents`, o preço de tabela: um livro de 8 000 Kz em promoção a 3 000 ficava
 *    atrás de um de 4 000 na ordem "do menor para o maior", mostrando 3 000 no cartão. Aqui
 *    usa-se o preço em vigor (`lib/pricing.js` manda, e o `place_order` cobra o mesmo).
 * 3. **O desempate é sempre o mesmo** (título, depois id). Sem isto, dois livros com o mesmo
 *    preço trocavam de lugar entre carregamentos da mesma página — e, com páginas numeradas,
 *    um livro podia aparecer nas páginas 1 e 2 ou em nenhuma.
 */

import { PRODUCT_TYPES, productType } from '@/lib/productTypes';

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Destaques', hint: 'Escolhas da livraria primeiro' },
  { value: 'newest', label: 'Novidades', hint: 'Os últimos a chegar' },
  { value: 'popular', label: 'Mais procurados', hint: 'Os mais vendidos e vistos' },
  { value: 'discount', label: 'Maior desconto', hint: 'As promoções a valer' },
  { value: 'price-low', label: 'Preço: do menor', hint: 'Mais barato primeiro' },
  { value: 'price-high', label: 'Preço: do maior', hint: 'Mais caro primeiro' },
  { value: 'title', label: 'Título: A – Z' },
  { value: 'title-desc', label: 'Título: Z – A' },
];

export const DEFAULT_SORT = 'featured';

const VALUES = new Set(SORT_OPTIONS.map((o) => o.value));

/** O critério é um dos que existem? Senão, o de omissão. */
export function normalizeSort(value, fallback = DEFAULT_SORT) {
  const v = String(value ?? '').trim();
  if (VALUES.has(v)) return v;
  return VALUES.has(fallback) ? fallback : DEFAULT_SORT;
}

export const sortLabel = (value) =>
  (SORT_OPTIONS.find((o) => o.value === normalizeSort(value)) || SORT_OPTIONS[0]).label;

// --- Leituras do produto -----------------------------------------------------------------

/** Unidades disponíveis. Um produto fora de venda conta como zero. */
export function stockOf(product) {
  if (product?.purchasable === false) return 0;
  const v = product?.variants;
  if (Array.isArray(v) && v.length > 0) {
    // Com tamanhos ou edições, o que conta é haver *alguma* disponível.
    return v.reduce((max, x) => Math.max(max, Number(x?.inventory_quantity) || 0), 0);
  }
  return Number(product?.variants?.[0]?.inventory_quantity ?? (product?.purchasable ? 1 : 0)) || 0;
}

export const inStock = (product) => stockOf(product) > 0;

/**
 * Preço a pagar hoje, em cêntimos. O promocional da primeira variante quando existe (já
 * validado pelo `variantPrices`, que aplica a janela de datas), senão o de tabela.
 */
export function payablePriceInCents(product) {
  const v = product?.variants?.[0];
  const sale = Number(v?.sale_price_in_cents);
  if (Number.isFinite(sale) && sale > 0) return sale;
  const price = Number(v?.price_in_cents);
  if (Number.isFinite(price) && price > 0) return price;
  return Number(product?.price_in_cents) || 0;
}

/**
 * O que escrever no cartão: o preço a pagar e, quando há promoção, o de tabela para riscar.
 *
 * O par `sale_price_formatted || price_formatted` estava escrito em cada sítio que mostra um
 * preço, e bastava esquecê-lo num para esse sítio passar a anunciar o preço de tabela de um
 * livro em promoção — foi o que aconteceu no mega-menu do cabeçalho, que mostrava 8 000 Kz
 * ao lado de um cartão a dizer 1 900.
 */
export function displayPrice(product) {
  const v = product?.variants?.[0];
  const promocional = v?.sale_price_formatted || null;
  return {
    price: promocional || v?.price_formatted || '',
    originalPrice: promocional ? (v?.price_formatted || null) : null,
  };
}

/** Desconto em vigor, de 0 a 100. Sem promoção, 0. */
export function discountPercentOf(product) {
  const v = product?.variants?.[0];
  const normal = Number(v?.price_in_cents) || Number(product?.price_in_cents) || 0;
  const promo = Number(v?.sale_price_in_cents) || 0;
  if (!(normal > 0) || !(promo > 0) || promo >= normal) return 0;
  return Math.round((1 - promo / normal) * 100);
}

/**
 * Quando o produto entrou no catálogo, em milissegundos.
 *
 * `created` é a data a sério. O `order` (que o `bookToProduct` calcula como `ano × 1000`) é o
 * ano de publicação: um clássico de 1950 reeditado este mês não é uma novidade da livraria
 * por esse critério, e dois livros do mesmo ano ficavam empatados. Sem `created` recua-se
 * para o `order`, para a ordem não ficar aleatória nos dados antigos.
 */
export function arrivedAt(product) {
  const t = Date.parse(String(product?.created || ''));
  if (Number.isFinite(t)) return t;
  return (Number(product?.order) || 0) * 1000;
}

/** Procura: quanto este produto é relevante. 0 quando não há pesquisa. */
const relevanceOf = (product, relevance) => (relevance ? Number(relevance(product)) || 0 : 0);

// --- Ordenação ---------------------------------------------------------------------------

const title = (p) => String(p?.title || '');
const id = (p) => String(p?.id || '');

/** Desempate fixo: título e, em último, id. Garante ordem igual em cada render. */
const tieBreak = (a, b) => title(a).localeCompare(title(b), 'pt') || id(a).localeCompare(id(b));

const COMPARATORS = {
  'price-low': (a, b) => payablePriceInCents(a) - payablePriceInCents(b),
  'price-high': (a, b) => payablePriceInCents(b) - payablePriceInCents(a),
  title: (a, b) => title(a).localeCompare(title(b), 'pt'),
  'title-desc': (a, b) => title(b).localeCompare(title(a), 'pt'),
  newest: (a, b) => arrivedAt(b) - arrivedAt(a),
  discount: (a, b) => discountPercentOf(b) - discountPercentOf(a) || arrivedAt(b) - arrivedAt(a),
  // Vendas primeiro, visualizações a desempatar: num catálogo novo quase tudo tem 0 vendas,
  // e aí o que as pessoas abrem é o único sinal de procura que existe.
  popular: (a, b) =>
    (Number(b?.sales_count) || 0) - (Number(a?.sales_count) || 0)
    || (Number(b?.views_count) || 0) - (Number(a?.views_count) || 0)
    || Number(!!b?.featured) - Number(!!a?.featured),
  featured: (a, b) =>
    Number(!!b?.featured) - Number(!!a?.featured)
    || discountPercentOf(b) - discountPercentOf(a)
    || arrivedAt(b) - arrivedAt(a),
};

/**
 * Organiza os produtos.
 *
 * `relevance` é a função de relevância da pesquisa (ver `lib/searchUtils.js`): quando há
 * termo pesquisado, ela ganha a tudo no critério "Destaques" — quem escreveu "Daniel" quer o
 * livro do Daniel à frente, não o destaque da semana.
 */
export function sortProducts(products, sortBy = DEFAULT_SORT, { relevance = null } = {}) {
  const criterion = normalizeSort(sortBy);
  const compare = COMPARATORS[criterion] || COMPARATORS[DEFAULT_SORT];
  const useRelevance = !!relevance && criterion === 'featured';

  return [...(products || [])].sort((a, b) => {
    if (useRelevance) {
      const r = relevanceOf(b, relevance) - relevanceOf(a, relevance);
      if (r) return r;
    }
    // Regra 1: o que não se pode comprar fica no fim, em qualquer critério.
    const disponibilidade = Number(inStock(b)) - Number(inStock(a));
    if (disponibilidade) return disponibilidade;
    return compare(a, b) || tieBreak(a, b);
  });
}

// --- Agrupamento por tipo de produto -----------------------------------------------------

const TYPE_ORDER = new Map(PRODUCT_TYPES.map((t, i) => [t.value, i]));

/**
 * Divide a lista por tipo de produto, já organizada dentro de cada grupo.
 *
 * Serve para quando o catálogo deixa de ser só livros: numa lista única, um uniforme escolar
 * a 12 000 Kz entre dois devocionais não diz nada a quem procura leitura. Devolve só os
 * grupos com produtos, pela ordem de `PRODUCT_TYPES` (livros primeiro), e nunca agrupa
 * quando há um tipo só — um título "Livros" por cima de uma lista de livros é ruído.
 */
export function groupByType(products, sortBy = DEFAULT_SORT, options = {}) {
  const sorted = sortProducts(products, sortBy, options);
  const groups = new Map();
  for (const p of sorted) {
    const value = productType(p?.product_type).value;
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(p);
  }
  if (groups.size <= 1) return [];
  return [...groups.entries()]
    .sort((a, b) => (TYPE_ORDER.get(a[0]) ?? 99) - (TYPE_ORDER.get(b[0]) ?? 99))
    .map(([value, items]) => ({
      value,
      label: productType(value).plural,
      products: items,
    }));
}

/** Vale a pena oferecer o agrupamento? Só com mais do que um tipo de produto na lista. */
export function canGroupByType(products) {
  const tipos = new Set((products || []).map((p) => productType(p?.product_type).value));
  return tipos.size > 1;
}
