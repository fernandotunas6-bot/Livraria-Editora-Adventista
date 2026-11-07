import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams, Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProductFilters } from '@/hooks/useProductFilters.jsx';
import CatalogToolbar from '@/components/catalog/CatalogToolbar.jsx';
import ProductsList from '@/components/ProductsList.jsx';
import CatalogInfiniteTail from '@/components/CatalogInfiniteTail';
import { useCatalogWindow } from '@/hooks/useCatalogWindow';
import FilterPanel from '@/components/FilterPanel.jsx';
import Header from '@/components/Header.jsx';
import { pageTitle } from '@/lib/brand';
import Footer from '@/components/Footer.jsx';
import FooterCompact from '@/components/FooterCompact.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PageBannerSlider from '@/components/PageBannerSlider';

const CategoryPage = () => {
  const { category } = useParams();
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  const {
    allProducts,
    availableFilters,
    sortedProducts,
    sortBy,
    setSortBy,
    activeFilters,
    updateFilter,
    updateOptionFilter,
    clearFilters,
    filterCount,
    isLoading
  } = useProductFilters(category);

  // Escape fecha o painel de filtros, como na loja e como fecha o carrinho.
  useEffect(() => {
    if (!isMobileFilterOpen) return undefined;
    const aoTeclar = (e) => { if (e.key === 'Escape') setIsMobileFilterOpen(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isMobileFilterOpen]);

  // O endereço traz a categoria como slug ("catalogo-geral"): mostra-se com espaços e
  // maiúscula inicial. A página vinha do modelo inicial em inglês; ficou em português.
  const categoryName = category
    ? decodeURIComponent(category).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
    : 'Livros';

  // A ordem vem do `useProductFilters` (lib/productSort.js), a mesma da loja. Antes esta
  // página tinha a sua: três critérios em vez de oito, e um "Novidades" que ordenava ao
  // contrário do da loja — `(a.order) - (b.order)`, ou seja os livros mais antigos à frente,
  // com o mesmo nome no ecrã.
  const location = useLocation();
  const catalog = useCatalogWindow({
    items: sortedProducts,
    ready: !isLoading,
    resetKey: `${category}|${location.search}|${sortBy}`,
  });

  return (
    <>
      <Helmet>
        <title>{pageTitle(categoryName)}</title>
        <meta name="description" content={`Livros de ${categoryName} na Livraria Adventista: preços em kwanzas, entrega em Angola.`} />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider contentClassName="text-left">
        <nav className="mb-4 flex items-center gap-2 text-sm text-white/75">
          <Link to="/" className="-my-1.5 inline-block py-1.5 transition-colors hover:text-white">Início</Link>
          <ChevronRight className="h-4 w-4" />
          <Link to="/shop" className="-my-1.5 inline-block py-1.5 transition-colors hover:text-white">Loja</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-white">{categoryName}</span>
        </nav>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{categoryName}</h1>
        <p className="text-base text-white/85 sm:text-lg">Os livros desta categoria, com filtros e ordenação</p>
      </PageBannerSlider>

      <main className="container-custom py-12 min-h-screen">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-24 bg-card border border-border rounded-xl p-6">
              <FilterPanel 
                availableFilters={availableFilters}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                updateOptionFilter={updateOptionFilter}
                clearFilters={clearFilters}
                filterCount={filterCount}
              />
            </div>
          </aside>

          {/* `min-w-0`: sem isto uma coluna flexível não encolhe abaixo do conteúdo mais
              largo que tem dentro, e qualquer fila que deslize na horizontal (os filtros
              escolhidos, um título comprido) alargava a página toda no telemóvel. */}
          <div className="flex-1 min-w-0">
            <CatalogToolbar
              className="mb-6"
              total={sortedProducts.length}
              shownFrom={1}
              shownTo={catalog.isMobile ? catalog.visible.length : sortedProducts.length}
              shownCount={catalog.isMobile ? catalog.visible.length : sortedProducts.length}
              sortBy={sortBy}
              onSortChange={setSortBy}
              filterCount={filterCount}
              onOpenFilters={() => setIsMobileFilterOpen(true)}
            />

            {!isLoading && sortedProducts.length === 0 ? (
              <div className="space-y-12">
                <div className="text-center py-16 bg-card border border-border rounded-xl">
                  <h3 className="text-2xl font-semibold mb-2">Nenhum livro encontrado</h3>
                  <p className="text-muted-foreground mb-6">Não há livros com estes filtros.</p>
                  <Button onClick={clearFilters} variant="outline">Limpar filtros</Button>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-6">Veja todos os livros disponíveis:</h3>
                  <ProductsList products={allProducts} isLoading={isLoading} />
                </div>
              </div>
            ) : (
              catalog.isMobile ? (
                <>
                  <ProductsList embedded products={catalog.visible} isLoading={isLoading} />
                  {!isLoading && (
                    <CatalogInfiniteTail
                      sentinelRef={catalog.infinite.sentinelRef}
                      hasMore={catalog.infinite.hasMore}
                      loadMore={catalog.infinite.loadMore}
                      shown={catalog.visible.length}
                      total={sortedProducts.length}
                      onClearFilters={filterCount > 0 ? clearFilters : undefined}
                    />
                  )}
                </>
              ) : (
                <ProductsList products={sortedProducts} isLoading={isLoading} />
              )
            )}
          </div>
        </div>

        {/* Mobile Filter Drawer */}
        {isMobileFilterOpen && (
          /* Tocar na zona escurecida fecha — num telemóvel é o primeiro gesto que se tenta, e
             aqui não fazia nada: só o X fechava. A loja já se comportava assim. */
          <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMobileFilterOpen(false)}
          >
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed inset-y-0 left-0 w-full max-w-sm bg-background border-r border-border p-6 overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-filtros-categoria"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
                <h2 id="titulo-filtros-categoria" className="text-xl font-semibold">Filtros</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMobileFilterOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <FilterPanel 
                availableFilters={availableFilters}
                activeFilters={activeFilters}
                updateFilter={updateFilter}
                updateOptionFilter={updateOptionFilter}
                clearFilters={clearFilters}
                filterCount={filterCount}
              />
              <div className="mt-8 pt-4 border-t border-border">
                <Button className="w-full btn-primary" onClick={() => setIsMobileFilterOpen(false)}>
                  Ver {sortedProducts.length} livros
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {/* Rodapé completo no computador; no telemóvel a versão curta, com o essencial que a
          barra inferior não tem (privacidade, rastreio, lojas, devoluções). Ver
          components/FooterCompact.jsx. */}
      <div className="hidden md:block">
        <Footer />
      </div>
      <FooterCompact />
    </>
  );
};

export default CategoryPage;