import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  SlidersHorizontal, X, LayoutGrid, List, Sparkles,
  ChevronRight, ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProductFilters } from '@/hooks/useProductFilters.jsx';
import ProductsList from '@/components/ProductsList.jsx';
import FilterPanel from '@/components/FilterPanel.jsx';
import AdvancedSearchPanel from '@/components/AdvancedSearchPanel.jsx';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import ShopHeroBackground from '@/components/ShopHeroBackground';
import QuickViewModal from '@/components/QuickViewModal';
import { getProduct } from '@/api/EcommerceApi';
import { pageTitle } from '@/lib/brand';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { applyShopTheme, shopDefaults } from '@/lib/shopTheme';
import { getSearchRelevance } from '@/lib/searchUtils';
import { MOTION } from '@/lib/motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { readPlace, useScrollMemory } from '@/hooks/useScrollMemory';
import CatalogInfiniteTail from '@/components/CatalogInfiniteTail';
import { shopDensityClass } from '@/lib/productGrid';

const SORT_OPTIONS = [
  { value: 'featured', label: 'Destaques' },
  { value: 'title', label: 'A – Z' },
  { value: 'price-low', label: 'Preço: Menor ao Maior' },
  { value: 'price-high', label: 'Preço: Maior ao Menor' },
  { value: 'newest', label: 'Novidades' },
];

function sortProducts(products, sortBy, search = '') {
  return [...products].sort((a, b) => {
    if (sortBy === 'price-low') return a.price_in_cents - b.price_in_cents;
    if (sortBy === 'price-high') return b.price_in_cents - a.price_in_cents;
    if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'newest') return (b.order || 0) - (a.order || 0);
    if (sortBy === 'featured') {
      const relevance = search
        ? getSearchRelevance(b, search) - getSearchRelevance(a, search)
        : 0;
      return relevance
        || (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
        || (b.order || 0) - (a.order || 0);
    }
    return (b.order || 0) - (a.order || 0);
  });
}

const ShopPage = () => {
  const { settings } = useSiteSettings();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  // Páginas a sério em vez do "carregar mais", que empilhava 24 → 48 → 72 → 102 na mesma
  // página: num telemóvel isso é uma lista interminável onde se perde o lugar.
  const [page, setPage] = useState(1);
  const gridTopRef = useRef(null);

  const shop = {
    ...shopDefaults,
    ...settings,
    shop_per_page: Number(settings.shop_per_page) || shopDefaults.shop_per_page,
    shop_grid_columns: Number(settings.shop_grid_columns) || shopDefaults.shop_grid_columns,
  };

  // Ao voltar de um livro, a ordenação, a vista e a densidade voltam como estavam (não vivem
  // no URL). Lidas antes de criar o estado, para a lista começar já na ordem certa: mudar a
  // ordem depois reiniciava a lista e a posição reposta apontava para outros livros.
  const location = useLocation();
  const navType = useNavigationType();
  const [initialPlace] = useState(() => (navType === 'POP' ? readPlace(`${location.pathname}${location.search}`) : null));

  // `?sort=` no endereço (ex.: "Ver todos" das Novidades na página inicial) escolhe a ordem.
  const [urlSort] = useState(() => {
    const v = new URLSearchParams(location.search).get('sort');
    return SORT_OPTIONS.some((o) => o.value === v) ? v : null;
  });
  const [sortBy, setSortBy] = useState(initialPlace?.sortBy || urlSort || shop.shop_default_sort || 'featured');
  const [viewMode, setViewMode] = useState(initialPlace?.viewMode === 'list' ? 'list' : 'grid');
  // Densidade da grelha no desktop largo: a das Configurações da loja.
  const gridCols = shop.shop_grid_columns || 4;
  const [quickView, setQuickView] = useState(null);
  const [modalProduct, setModalProduct] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    applyShopTheme(settings);
  }, [settings]);

  // Escape fecha o painel de filtros, como fecha o carrinho. Sem isto, quem navega pelo
  // teclado só saía dele depois de percorrer todos os filtros lá dentro.
  useEffect(() => {
    if (!isMobileFilterOpen) return undefined;
    const aoTeclar = (e) => { if (e.key === 'Escape') setIsMobileFilterOpen(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isMobileFilterOpen]);

  useEffect(() => {
    // A ordem reposta ao voltar atrás ganha sempre à de omissão das configurações, mesmo
    // que estas cheguem depois do primeiro desenho.
    if (initialPlace?.sortBy || urlSort) return;
    setSortBy(shop.shop_default_sort || 'featured');
  }, [shop.shop_default_sort, initialPlace?.sortBy, urlSort]);

  useEffect(() => {
    if (!quickView) {
      setModalProduct(null);
      setModalLoading(false);
      return undefined;
    }
    setModalProduct(quickView);
    setModalLoading(true);
    getProduct(quickView.id)
      .then(setModalProduct)
      .catch(() => {})
      .finally(() => setModalLoading(false));
  }, [quickView]);

  const {
    allProducts,
    bookCollections,
    availableFilters,
    filteredProducts,
    activeFilters,
    updateFilter,
    updateOptionFilter,
    clearFilters,
    filterCount,
    catalogStats,
    isLoading,
  } = useProductFilters();

  const sortedProducts = useMemo(
    () => sortProducts(filteredProducts, sortBy, activeFilters.search),
    [filteredProducts, sortBy, activeFilters.search]
  );

  const perPage = shop.shop_per_page;
  const pageCount = Math.max(1, Math.ceil(sortedProducts.length / perPage));
  const currentPage = Math.min(page, pageCount);

  // Telemóvel: a lista cresce sozinha ao deslizar, em lotes do tamanho da página
  // (useInfiniteList). Desktop: as páginas numeradas de sempre. A chave de reinício são os
  // filtros escolhidos (o URL) e a ordenação — nunca os dados, para a chegada dos livros não
  // apagar o lugar reposto ao voltar atrás.
  const isMobile = useIsMobile();
  const infinite = useInfiniteList({
    total: sortedProducts.length,
    batch: perPage,
    resetKey: `${location.search}|${sortBy}`,
    enabled: isMobile && !isLoading,
  });
  // Ao voltar de um livro: os mesmos cartões, a mesma página e a mesma posição no ecrã.
  const savedPlace = useScrollMemory({
    ready: !isLoading && sortedProducts.length > 0,
    snapshot: { count: infinite.count, page: currentPage, sortBy, viewMode },
  });
  const { setCount: setInfiniteCount } = infinite;
  useEffect(() => {
    if (isLoading || !savedPlace) return;
    if (savedPlace.count) setInfiniteCount(savedPlace.count);
    if (savedPlace.page) setPage(savedPlace.page);
    // Só uma vez, quando os livros chegam.
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayProducts = isMobile
    ? sortedProducts.slice(0, infinite.count)
    : sortedProducts.slice((currentPage - 1) * perPage, currentPage * perPage);
  // No telemóvel a lista começa sempre no primeiro e vai crescendo.
  const firstShown = sortedProducts.length === 0 ? 0 : isMobile ? 1 : (currentPage - 1) * perPage + 1;
  const lastShown = isMobile ? displayProducts.length : Math.min(currentPage * perPage, sortedProducts.length);

  useEffect(() => {
    setPage(1);
  }, [filteredProducts, sortBy, filterCount, activeFilters.search]);

  // Mudar de página volta ao topo da lista; senão fica-se a meio da página seguinte.
  const goToPage = (next) => {
    const alvo = Math.min(Math.max(next, 1), pageCount);
    setPage(alvo);
    gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };



  // Estável entre renders: uma função criada no JSX muda de identidade a cada render e
  // anula o `memo` dos cartões, que é o que evita refazer os 24 sempre que o painel de
  // filtros abre ou a página muda.
  const handleCartOpen = useCallback(() => setIsCartOpen(true), []);

  // Densidade no desktop largo (ver lib/productGrid.js): a grelha é a mesma do resto do site.
  const gridClass = shopDensityClass(gridCols);


  const heroTitle = shop.shop_hero_title || shopDefaults.shop_hero_title;
  const heroSubtitle = shop.shop_hero_subtitle || shop.tagline || shopDefaults.shop_hero_subtitle;
  const heroBadge = shop.shop_hero_badge || shopDefaults.shop_hero_badge;

  const activeFilterChips = [
    activeFilters.search && { key: 'search', label: `«${activeFilters.search}»`, clear: () => updateFilter('search', '') },
    activeFilters.author && { key: 'author', label: `Autor: ${activeFilters.author}`, clear: () => updateFilter('author', '') },
    activeFilters.collection && bookCollections.find((c) => c.id === activeFilters.collection) && {
      key: 'collection',
      label: bookCollections.find((c) => c.id === activeFilters.collection).title,
      clear: () => updateFilter('collection', ''),
    },
    ...activeFilters.categories.map((c) => ({
      key: `cat-${c}`,
      label: c,
      clear: () => updateFilter('categories', activeFilters.categories.filter((x) => x !== c)),
    })),
    activeFilters.inStockOnly && { key: 'stock', label: 'Com stock', clear: () => updateFilter('inStockOnly', false) },
    activeFilters.featuredOnly && { key: 'feat', label: 'Destaques', clear: () => updateFilter('featuredOnly', false) },
  ].filter(Boolean);

  return (
    <>
      <Helmet>
        <title>{pageTitle(`${heroTitle} — ${settings.site_name || 'Loja'}`)}</title>
        <meta name="description" content={heroSubtitle} />
      </Helmet>

      <Header onCartOpen={handleCartOpen} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      {/* Hero personalizável com fundo configurável */}
      <ShopHeroBackground settings={shop}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-2 text-white/70 text-sm mb-4">
              <Sparkles className="h-4 w-4" />
              <span>{heroBadge}</span>
              <span className="text-white/40">·</span>
              <Link to="/" className="-my-1.5 inline-block py-1.5 hover:text-white transition-colors">Início</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white">Loja</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold mb-3 tracking-tight">{heroTitle}</h1>
            <p className="text-white/85 max-w-2xl text-lg mb-8">{heroSubtitle}</p>
          </motion.div>
      </ShopHeroBackground>

      <QuickViewModal
        product={modalProduct}
        loading={modalLoading}
        open={!!quickView}
        onClose={() => setQuickView(null)}
        onCartOpen={handleCartOpen}
      />

      {/* Géneros rápidos */}
      {isLoading && !availableFilters.genres?.length && (
        <div className="border-b border-border bg-muted/20" aria-hidden="true">
          {/* A mesma caixa da fila a sério: `py-3` à volta de um botão de 40px. */}
          <div className="container-custom py-3 flex gap-2 items-center overflow-hidden">
            <span className="h-4 w-14 shrink-0 rounded bg-muted" />
            {[91, 138, 125, 177].map((largura) => (
              <span key={largura} className="h-10 sm:h-8 shrink-0 rounded-full bg-muted" style={{ width: largura }} />
            ))}
          </div>
        </div>
      )}
      {availableFilters.genres?.length > 0 && (
        <div className="border-b border-border bg-muted/20 sticky top-[var(--header-offset,0px)] z-20 backdrop-blur-md bg-background/80">
          <div className="container-custom py-3 flex gap-2 overflow-x-auto scrollbar-hide items-center">
            <span className="text-xs font-medium text-muted-foreground shrink-0 mr-1">Género:</span>
            <Button
              size="sm"
              variant={activeFilters.categories.length === 0 && !activeFilters.collection ? 'default' : 'outline'}
              className={`rounded-full shrink-0 h-10 sm:h-8 ${activeFilters.categories.length === 0 && !activeFilters.collection ? 'btn-primary' : ''}`}
              onClick={() => { updateFilter('categories', []); updateFilter('collection', ''); }}
            >
              Todos ({catalogStats.total})
            </Button>
            {availableFilters.genres.map((g) => {
              const count = allProducts.filter((p) => p.type?.value === g).length;
              const active = activeFilters.categories.includes(g);
              return (
                <Button
                  key={g}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className={`rounded-full shrink-0 h-10 sm:h-8 ${active ? 'btn-primary' : ''}`}
                  onClick={() => updateFilter('categories', active ? [] : [g])}
                >
                  {g} ({count})
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <main className="container-custom py-10 min-h-screen">
        <AdvancedSearchPanel
          className="mb-6"
          activeFilters={activeFilters}
          updateFilter={updateFilter}
          onClear={clearFilters}
          onSearch={() => gridTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          bookCollections={bookCollections}
          publishers={availableFilters.publishers}
          resultCount={filteredProducts.length}
          filterCount={filterCount}
          quickGenres={availableFilters.genres}
          catalog={allProducts}
          showQuickGenres={false}
        />

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar filtros */}
          <aside className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-28 bg-card border border-border rounded-2xl p-6 shadow-sm">
              <FilterPanel
                availableFilters={availableFilters}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                updateOptionFilter={updateOptionFilter}
                clearFilters={clearFilters}
                filterCount={filterCount}
                bookCollections={bookCollections}
              />
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {/* Barra de ferramentas */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-card border border-border p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sem botão "Pesquisar" aqui: o campo de pesquisa completo está logo acima. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setIsMobileFilterOpen(true)}>
                      <SlidersHorizontal className="h-4 w-4 mr-1" />
                      Filtros {filterCount > 0 && `(${filterCount})`}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Filtrar catálogo</TooltipContent>
                </Tooltip>
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  <strong className="text-foreground">{sortedProducts.length}</strong>
                  {sortedProducts.length === 1 ? ' livro' : ' livros'}
                  {sortedProducts.length > displayProducts.length && ` · a mostrar ${firstShown}–${lastShown}`}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                <div className="flex border rounded-lg overflow-hidden">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 sm:h-9 sm:w-9 rounded-none" onClick={() => setViewMode('grid')}>
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Visualização em Grelha</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-11 w-11 sm:h-9 sm:w-9 rounded-none" onClick={() => setViewMode('list')}>
                        <List className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Visualização em Lista</TooltipContent>
                  </Tooltip>
                </div>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[160px] h-11 sm:h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Chips de filtros activos */}
            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-5">
                {activeFilterChips.map((chip) => (
                  <span key={chip.key} className="text-sm bg-[rgb(var(--brand-primary-rgb)/0.1)] text-[var(--brand-primary)] px-3 py-1 rounded-full flex items-center gap-1">
                    {chip.label}
                    <button type="button" className="ml-1 hover:opacity-70" onClick={chip.clear}>×</button>
                  </span>
                ))}
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7">Limpar tudo</Button>
              </div>
            )}

            <div ref={gridTopRef} aria-hidden="true" className="scroll-mt-24" />
            {/* Sem `key` derivada dos filtros. Tinha-a para reanimar a entrada sempre que a
                selecção mudava, mas mudar a `key` faz o React desmontar e montar de novo os
                24 cartões — o caminho mais caro possível para uma acção que o utilizador
                espera ver responder de imediato. A animação de entrada mantém-se na primeira
                montagem; a seguir, o React reconcilia pelos `key={product.id}` de cada
                cartão e reaproveita os que não mudaram. Quem muda um filtro já tem a
                contagem de resultados a dizer-lhe que mudou. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: MOTION.base, ease: MOTION.ease }}
              className={viewMode === 'grid' ? gridClass : ''}
            >
              <ProductsList
                embedded
                products={displayProducts}
                isLoading={isLoading}
                skeletonCount={perPage}
                onCartOpen={handleCartOpen}
                viewMode={viewMode}
                onQuickView={setQuickView}
              />
            </motion.div>

            {/* Enquanto carrega, fica aqui um espaço com a altura da navegação de páginas.
                Sem ele, a navegação aparecia de repente no fim da lista e empurrava o rodapé
                quando os produtos terminavam de carregar. */}
            {isLoading && <div className="mt-10 h-9" aria-hidden />}

            {isMobile && !isLoading && (
              <CatalogInfiniteTail
                sentinelRef={infinite.sentinelRef}
                hasMore={infinite.hasMore}
                loadMore={infinite.loadMore}
                shown={displayProducts.length}
                total={sortedProducts.length}
                onClearFilters={filterCount > 0 || activeFilters.search ? clearFilters : undefined}
              />
            )}

            {!isMobile && pageCount > 1 && !isLoading && (
              <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Páginas do catálogo">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Página anterior"
                  className="min-w-11 h-11 sm:min-w-0 sm:h-8"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Anterior</span>
                </Button>

                {/* Telemóvel: só "Página 2 de 5" — uma fila de números não cabe em 375 px. */}
                <span className="sm:hidden text-sm text-muted-foreground px-2">
                  Página <strong className="text-foreground">{currentPage}</strong> de {pageCount}
                </span>

                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: pageCount }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === pageCount || Math.abs(n - currentPage) <= 1)
                    .map((n, i, lista) => (
                      <React.Fragment key={n}>
                        {i > 0 && n - lista[i - 1] > 1 && <span className="px-1 text-muted-foreground">…</span>}
                        <Button
                          variant={n === currentPage ? 'default' : 'outline'}
                          size="sm"
                          className={n === currentPage ? 'btn-primary w-9' : 'w-9'}
                          onClick={() => goToPage(n)}
                          aria-current={n === currentPage ? 'page' : undefined}
                          aria-label={`Página ${n}`}
                        >
                          {n}
                        </Button>
                      </React.Fragment>
                    ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  aria-label="Página seguinte"
                  className="min-w-11 h-11 sm:min-w-0 sm:h-8"
                >
                  <span className="hidden sm:inline mr-1">Seguinte</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </nav>
            )}
          </div>
        </div>

        {isMobileFilterOpen && (
          <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMobileFilterOpen(false)}
          >
            {/* Tocar na zona escurecida fecha — num telemóvel é o gesto que se tenta primeiro,
                e aqui não fazia nada: só o X no canto fechava o painel. */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              className="fixed inset-y-0 left-0 w-full max-w-sm bg-background border-r p-6 overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-filtros"
            >
              <div className="flex justify-between mb-6 pb-4 border-b">
                <h2 id="titulo-filtros" className="text-xl font-semibold">Filtros</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsMobileFilterOpen(false)}><X /></Button>
              </div>
              <FilterPanel
                availableFilters={availableFilters}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                updateOptionFilter={updateOptionFilter}
                clearFilters={clearFilters}
                filterCount={filterCount}
                bookCollections={bookCollections}
              />
              <Button className="w-full btn-primary mt-6" onClick={() => setIsMobileFilterOpen(false)}>
                Ver {sortedProducts.length} livros
              </Button>
            </motion.div>
          </div>
        )}
      </main>

      {/* No telemóvel o catálogo segue sem rodapé (a barra inferior e o menu do cabeçalho
          levam às mesmas páginas); no desktop fica o de sempre. */}
      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  );
};

export default ShopPage;
