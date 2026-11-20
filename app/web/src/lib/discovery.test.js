// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import {
  AFFINITY,
  SIGNAL,
  buildInterest,
  discoveryOrder,
  hasInterest,
  interestFromRecent,
  priceBand,
  relatedProducts,
  relationLabel,
  scoreProduct,
} from './discovery';

const livro = (id, extra = {}) => ({
  id,
  title: extra.title ?? id,
  order: 0,
  purchasable: true,
  variants: [{ price_in_cents: 200_000, sale_price_in_cents: null, inventory_quantity: 3 }],
  type: { value: 'Catálogo Geral' },
  ...extra,
});

const catalogo = [
  livro('visto', { type: { value: 'Ellen G. White' }, author: 'Ellen G. White', collection_id: 'conflito' }),
  livro('mesma-colecao', { collection_id: 'conflito', created: '2026-01-01T00:00:00Z' }),
  livro('mesmo-autor', { author: 'Ellen G. White', created: '2026-01-02T00:00:00Z' }),
  livro('mesma-cat', { type: { value: 'Ellen G. White' }, created: '2026-01-03T00:00:00Z' }),
  livro('destaque', { featured: true, created: '2026-02-01T00:00:00Z' }),
  livro('outro', { created: '2026-03-01T00:00:00Z' }),
  livro('esgotado-relacionado', {
    collection_id: 'conflito',
    variants: [{ price_in_cents: 200_000, inventory_quantity: 0 }],
  }),
];

describe('buildInterest', () => {
  it('pesa o carrinho mais do que os desejos, e estes mais do que uma visita', () => {
    const i = buildInterest({ cart: ['visto'] }, catalogo);
    const comDesejo = buildInterest({ wishlist: ['visto'] }, catalogo);
    const comVisita = buildInterest({ recent: [{ id: 'visto' }] }, catalogo);
    expect(i.collections.get('conflito')).toBe(SIGNAL.cart * AFFINITY.collection);
    expect(comDesejo.collections.get('conflito')).toBe(SIGNAL.wishlist * AFFINITY.collection);
    expect(comVisita.collections.get('conflito')).toBe(SIGNAL.viewedRecent * AFFINITY.collection);
    expect(i.weight).toBeGreaterThan(comDesejo.weight);
    expect(comDesejo.weight).toBeGreaterThan(comVisita.weight);
  });

  it('a colecção pesa mais do que o autor, que pesa mais do que o género', () => {
    const i = buildInterest({ recent: [{ id: 'visto' }] }, catalogo);
    expect(i.collections.get('conflito')).toBeGreaterThan(i.authors.get('ellen g. white'));
    expect(i.authors.get('ellen g. white')).toBeGreaterThan(i.genres.get('ellen g. white'));
  });

  it('ignora ids que não estão no catálogo: um livro apagado não diz nada sobre gostos', () => {
    const i = buildInterest({ recent: [{ id: 'apagado' }, { id: 'visto' }] }, catalogo);
    expect([...i.known]).toEqual(['visto']);
    expect(hasInterest(buildInterest({}, catalogo))).toBe(false);
    expect(hasInterest(buildInterest({ recent: [{ id: 'apagado' }] }, catalogo))).toBe(false);
    expect(hasInterest(null)).toBe(false);
  });

  it('as visitas mais recentes valem mais do que as antigas', () => {
    const recentes = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}` }));
    const lista = recentes.map((r, i) => livro(r.id, { collection_id: `c${i}` }));
    const i = buildInterest({ recent: recentes }, lista);
    expect(i.collections.get('c0')).toBe(SIGNAL.viewedRecent * AFFINITY.collection);
    expect(i.collections.get('c4')).toBe(SIGNAL.viewed * AFFINITY.collection);
  });

  it('`interestFromRecent` continua a dar as categorias e os autores vistos', () => {
    const i = interestFromRecent([{ id: 'visto' }, { id: 'apagado' }], catalogo);
    expect([...i.categories]).toEqual(['ellen g. white']);
    expect([...i.authorSet]).toEqual(['ellen g. white']);
    expect([...i.viewed]).toEqual(['visto']);
  });
});

describe('priceBand', () => {
  it('agrupa preços próximos e separa os muito diferentes', () => {
    const barato = livro('a', { variants: [{ price_in_cents: 150_000, inventory_quantity: 1 }] });
    const parecido = livro('b', { variants: [{ price_in_cents: 200_000, inventory_quantity: 1 }] });
    const caro = livro('c', { variants: [{ price_in_cents: 2_500_000, inventory_quantity: 1 }] });
    expect(priceBand(barato)).toBe(priceBand(parecido));
    expect(priceBand(caro)).not.toBe(priceBand(barato));
    expect(priceBand({ variants: [{ price_in_cents: 0 }] })).toBeNull();
  });
});

describe('scoreProduct', () => {
  const interest = buildInterest({ recent: [{ id: 'visto' }] }, catalogo);

  it('dá mais pontos à colecção do que ao autor e ao género, e diz porquê', () => {
    const colecao = scoreProduct(catalogo.find((p) => p.id === 'mesma-colecao'), interest);
    const autor = scoreProduct(catalogo.find((p) => p.id === 'mesmo-autor'), interest);
    const genero = scoreProduct(catalogo.find((p) => p.id === 'mesma-cat'), interest);
    expect(colecao.score).toBeGreaterThan(autor.score);
    expect(autor.score).toBeGreaterThan(genero.score);
    expect(colecao.because).toBe('Da mesma colecção');
    expect(autor.because).toBe('Do mesmo autor');
  });

  it('zero pontos sem interesse, e o que está no carrinho nunca é sugestão', () => {
    expect(scoreProduct(catalogo[1], null).score).toBe(0);
    const comCarrinho = buildInterest({ cart: ['mesma-colecao'] }, catalogo);
    expect(scoreProduct(catalogo.find((p) => p.id === 'mesma-colecao'), comCarrinho).score).toBe(0);
  });
});

describe('discoveryOrder', () => {
  it('sem histórico: destaques, depois os que chegaram há menos tempo, esgotados no fim', () => {
    const ids = discoveryOrder(catalogo).map((p) => p.id);
    expect(ids[0]).toBe('destaque');
    expect(ids.at(-1)).toBe('esgotado-relacionado');
    expect(ids.indexOf('outro')).toBeLessThan(ids.indexOf('mesma-colecao'));
  });

  it('com histórico: a mesma colecção à frente do mesmo autor e do mesmo género', () => {
    const i = interestFromRecent([{ id: 'visto' }], catalogo);
    const ids = discoveryOrder(catalogo, i).map((p) => p.id);
    expect(ids.slice(0, 3)).toEqual(['mesma-colecao', 'mesmo-autor', 'mesma-cat']);
    // O destaque desce: há coisas mais parecidas com o que a pessoa viu.
    expect(ids.indexOf('destaque')).toBeGreaterThan(ids.indexOf('mesma-cat'));
    // O próprio livro visto não é uma descoberta.
    expect(ids.indexOf('visto')).toBeGreaterThan(ids.indexOf('mesma-colecao'));
    // Esgotado, mesmo da mesma colecção, fica no fim.
    expect(ids.at(-1)).toBe('esgotado-relacionado');
  });

  it('não repete produtos nem deixa cair os que não têm id', () => {
    expect(discoveryOrder([livro('a'), livro('a'), livro('b')]).map((p) => p.id)).toEqual(['a', 'b']);
    expect(discoveryOrder([{ title: 'sem id' }])).toEqual([]);
    expect(discoveryOrder([])).toEqual([]);
  });
});

describe('relatedProducts', () => {
  const base = catalogo.find((p) => p.id === 'visto');

  it('mesma colecção, depois mesmo autor, depois mesmo género', () => {
    const ids = relatedProducts(base, catalogo, { limit: 5 }).map((p) => p.id);
    expect(ids.slice(0, 3)).toEqual(['mesma-colecao', 'mesmo-autor', 'mesma-cat']);
  });

  it('nunca o próprio produto nem nada esgotado', () => {
    const ids = relatedProducts(base, catalogo, { limit: 20 }).map((p) => p.id);
    expect(ids).not.toContain('visto');
    expect(ids).not.toContain('esgotado-relacionado');
  });

  it('respeita o limite e devolve vazio quando não há nada parecido', () => {
    expect(relatedProducts(base, catalogo, { limit: 2 })).toHaveLength(2);
    const sozinho = livro('unico', { type: { value: 'Nada' }, author: 'Ninguém', collection_id: 'nenhuma' });
    // Só poderia bater pela faixa de preço; com um preço fora de qualquer faixa, nada bate.
    const caro = { ...sozinho, variants: [{ price_in_cents: 9_900_000, inventory_quantity: 1 }] };
    expect(relatedProducts(caro, catalogo, { limit: 5 })).toEqual([]);
    expect(relatedProducts(null, catalogo)).toEqual([]);
  });

  it('o gosto da pessoa desempata dentro do mesmo grau de semelhança', () => {
    const lista = [
      base,
      livro('autor-a', { author: 'Ellen G. White', type: { value: 'X' }, title: 'A' }),
      livro('autor-b', { author: 'Ellen G. White', type: { value: 'Saúde' }, title: 'B' }),
    ];
    const interest = buildInterest({ cart: ['gosto'] }, [...lista, livro('gosto', { type: { value: 'Saúde' } })]);
    const ids = relatedProducts(base, lista, { limit: 5, interest }).map((p) => p.id);
    expect(ids[0]).toBe('autor-b');
  });
});

describe('relationLabel', () => {
  it('diz a semelhança mais forte, ou nada', () => {
    const base = catalogo.find((p) => p.id === 'visto');
    expect(relationLabel(catalogo.find((p) => p.id === 'mesma-colecao'), base)).toBe('Mesma colecção');
    expect(relationLabel(catalogo.find((p) => p.id === 'mesmo-autor'), base)).toBe('Mesmo autor');
    expect(relationLabel(catalogo.find((p) => p.id === 'mesma-cat'), base)).toBe('Mesmo género');
    expect(relationLabel(livro('nada', { type: { value: 'Outro' } }), base)).toBe('');
    expect(relationLabel(null, base)).toBe('');
  });
});
