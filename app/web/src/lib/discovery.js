// Sugestões de livros e produtos: o que mostrar a esta pessoa, e por que ordem.
//
// Recomendação explicável e sem servidor. Os sinais são só desta pessoa e só deste
// navegador: o que tem no carrinho, o que guardou na lista de desejos e os livros que abriu
// (`lib/recentlyViewed.js`). Nada vai para o servidor e nada vem de outros clientes — não há
// "quem comprou isto comprou aquilo", que exige acumular o histórico de compras de todos.
//
// Como se chega à ordem:
//
//   pontos(candidato) = Σ  peso_do_sinal × peso_da_semelhança
//
// Os pesos estão em `SIGNAL` e `AFFINITY` e dizem o que a livraria acha que importa:
//
// - **O carrinho conta mais do que a lista de desejos, e esta mais do que uma visita.** Quem
//   tem um livro no carrinho está a comprar agora; quem abriu uma página pode ter chegado lá
//   por um link.
// - **A colecção é a semelhança mais forte.** As colecções desta livraria são séries
//   (Conflito dos Séculos, lições, devocionais de um ano): quem começou o primeiro volume
//   quer o segundo, e isso vale mais do que "outro livro de saúde qualquer".
// - **Depois o autor, depois o género, e por fim a faixa de preço.** O preço entra porque
//   decide a compra: a quem vê livros de 2 000 Kz não se põe à frente uma Bíblia de estudo
//   de 25 000.
//
// Três coisas que a ordem nunca faz: sugerir o que a pessoa já tem no carrinho ou já viu
// (isso tem o seu lugar, "Vistos recentemente"), pôr à frente o que está esgotado, e repetir
// o mesmo produto.

import { arrivedAt, inStock, payablePriceInCents } from '@/lib/productSort';

const norm = (s) => String(s || '').trim().toLowerCase();

/** Peso de cada sinal: o que a pessoa fez com o produto. */
export const SIGNAL = {
  cart: 5,
  wishlist: 3,
  /** As três visitas mais recentes valem mais: é o que a pessoa está a ver *agora*. */
  viewedRecent: 2,
  viewed: 1,
};

/** Peso de cada semelhança entre o candidato e um produto dos sinais. */
export const AFFINITY = {
  collection: 4,
  author: 3,
  genre: 2,
  priceBand: 1,
};

/** Quantas das visitas mais recentes contam a dobrar. */
const RECENT_BOOST_COUNT = 3;

/**
 * Largura da faixa de preço, em kwanzas. Larga de propósito: serve para separar "livro de
 * bolso" de "Bíblia de estudo", não para emparelhar preços ao kwanza.
 */
export const PRICE_BAND_KZ = 2500;

export const priceBand = (product) => {
  const cents = payablePriceInCents(product);
  if (!(cents > 0)) return null;
  return Math.floor(cents / 100 / PRICE_BAND_KZ);
};

const facetsOf = (product) => ({
  collection: norm(product?.collection_id),
  author: norm(product?.author || product?.subtitle),
  genre: norm(product?.type?.value || product?.genre),
  priceBand: priceBand(product),
});

/** Soma `peso` à chave, se a chave existir. */
const add = (map, key, peso) => {
  if (key === null || key === undefined || key === '') return;
  map.set(key, (map.get(key) || 0) + peso);
};

/**
 * O retrato do interesse desta pessoa.
 *
 * `recent`, `wishlist` e `cart` são listas de ids (ou de objectos com `id`), da mais recente
 * para a mais antiga. Só contam os ids que existem no catálogo: um livro apagado não diz
 * nada sobre gostos, e deixá-lo entrar punha peso numa colecção que já não há.
 */
export function buildInterest({ recent = [], wishlist = [], cart = [] } = {}, products = []) {
  const byId = new Map((products || []).map((p) => [String(p.id), p]));
  const collections = new Map();
  const authors = new Map();
  const genres = new Map();
  const priceBands = new Map();
  /** Já visto/guardado: não se volta a sugerir como descoberta. */
  const known = new Set();
  /** No carrinho: nunca se sugere (já está a ser comprado). */
  const inCart = new Set();
  let peso = 0;

  const registar = (entrada, pesoSinal, { marcarCarrinho = false } = {}) => {
    const id = String(entrada?.id ?? entrada ?? '');
    const p = byId.get(id);
    if (!p) return;
    known.add(id);
    if (marcarCarrinho) inCart.add(id);
    peso += pesoSinal;
    const f = facetsOf(p);
    add(collections, f.collection, pesoSinal * AFFINITY.collection);
    add(authors, f.author, pesoSinal * AFFINITY.author);
    add(genres, f.genre, pesoSinal * AFFINITY.genre);
    add(priceBands, f.priceBand, pesoSinal * AFFINITY.priceBand);
  };

  for (const item of cart || []) registar(item, SIGNAL.cart, { marcarCarrinho: true });
  for (const item of wishlist || []) registar(item, SIGNAL.wishlist);
  (recent || []).forEach((item, i) => {
    registar(item, i < RECENT_BOOST_COUNT ? SIGNAL.viewedRecent : SIGNAL.viewed);
  });

  return { collections, authors, genres, priceBands, known, inCart, viewed: known, weight: peso };
}

/**
 * Compatível com quem já chamava isto: o interesse só a partir dos livros vistos.
 *
 * Mantém os campos `categories` e `authors` como conjuntos, que o código anterior lia.
 */
export function interestFromRecent(recent = [], products = []) {
  const interest = buildInterest({ recent }, products);
  return {
    ...interest,
    categories: new Set(interest.genres.keys()),
    authorSet: new Set(interest.authors.keys()),
  };
}

export const hasInterest = (interest) => !!interest && Number(interest.weight) > 0;

/**
 * Quantos pontos este candidato ganha com o interesse desta pessoa, e porquê.
 *
 * O `because` é a razão a mostrar no ecrã ("Da colecção que começou a ler"): uma sugestão que
 * não se consegue explicar numa frase é uma sugestão em que ninguém confia.
 */
export function scoreProduct(product, interest) {
  if (!hasInterest(interest) || !product) return { score: 0, because: '' };
  const id = String(product.id);
  // Já está no carrinho: não é sugestão nenhuma.
  if (interest.inCart?.has(id)) return { score: 0, because: '' };

  const f = facetsOf(product);
  const partes = [
    [interest.collections.get(f.collection) || 0, 'Da mesma colecção'],
    [interest.authors.get(f.author) || 0, 'Do mesmo autor'],
    [interest.genres.get(f.genre) || 0, 'Do género que tem visto'],
    [interest.priceBands.get(f.priceBand) || 0, 'Num preço parecido'],
  ];
  const score = partes.reduce((total, [p]) => total + p, 0);
  if (score <= 0) return { score: 0, because: '' };
  // A razão é a semelhança que mais pesou.
  const [, because] = partes.reduce((melhor, actual) => (actual[0] > melhor[0] ? actual : melhor));
  return { score, because };
}

/**
 * Ordem do feed "Mais para si".
 *
 * Primeiro o que se recomenda (disponível, com pontos, e que a pessoa ainda não viu nem
 * guardou), por pontos; depois os destaques disponíveis; depois o resto disponível, com os
 * que chegaram há menos tempo à frente; e por fim o que está esgotado. Cada produto uma vez.
 */
export function discoveryOrder(products = [], interest = null) {
  const vistos = new Set();
  const unicos = (products || []).filter((p) => {
    const id = p?.id == null ? '' : String(p.id);
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });

  const pontos = new Map();
  for (const p of unicos) {
    const id = String(p.id);
    // Um livro que a pessoa já viu ou guardou não é uma descoberta: fica fora da fila da
    // frente (aparece em "Vistos recentemente" e na lista de desejos, onde se procura).
    const elegivel = hasInterest(interest) && !interest.known?.has(id) && inStock(p);
    pontos.set(id, elegivel ? scoreProduct(p, interest).score : 0);
  }

  const rank = (p) => {
    if (!inStock(p)) return 3;
    if ((pontos.get(String(p.id)) || 0) > 0) return 0;
    return p.featured ? 1 : 2;
  };

  return [...unicos].sort((a, b) =>
    rank(a) - rank(b)
    || (pontos.get(String(b.id)) || 0) - (pontos.get(String(a.id)) || 0)
    || arrivedAt(b) - arrivedAt(a)
    || String(a.title || '').localeCompare(String(b.title || ''), 'pt'));
}

/**
 * Produtos a mostrar na ficha de um livro: "quem leu este, procurou também".
 *
 * É a semelhança com **este** produto, não com o histórico: mesma colecção primeiro, depois
 * mesmo autor, depois mesmo género, e a faixa de preço a desempatar. Com o histórico da
 * pessoa (quando há), os que também encaixam no gosto dela sobem dentro do mesmo grupo.
 *
 * Nunca devolve o próprio produto, nem o que está esgotado: um "também lhe pode interessar"
 * que leva a uma página sem botão de comprar é um beco sem saída.
 */
export function relatedProducts(product, catalog = [], { limit = 8, interest = null } = {}) {
  if (!product) return [];
  const base = facetsOf(product);
  const baseId = String(product.id);

  const candidatos = [];
  for (const p of catalog || []) {
    const id = p?.id == null ? '' : String(p.id);
    if (!id || id === baseId || !inStock(p)) continue;
    const f = facetsOf(p);
    let peso = 0;
    if (base.collection && f.collection === base.collection) peso += AFFINITY.collection;
    if (base.author && f.author === base.author) peso += AFFINITY.author;
    if (base.genre && f.genre === base.genre) peso += AFFINITY.genre;
    if (base.priceBand !== null && f.priceBand === base.priceBand) peso += AFFINITY.priceBand;
    if (peso <= 0) continue;
    candidatos.push({ product: p, peso, gosto: scoreProduct(p, interest).score });
  }

  candidatos.sort((a, b) =>
    b.peso - a.peso
    || b.gosto - a.gosto
    || Number(!!b.product.featured) - Number(!!a.product.featured)
    || arrivedAt(b.product) - arrivedAt(a.product)
    || String(a.product.title || '').localeCompare(String(b.product.title || ''), 'pt'));

  return candidatos.slice(0, Math.max(1, limit)).map((c) => c.product);
}

/** A razão pela qual este produto é semelhante àquele, numa frase. '' quando não é. */
export function relationLabel(product, base) {
  if (!product || !base) return '';
  const a = facetsOf(product);
  const b = facetsOf(base);
  if (b.collection && a.collection === b.collection) return 'Mesma colecção';
  if (b.author && a.author === b.author) return 'Mesmo autor';
  if (b.genre && a.genre === b.genre) return 'Mesmo género';
  return '';
}
