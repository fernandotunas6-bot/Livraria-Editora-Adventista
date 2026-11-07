import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts, getCategories, getBookCollections } from '@/api/EcommerceApi';
import { BOOK_GENRES } from '@/lib/bookConstants';
import { PRODUCT_TYPES } from '@/lib/productTypes';
import { matchesTokenizedSearch, buildProductSearchHaystack, getSearchRelevance } from '@/lib/searchUtils';
import { DEFAULT_SORT, normalizeSort, sortProducts } from '@/lib/productSort';

/**
 * O estado do catálogo em parâmetros de endereço.
 *
 * A ordenação vai aqui, e não só no estado da página, por duas razões. A primeira é que um
 * link tem de poder dizer o que mostra: `/shop?sort=price-low` é "os mais baratos", e já
 * existiam links desses no site (o painel lateral do "Mais para si" aponta para
 * `/shop?sort=newest`). A segunda é que este ficheiro reescreve o endereço a partir dos
 * filtros: tudo o que ele não conheça é apagado do endereço no primeiro render — era o que
 * acontecia ao `sort`, que funcionava à chegada e desaparecia a seguir, deixando o endereço
 * a dizer uma coisa e a lista a mostrar outra.
 */
export function buildCatalogSearchParams(activeFilters, availableMaxPrice, sortBy = '') {
  const params = new URLSearchParams();

  if (activeFilters.categories.length > 0) params.set('category', activeFilters.categories.join(','));
  if (activeFilters.collection) params.set('collection', activeFilters.collection);
  if (activeFilters.search) params.set('search', activeFilters.search);
  if (activeFilters.author) params.set('author', activeFilters.author);
  if (activeFilters.isbn) params.set('isbn', activeFilters.isbn);
  if (activeFilters.publisher) params.set('publisher', activeFilters.publisher);
  if (activeFilters.language) params.set('language', activeFilters.language);
  if (activeFilters.productType) params.set('tipo', activeFilters.productType);
  if (activeFilters.yearFrom) params.set('yearFrom', activeFilters.yearFrom);
  if (activeFilters.yearTo) params.set('yearTo', activeFilters.yearTo);
  if (activeFilters.featuredOnly) params.set('featuredOnly', 'true');
  if (activeFilters.inStockOnly) params.set('inStockOnly', 'true');
  if (activeFilters.minPrice > 0) params.set('minPrice', activeFilters.minPrice);
  if (activeFilters.maxPrice !== Infinity && activeFilters.maxPrice < availableMaxPrice) {
    params.set('maxPrice', activeFilters.maxPrice);
  }

  // Só quando não é a de omissão: o endereço limpo é o mais comum e não precisa de ruído.
  if (sortBy && sortBy !== DEFAULT_SORT) params.set('sort', sortBy);

  Object.entries(activeFilters.options || {}).forEach(([key, values]) => {
    values.forEach((val) => params.append(key, val));
  });

  return params;
}

/**
 * Das opções que vieram no endereço, as que são mesmo atributos do catálogo.
 *
 * O `useProductFilters` trata qualquer parâmetro desconhecido como filtro por atributo do
 * livro — é o que permite `?acabamento=capa-dura` sem ter de o declarar. Mas isso apanhava
 * também os parâmetros de rastreio que as campanhas, o Facebook e o WhatsApp acrescentam
 * sozinhos aos links (`utm_source`, `fbclid`, `gclid`): nenhum livro tem esse atributo, por
 * isso o filtro excluía o catálogo inteiro e a loja aparecia vazia a quem viesse por aí.
 *
 * A regra é a correspondência com o que o catálogo tem, e não uma lista de nomes a ignorar:
 * amanhã aparece outro parâmetro de rastreio qualquer e esta função não precisa de mudar.
 */
export function usableOptionFilters(activeOptions, availableOptions) {
  const usable = {};
  for (const [name, values] of Object.entries(activeOptions || {})) {
    if (!Array.isArray(values) || values.length === 0) continue;
    if (!availableOptions || !(name in availableOptions)) continue;
    usable[name] = values;
  }
  return usable;
}

export function useProductFilters(initialCategory = null, { defaultSort = DEFAULT_SORT } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allProducts, setAllProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [categoriesMap, setCategoriesMap] = useState({});
  const [bookCollections, setBookCollections] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingProducts(true);
      try {
        const [productsRes, categoriesRes, collections] = await Promise.all([
          getProducts({}),
          getCategories().catch(() => ({ categories: [] })),
          getBookCollections().catch(() => []),
        ]);

        const products = productsRes.products || [];
        setAllProducts(products);
        setTotalCount(productsRes.total ?? products.length);
        setBookCollections(collections);

        const catMap = {};
        (categoriesRes.categories || []).forEach((c) => {
          catMap[c.id] = c.title;
        });
        setCategoriesMap(catMap);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError(err.message);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    fetchData();
  }, []);

  const availableFilters = useMemo(() => {
    const optionsMap = new Map();
    let minPrice = Infinity;
    let maxPrice = 0;
    const genresInCatalog = new Set();
    const languages = new Set();
    const publishers = new Set();

    allProducts.forEach((product) => {
      if (product.type?.value) genresInCatalog.add(product.type.value);
      if (product.language) languages.add(product.language);
      if (product.publisher) publishers.add(product.publisher);

      product.options?.forEach((opt) => {
        if (!opt.title || opt.title.toLowerCase() === 'title' || opt.title.toLowerCase() === 'size') return;
        if (!optionsMap.has(opt.title)) optionsMap.set(opt.title, new Set());
        opt.values.forEach((val) => {
          if (val.value) optionsMap.get(opt.title).add(val.value);
        });
      });

      const price = product.price_in_cents / 100;
      if (price > maxPrice) maxPrice = Math.ceil(price / 100) * 100;
      if (price < minPrice) minPrice = Math.floor(price / 100) * 100;
    });

    const dynamicOptions = {};
    optionsMap.forEach((values, key) => {
      dynamicOptions[key] = Array.from(values).sort();
    });

    if (minPrice === Infinity) minPrice = 0;
    if (maxPrice === 0) maxPrice = 5000;

    const genres = [
      ...BOOK_GENRES.filter((g) => genresInCatalog.has(g)),
      ...Array.from(genresInCatalog).filter((g) => !BOOK_GENRES.includes(g)).sort(),
    ];

    return {
      options: dynamicOptions,
      minPrice,
      maxPrice,
      genres,
      languages: Array.from(languages).sort(),
      publishers: Array.from(publishers).sort(),
      // Tipos de produto presentes, pela ordem de PRODUCT_TYPES. Só livros: o filtro não aparece.
      productTypes: PRODUCT_TYPES.map((t) => t.value).filter((v) => allProducts.some((p) => (p.product_type || 'livro') === v)),
    };
  }, [allProducts]);

  const [activeFilters, setActiveFilters] = useState(() => {
    const initialOptions = {};
    const knownParams = ['category', 'collection', 'minPrice', 'maxPrice', 'search', 'rating', 'author', 'isbn', 'publisher', 'language', 'yearFrom', 'yearTo', 'featuredOnly', 'inStockOnly', 'tipo', 'sort'];

    for (const [key, value] of searchParams.entries()) {
      if (!knownParams.includes(key)) {
        if (!initialOptions[key]) initialOptions[key] = [];
        initialOptions[key].push(value);
      }
    }

    const catParam = searchParams.get('category');
    let urlCategories = catParam ? catParam.split(',').filter(Boolean) : [];
    if (initialCategory && urlCategories.length === 0 && !searchParams.has('category')) {
      urlCategories = [initialCategory];
    }

    return {
      categories: urlCategories,
      collection: searchParams.get('collection') || '',
      minPrice: searchParams.has('minPrice') ? Number(searchParams.get('minPrice')) : 0,
      maxPrice: searchParams.has('maxPrice') ? Number(searchParams.get('maxPrice')) : Infinity,
      search: searchParams.get('search') || '',
      author: searchParams.get('author') || '',
      isbn: searchParams.get('isbn') || '',
      publisher: searchParams.get('publisher') || '',
      language: searchParams.get('language') || '',
      productType: searchParams.get('tipo') || '',
      yearFrom: searchParams.get('yearFrom') || '',
      yearTo: searchParams.get('yearTo') || '',
      featuredOnly: searchParams.get('featuredOnly') === 'true',
      inStockOnly: searchParams.get('inStockOnly') === 'true',
      options: initialOptions,
    };
  });

  // A ordenação começa no endereço (um link partilhado manda) e só depois na predefinição de
  // quem chama (as Configurações da loja). Um valor estranho no endereço cai na de omissão em
  // vez de deixar a lista por ordenar.
  const [sortBy, setSortByState] = useState(() => normalizeSort(searchParams.get('sort'), defaultSort));
  const setSortBy = useCallback((value) => setSortByState(normalizeSort(value, defaultSort)), [defaultSort]);

  const urlSearch = searchParams.get('search') || '';
  useEffect(() => {
    setActiveFilters((prev) => (prev.search !== urlSearch ? { ...prev, search: urlSearch } : prev));
  }, [urlSearch]);

  useEffect(() => {
    const nextParams = buildCatalogSearchParams(activeFilters, availableFilters.maxPrice, sortBy);
    const nextQuery = nextParams.toString();

    if (searchParams.toString() !== nextQuery) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [activeFilters, availableFilters.maxPrice, sortBy, searchParams, setSearchParams]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      if (activeFilters.collection && product.collection_id !== activeFilters.collection) return false;

      if (activeFilters.categories.length > 0) {
        const productType = product.type?.value || '';
        const productCategoryNames = (product.collections || []).map((c) =>
          categoriesMap[c.collection_id] || c.title || ''
        );
        const matchesCategory = activeFilters.categories.some((cat) => {
          return matchesTokenizedSearch(productType, cat)
            || productCategoryNames.some((name) => matchesTokenizedSearch(name, cat));
        });
        if (!matchesCategory) return false;
      }

      if (activeFilters.search) {
        if (!matchesTokenizedSearch(buildProductSearchHaystack(product), activeFilters.search)) return false;
      }

      if (activeFilters.author) {
        const authorHay = [product.subtitle, product.author].filter(Boolean).join(' ');
        if (!matchesTokenizedSearch(authorHay, activeFilters.author)) return false;
      }
      if (activeFilters.isbn) {
        const codes = [product.isbn, product.book_code, product.sku].filter(Boolean).join(' ');
        if (!matchesTokenizedSearch(codes, activeFilters.isbn)) return false;
      }
      if (activeFilters.publisher && !matchesTokenizedSearch(product.publisher, activeFilters.publisher)) return false;
      if (activeFilters.language && (product.language || '') !== activeFilters.language) return false;
      if (activeFilters.yearFrom || activeFilters.yearTo) {
        const year = Number(product.year);
        if (!Number.isFinite(year)) return false;
        if (activeFilters.yearFrom && year < Number(activeFilters.yearFrom)) return false;
        if (activeFilters.yearTo && year > Number(activeFilters.yearTo)) return false;
      }
      if (activeFilters.productType && (product.product_type || 'livro') !== activeFilters.productType) return false;
      if (activeFilters.featuredOnly && !product.featured) return false;
      if (activeFilters.inStockOnly && !product.purchasable) return false;

      const price = product.price_in_cents / 100;
      if (price < activeFilters.minPrice || price > activeFilters.maxPrice) return false;

      // `usableOptionFilters` descarta o que veio no endereço mas não é atributo do
      // catálogo — os parâmetros de rastreio, por exemplo.
      for (const [optionName, selectedValues] of Object.entries(usableOptionFilters(activeFilters.options, availableFilters.options))) {
        const productOption = product.options?.find((o) => o.title === optionName);
        if (!productOption) return false;
        const productOptionValues = productOption.values.map((v) => v.value);
        if (!selectedValues.some((val) => productOptionValues.includes(val))) return false;
      }

      return true;
    });
  }, [allProducts, activeFilters, categoriesMap, availableFilters.options]);

  /**
   * Os produtos filtrados **e organizados**, pelo critério escolhido.
   *
   * A ordem vive aqui e não em cada página: eram duas implementações, e a página de categoria
   * chamava "Novidades" à ordem inversa da loja (ver `lib/productSort.js`). Com pesquisa
   * activa, a relevância do termo ganha ao critério "Destaques" — quem escreveu um título
   * quer esse livro primeiro.
   */
  const sortedProducts = useMemo(() => {
    const termo = activeFilters.search;
    const relevance = termo ? (p) => getSearchRelevance(p, termo) : null;
    return sortProducts(filteredProducts, sortBy, { relevance });
  }, [filteredProducts, sortBy, activeFilters.search]);

  const updateFilter = useCallback((key, value) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateOptionFilter = useCallback((optionName, values) => {
    setActiveFilters((prev) => ({
      ...prev,
      options: { ...prev.options, [optionName]: values },
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveFilters({
      categories: initialCategory ? [initialCategory] : [],
      collection: '',
      minPrice: availableFilters.minPrice || 0,
      maxPrice: availableFilters.maxPrice || 5000,
      search: '',
      author: '',
      isbn: '',
      publisher: '',
      language: '',
      productType: '',
      yearFrom: '',
      yearTo: '',
      featuredOnly: false,
      inStockOnly: false,
      options: {},
    });
  }, [initialCategory, availableFilters.minPrice, availableFilters.maxPrice]);

  const filterCount = useMemo(() => {
    let count = 0;
    const addedCategories = activeFilters.categories.filter(
      (c) => !initialCategory || c.toLowerCase() !== initialCategory.toLowerCase()
    );
    count += addedCategories.length;
    if (activeFilters.collection) count++;
    if (activeFilters.search) count++;
    if (activeFilters.author) count++;
    if (activeFilters.isbn) count++;
    if (activeFilters.publisher) count++;
    if (activeFilters.language) count++;
    if (activeFilters.productType) count++;
    if (activeFilters.yearFrom || activeFilters.yearTo) count++;
    if (activeFilters.featuredOnly) count++;
    if (activeFilters.inStockOnly) count++;
    if (activeFilters.minPrice > (availableFilters.minPrice || 0) ||
        (activeFilters.maxPrice !== Infinity && activeFilters.maxPrice < (availableFilters.maxPrice || 5000))) {
      count++;
    }
    // Pela mesma razão: um parâmetro de rastreio no endereço não é um filtro que o
    // utilizador tenha escolhido, e não deve aparecer como "Filtros (1)".
    Object.values(usableOptionFilters(activeFilters.options, availableFilters.options))
      .forEach((values) => { count += values.length; });
    return count;
  }, [activeFilters, initialCategory, availableFilters.minPrice, availableFilters.maxPrice, availableFilters.options]);

  const catalogStats = useMemo(() => ({
    total: allProducts.length,
    inStock: allProducts.filter((p) => p.purchasable).length,
    featured: allProducts.filter((p) => p.featured).length,
    genres: availableFilters.genres.length,
    collections: bookCollections.length,
  }), [allProducts, availableFilters.genres, bookCollections]);

  const hasActiveBrowsing = filterCount > 0 || !!activeFilters.search || activeFilters.categories.length > 0;

  return {
    allProducts,
    totalCount,
    bookCollections,
    availableFilters,
    filteredProducts,
    sortedProducts,
    sortBy,
    setSortBy,
    activeFilters,
    updateFilter,
    updateOptionFilter,
    clearFilters,
    filterCount,
    catalogStats,
    hasActiveBrowsing,
    isLoading: isLoadingProducts,
    error,
    minPrice: activeFilters.minPrice,
    maxPrice: activeFilters.maxPrice,
  };
}
