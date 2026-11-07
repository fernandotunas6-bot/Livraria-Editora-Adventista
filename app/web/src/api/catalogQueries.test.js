import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Duas consultas do catálogo que já causaram problemas reais:
 *
 * - `searchProducts` devolvia os resultados pela ordem da base de dados (`-featured,title`),
 *   aplicada **antes** do limite: com `limit` 6, o livro que a pessoa escreveu podia nem
 *   estar entre os seis;
 * - `getCollectionProducts` substitui a conversão própria que a página das colecções tinha,
 *   que chamava à variante `variant_<id>` — um id que o carrinho não reconhece, e por isso
 *   tudo o que ali se punha no carrinho saía de lá na revalidação seguinte.
 */

const livros = [];
const getList = vi.fn();
const getFullList = vi.fn();

vi.mock('@/lib/dataClient', () => ({
  default: {
    collection: (nome) => ({
      getList: (...a) => getList(nome, ...a),
      getFullList: (...a) => getFullList(nome, ...a),
    }),
    files: { getURL: () => '' },
  },
}));
vi.mock('@/lib/supabaseClient', () => ({ APP_API_URL: '', mediaUrl: (x) => x, supabase: {} }));

const { searchProducts, getCollectionProducts, getProducts, getCategories, clearCatalogCache } = await import('./EcommerceApi');

const livro = (id, extra = {}) => ({
  id, title: id, author: '', genre: 'Geral', price: 1000, stock: 3, active: true,
  cover: '', cover_image: '', featured: false, collection_id: '', versions: [],
  created: '2026-01-01T00:00:00Z', ...extra,
});

beforeEach(() => {
  livros.length = 0;
  clearCatalogCache();
  getList.mockReset();
  getFullList.mockReset();
  // As colecções (`book_collections`) são lidas com getFullList; o catálogo com getList.
  getFullList.mockImplementation(async (nome) => (nome === 'book_collections' ? [] : livros));
  getList.mockImplementation(async (nome, _pagina, limite) => ({ items: livros.slice(0, limite) }));
});

describe('searchProducts', () => {
  it('ordena por relevância: o título procurado vem à frente do destaque alfabético', () => {
    // A base de dados devolveria "A Grande Esperança" primeiro (destacado, A antes de D).
    livros.push(
      livro('destaque', { title: 'A Grande Esperança', genre: 'Daniel e Apocalipse', featured: true }),
      livro('outro', { title: 'Comentário Bíblico', genre: 'Daniel e Apocalipse' }),
      livro('procurado', { title: 'Daniel Verso por Verso' }),
    );
    return searchProducts('Daniel', 2).then(({ products }) => {
      expect(products[0].id).toBe('procurado');
      expect(products).toHaveLength(2);
    });
  });

  it('pede à base de dados mais do que o limite, para haver o que ordenar', async () => {
    livros.push(livro('a', { title: 'Alfa' }));
    await searchProducts('Alfa', 6);
    const [, , limitePedido] = getList.mock.calls[0];
    expect(limitePedido).toBeGreaterThan(6);
  });

  it('um código de produto encontra esse produto exacto', async () => {
    livros.push(livro('x', { book_code: 'LIV-063', title: 'Daniel' }));
    const { products } = await searchProducts('liv63');
    expect(products.map((p) => p.id)).toEqual(['x']);
  });

  it('sem termo, devolve o catálogo', async () => {
    livros.push(livro('a'), livro('b'));
    const { products } = await searchProducts('   ', 10);
    expect(products).toHaveLength(2);
  });
});

describe('getCollectionProducts', () => {
  it('a variante tem o sufixo que o carrinho sabe desmontar', async () => {
    livros.push(livro('rec123', { collection_id: 'col-1' }));
    const [produto] = await getCollectionProducts('col-1');
    // É o `bookIdOf` do hooks/useCart.jsx.
    const bookIdOf = (v) => String(v || '').replace(/-(default|v\d+)$/, '');
    expect(produto.variants[0].id).toBe('rec123-default');
    expect(bookIdOf(produto.variants[0].id)).toBe('rec123');
  });

  it('um livro esgotado não fica comprável nem com stock inventado', async () => {
    livros.push(livro('sem-stock', { stock: 0, collection_id: 'col-1' }));
    const [produto] = await getCollectionProducts('col-1');
    expect(produto.purchasable).toBe(false);
    expect(produto.variants[0].inventory_quantity).toBe(0);
  });

  it('a promoção em vigor aparece, como na loja', async () => {
    livros.push(livro('promo', {
      collection_id: 'col-1', price: 8000, sale_price: 1900,
      sale_starts_at: null, sale_ends_at: null,
    }));
    const [produto] = await getCollectionProducts('col-1');
    expect(produto.on_sale).toBe(true);
    expect(produto.variants[0].sale_price_in_cents).toBe(190_000);
  });

  it('sem descrição não se inventa uma', async () => {
    livros.push(livro('sem-texto', { collection_id: 'col-1', description: '' }));
    const [produto] = await getCollectionProducts('col-1');
    expect(produto.description).toBe('');
  });

  it('sem colecção, não vai à base de dados', async () => {
    expect(await getCollectionProducts('')).toEqual([]);
    expect(await getCollectionProducts(null)).toEqual([]);
    expect(getFullList).not.toHaveBeenCalledWith('stock_books', expect.anything());
  });
});

describe('cache do catálogo', () => {
  /** Quantas vezes se foi buscar a lista inteira de livros. */
  const descargas = () => getFullList.mock.calls.filter(([nome]) => nome === 'stock_books').length;

  it('pedidos simultâneos partilham uma leitura só', async () => {
    livros.push(livro('a'), livro('b'));
    // É o caso real: na página inicial, o cabeçalho, as prateleiras e o "Mais para si"
    // pedem o catálogo no mesmo instante, antes de qualquer resposta chegar.
    const [um, dois, tres] = await Promise.all([getProducts({}), getProducts({}), getProducts({})]);
    expect(descargas()).toBe(1);
    expect(um.products).toHaveLength(2);
    expect(dois.products).toHaveLength(2);
    expect(tres.products).toHaveLength(2);
  });

  it('quem chega logo a seguir aproveita o que já foi lido', async () => {
    livros.push(livro('a'));
    await getProducts({});
    await getProducts({});
    await getCategories();
    expect(descargas()).toBe(1);
  });

  it('consultas diferentes não se confundem umas com as outras', async () => {
    livros.push(livro('a'), livro('b'), livro('c'));
    await getProducts({});
    await getProducts({ limit: 2 });
    // A lista inteira veio do getFullList; a limitada do getList.
    expect(descargas()).toBe(1);
    expect(getList.mock.calls.filter(([nome]) => nome === 'stock_books')).toHaveLength(1);
  });

  it('um erro não fica guardado: o pedido seguinte tenta outra vez', async () => {
    // Só a primeira leitura dos livros falha. (As colecções são lidas à parte e têm cache
    // própria, por isso o mock tem de distinguir a tabela em vez de contar chamadas.)
    let falhar = true;
    getFullList.mockImplementation(async (nome) => {
      if (nome === 'book_collections') return [];
      if (falhar) { falhar = false; throw new Error('rede'); }
      return livros;
    });
    await expect(getProducts({})).rejects.toThrow('rede');
    livros.push(livro('a'));
    const { products } = await getProducts({});
    expect(products).toHaveLength(1);
  });

  it('`clearCatalogCache` obriga a ler de novo', async () => {
    livros.push(livro('a'));
    await getProducts({});
    clearCatalogCache();
    await getProducts({});
    expect(descargas()).toBe(2);
  });
});
