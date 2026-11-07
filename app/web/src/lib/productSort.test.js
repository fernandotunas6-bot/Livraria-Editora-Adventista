import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  arrivedAt,
  canGroupByType,
  discountPercentOf,
  displayPrice,
  groupByType,
  inStock,
  normalizeSort,
  payablePriceInCents,
  sortLabel,
  sortProducts,
} from './productSort';

/** Produto no formato que o `bookToProduct` devolve. */
const produto = (id, { preco = 1000, promo = null, stock = 3, ...extra } = {}) => ({
  id,
  title: extra.title ?? id,
  price_in_cents: preco * 100,
  purchasable: stock > 0,
  variants: [{
    id: `${id}-default`,
    price_in_cents: preco * 100,
    sale_price_in_cents: promo == null ? null : promo * 100,
    inventory_quantity: stock,
  }],
  ...extra,
});

describe('normalizeSort', () => {
  it('aceita só os critérios que existem', () => {
    expect(normalizeSort('price-low')).toBe('price-low');
    expect(normalizeSort('nao-existe')).toBe(DEFAULT_SORT);
    expect(normalizeSort('')).toBe(DEFAULT_SORT);
    expect(normalizeSort(null)).toBe(DEFAULT_SORT);
    expect(normalizeSort(undefined, 'newest')).toBe('newest');
    expect(normalizeSort('lixo', 'lixo-tambem')).toBe(DEFAULT_SORT);
  });

  it('cada critério tem um nome para o ecrã', () => {
    for (const o of SORT_OPTIONS) expect(sortLabel(o.value)).toBe(o.label);
  });
});

describe('leituras do produto', () => {
  it('o preço que conta é o que o cliente paga', () => {
    expect(payablePriceInCents(produto('a', { preco: 8000 }))).toBe(800_000);
    expect(payablePriceInCents(produto('b', { preco: 8000, promo: 3000 }))).toBe(300_000);
  });

  it('desconto só com promoção a valer', () => {
    expect(discountPercentOf(produto('a', { preco: 8000, promo: 2000 }))).toBe(75);
    expect(discountPercentOf(produto('b', { preco: 8000 }))).toBe(0);
    // Promocional maior do que o normal não é desconto nenhum.
    expect(discountPercentOf(produto('c', { preco: 2000, promo: 3000 }))).toBe(0);
  });

  it('o preço mostrado é o que se paga, com o de tabela para riscar', () => {
    // O par `sale_price_formatted || price_formatted` estava escrito em cada sítio que mostra
    // um preço, e o mega-menu do cabeçalho tinha-se esquecido do promocional: anunciava
    // 8 000 Kz ao lado de um cartão a dizer 1 900.
    const comPromo = {
      variants: [{ price_formatted: 'Kz 8 000,00', sale_price_formatted: 'Kz 1 900,00' }],
    };
    expect(displayPrice(comPromo)).toEqual({ price: 'Kz 1 900,00', originalPrice: 'Kz 8 000,00' });

    const semPromo = { variants: [{ price_formatted: 'Kz 3 500,00', sale_price_formatted: null }] };
    expect(displayPrice(semPromo)).toEqual({ price: 'Kz 3 500,00', originalPrice: null });

    expect(displayPrice({})).toEqual({ price: '', originalPrice: null });
    expect(displayPrice(null)).toEqual({ price: '', originalPrice: null });
  });

  it('disponibilidade: fora de venda conta como esgotado', () => {
    expect(inStock(produto('a'))).toBe(true);
    expect(inStock(produto('b', { stock: 0 }))).toBe(false);
    expect(inStock({ ...produto('c'), purchasable: false })).toBe(false);
    // Com tamanhos/edições, basta uma com stock.
    expect(inStock({
      id: 'd',
      purchasable: true,
      variants: [{ inventory_quantity: 0 }, { inventory_quantity: 2 }],
    })).toBe(true);
  });

  it('a chegada ao catálogo é o `created`, e o `order` é o recurso', () => {
    expect(arrivedAt({ created: '2026-03-01T00:00:00Z' })).toBe(Date.parse('2026-03-01T00:00:00Z'));
    expect(arrivedAt({ order: 2024 * 1000 })).toBe(2024 * 1000 * 1000);
    expect(arrivedAt({})).toBe(0);
  });
});

describe('sortProducts', () => {
  it('o esgotado vai para o fim em qualquer critério — preço incluído', () => {
    const lista = [
      produto('esgotado-barato', { preco: 100, stock: 0 }),
      produto('caro', { preco: 9000 }),
      produto('barato', { preco: 500 }),
    ];
    expect(sortProducts(lista, 'price-low').map((p) => p.id))
      .toEqual(['barato', 'caro', 'esgotado-barato']);
    expect(sortProducts(lista, 'price-high').map((p) => p.id))
      .toEqual(['caro', 'barato', 'esgotado-barato']);
  });

  it('o preço que ordena é o promocional, não o de tabela', () => {
    // Era o bug da ordenação antiga: um livro de 8 000 em promoção a 1 000 ficava atrás de um
    // de 4 000 em "do menor para o maior", e mostrava 1 000 no cartão.
    const lista = [produto('normal', { preco: 4000 }), produto('promo', { preco: 8000, promo: 1000 })];
    expect(sortProducts(lista, 'price-low').map((p) => p.id)).toEqual(['promo', 'normal']);
  });

  it('"Novidades" é quem chegou há menos tempo à livraria', () => {
    const lista = [
      produto('antigo', { created: '2026-01-01T00:00:00Z' }),
      produto('novo', { created: '2026-11-01T00:00:00Z' }),
      produto('meio', { created: '2026-06-01T00:00:00Z' }),
    ];
    expect(sortProducts(lista, 'newest').map((p) => p.id)).toEqual(['novo', 'meio', 'antigo']);
  });

  it('A–Z e Z–A em português', () => {
    const lista = [produto('c', { title: 'Ângelo' }), produto('a', { title: 'Amor' }), produto('b', { title: 'Zelo' })];
    expect(sortProducts(lista, 'title').map((p) => p.title)).toEqual(['Amor', 'Ângelo', 'Zelo']);
    expect(sortProducts(lista, 'title-desc').map((p) => p.title)).toEqual(['Zelo', 'Ângelo', 'Amor']);
  });

  it('maior desconto primeiro', () => {
    const lista = [
      produto('sem', { preco: 5000 }),
      produto('meio', { preco: 5000, promo: 4000 }),
      produto('muito', { preco: 5000, promo: 1000 }),
    ];
    expect(sortProducts(lista, 'discount').map((p) => p.id)).toEqual(['muito', 'meio', 'sem']);
  });

  it('mais procurados: vendas, e as visualizações a desempatar', () => {
    const lista = [
      produto('visto', { sales_count: 0, views_count: 90 }),
      produto('vendido', { sales_count: 7, views_count: 1 }),
      produto('nada', { sales_count: 0, views_count: 0 }),
    ];
    expect(sortProducts(lista, 'popular').map((p) => p.id)).toEqual(['vendido', 'visto', 'nada']);
  });

  it('destaques: em destaque, depois promoções, depois os mais recentes', () => {
    const lista = [
      produto('normal', { created: '2026-01-01T00:00:00Z' }),
      produto('promo', { preco: 5000, promo: 2000, created: '2026-01-01T00:00:00Z' }),
      produto('destaque', { featured: true, created: '2025-01-01T00:00:00Z' }),
    ];
    expect(sortProducts(lista, 'featured').map((p) => p.id)).toEqual(['destaque', 'promo', 'normal']);
  });

  it('com pesquisa, a relevância ganha ao destaque', () => {
    const lista = [produto('destaque', { featured: true }), produto('procurado')];
    const relevance = (p) => (p.id === 'procurado' ? 10 : 0);
    expect(sortProducts(lista, 'featured', { relevance }).map((p) => p.id)).toEqual(['procurado', 'destaque']);
    // Noutros critérios a relevância não entra: quem pediu "preço" quer preço.
    expect(sortProducts(lista, 'price-low', { relevance }).map((p) => p.id)).toEqual(['destaque', 'procurado']);
  });

  it('a ordem é sempre a mesma: empates desempatam pelo título e pelo id', () => {
    const iguais = [produto('z2', { title: 'Igual' }), produto('z1', { title: 'Igual' }), produto('a', { title: 'Igual' })];
    const uma = sortProducts(iguais, 'price-low').map((p) => p.id);
    const outra = sortProducts([...iguais].reverse(), 'price-low').map((p) => p.id);
    expect(uma).toEqual(outra);
    expect(uma).toEqual(['a', 'z1', 'z2']);
  });

  it('não altera a lista original e aguenta entradas vazias', () => {
    const lista = [produto('b'), produto('a')];
    const copia = [...lista];
    sortProducts(lista, 'title');
    expect(lista).toEqual(copia);
    expect(sortProducts([], 'title')).toEqual([]);
    expect(sortProducts(null, 'title')).toEqual([]);
    expect(sortProducts(undefined)).toEqual([]);
  });
});

describe('groupByType', () => {
  const misto = [
    produto('livro-1', { product_type: 'livro', title: 'B' }),
    produto('tshirt', { product_type: 'vestuario' }),
    produto('livro-2', { product_type: 'livro', title: 'A' }),
    produto('biblia', { product_type: 'biblia' }),
  ];

  it('agrupa pela ordem dos tipos, e ordena dentro de cada grupo', () => {
    const grupos = groupByType(misto, 'title');
    expect(grupos.map((g) => g.value)).toEqual(['livro', 'biblia', 'vestuario']);
    expect(grupos[0].label).toBe('Livros');
    expect(grupos[0].products.map((p) => p.title)).toEqual(['A', 'B']);
  });

  it('não agrupa quando há um tipo só: um título "Livros" sobre livros não diz nada', () => {
    const soLivros = [produto('a', { product_type: 'livro' }), produto('b', { product_type: 'livro' })];
    expect(groupByType(soLivros, 'title')).toEqual([]);
    expect(canGroupByType(soLivros)).toBe(false);
    expect(canGroupByType(misto)).toBe(true);
    expect(canGroupByType([])).toBe(false);
  });

  it('um produto sem tipo conta como livro (é o que a base de dados assume)', () => {
    const grupos = groupByType([produto('sem-tipo'), produto('t', { product_type: 'vestuario' })], 'title');
    expect(grupos.find((g) => g.value === 'livro').products.map((p) => p.id)).toEqual(['sem-tipo']);
  });
});
