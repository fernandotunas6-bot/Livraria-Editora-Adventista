import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, ChevronRight, BookOpen, Filter, X } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ShoppingCart from '@/components/ShoppingCart';
import ProductCard from '@/components/ProductCard';
import { PRODUCT_GRID_CLASS } from '@/lib/productGrid';
import { useCatalogWindow } from '@/hooks/useCatalogWindow';
import CatalogInfiniteTail from '@/components/CatalogInfiniteTail';
import QuickViewModal from '@/components/QuickViewModal';
import { pageTitle } from '@/lib/brand';
import { getCollections } from '@/api/PlatformApi';
import { getCollectionProducts } from '@/api/EcommerceApi';
import CatalogToolbar from '@/components/catalog/CatalogToolbar.jsx';
import { DEFAULT_SORT, canGroupByType, groupByType, normalizeSort, sortProducts } from '@/lib/productSort';
import { Button } from '@/components/ui/button';
import PageBannerSlider from '@/components/PageBannerSlider';

// Normalized helper to avoid accent differences matching (e.g. "Religião" vs "religiao")
const getNormalizedGenre = (genre) => {
  if (!genre) return '';
  return genre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

const CATEGORY_MAPPINGS = {
  educational: ['educacao', 'saude', 'familia', 'educativo', 'juvenil'],
  inspirational: ['religiao', 'devocional', 'biografia', 'inspiracional'],
  children: ['infantil', 'criancas', 'infanto-juvenil']
};


export default function CollectionsPage() {
  const { slug } = useParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering and Modal States
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [quickView, setQuickView] = useState(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const activeCollection = slug
    ? collections.find((c) => c.slug === slug || c.id === slug)
    : null;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const cols = await getCollections();
        setCollections(cols);
        if (slug) {
          const col = cols.find((c) => c.slug === slug || c.id === slug);
          if (col) {
            // A mesma conversão da loja e da ficha do produto (ver `getCollectionProducts`):
            // a conversão própria que aqui estava partia o carrinho e mostrava preços e
            // disponibilidade diferentes dos do resto do site.
            setBooks(await getCollectionProducts(col.id));
            // Reset filters on collection change
            setSelectedCategory('all');
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Pre-calculate category counts
  const counts = useMemo(() => {
    let educational = 0;
    let inspirational = 0;
    let children = 0;

    books.forEach((book) => {
      // Num produto o género está em `type.value` — a conversão de sempre põe-no lá.
      const g = getNormalizedGenre(book.type?.value);
      if (CATEGORY_MAPPINGS.educational.includes(g)) educational++;
      if (CATEGORY_MAPPINGS.inspirational.includes(g)) inspirational++;
      if (CATEGORY_MAPPINGS.children.includes(g)) children++;
    });

    return { educational, inspirational, children };
  }, [books]);

  // Filter books based on active category
  const filteredBooks = useMemo(() => {
    if (selectedCategory === 'all') return books;
    const allowed = CATEGORY_MAPPINGS[selectedCategory] || [];
    return books.filter((book) => {
      const g = getNormalizedGenre(book.type?.value);
      return allowed.includes(g);
    });
  }, [books, selectedCategory]);

  // Ordenação, a mesma da loja e das categorias (lib/productSort.js). Esta página não tinha
  // nenhuma: ficava na ordem fixa que o servidor devolve, e quem quisesse ver a colecção pelo
  // preço tinha de ir à loja e filtrar por colecção.
  const [sortBy, setSortByState] = useState(DEFAULT_SORT);
  const setSortBy = (v) => setSortByState(normalizeSort(v));
  const [grouped, setGrouped] = useState(false);

  const sortedBooks = useMemo(() => sortProducts(filteredBooks, sortBy), [filteredBooks, sortBy]);
  const podeAgrupar = useMemo(() => canGroupByType(sortedBooks), [sortedBooks]);

  // Telemóvel: a coleção cresce ao deslizar, como a loja; desktop: inteira, como sempre.
  const catalog = useCatalogWindow({
    items: sortedBooks,
    ready: !loading,
    resetKey: `${slug || ''}|${selectedCategory}|${sortBy}`,
  });

  const grupos = useMemo(
    () => (grouped && podeAgrupar ? groupByType(catalog.visible, sortBy) : []),
    [grouped, podeAgrupar, catalog.visible, sortBy],
  );

  return (
    <>
      <Helmet>
        <title>{pageTitle(activeCollection ? activeCollection.title : 'Coleções')}</title>
        {activeCollection?.seo_description && (
          <meta name="description" content={activeCollection.seo_description} />
        )}
      </Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider contentClassName="text-left">
        <div className="mb-4 flex items-center gap-2 text-sm text-white/75">
          <Link to="/" className="-my-1.5 inline-block py-1.5 hover:text-white">Início</Link>
          <ChevronRight className="h-4 w-4" />
          <Link to="/colecoes" className="-my-1.5 inline-block py-1.5 hover:text-white">Coleções</Link>
          {activeCollection && (
            <>
              <ChevronRight className="h-4 w-4" />
              <span>{activeCollection.title}</span>
            </>
          )}
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-bold leading-tight sm:gap-3 sm:text-3xl/9 md:text-4xl/10">
          <Layers className="h-6 w-6 shrink-0 sm:h-8 sm:w-8" />
          {activeCollection ? activeCollection.title : 'Coleções de Livros'}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/85 sm:text-base">
          {activeCollection
            ? (activeCollection.marketing_tagline || activeCollection.description?.replace(/<[^>]+>/g, '').slice(0, 200))
            : 'Explore catálogos temáticos seleccionados para fortalecer a sua fé e conhecimento.'}
        </p>
      </PageBannerSlider>

      <main className="min-h-screen bg-background">
        <section className="container-custom py-12">
          {loading ? (
            <p className="text-center text-muted-foreground py-20">A carregar...</p>
          ) : !slug ? (
            <div className="space-y-16">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {collections.map((col, i) => (
                  <motion.div
                    key={col.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link
                      to={`/colecoes/${col.slug || col.id}`}
                      className="group block bg-card border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all"
                    >
                      {col.cover ? (
                        <img src={col.cover} alt={col.title} className="w-full h-44 object-cover group-hover:scale-105 transition-transform duration-base" />
                      ) : (
                        <div className="w-full h-44 bg-linear-to-br from-primary/20 to-[#0c4a6e]/20 flex items-center justify-center">
                          <BookOpen className="h-12 w-12 text-primary/50" />
                        </div>
                      )}
                      <div className="p-5">
                        <h2 className="font-bold text-lg group-hover:text-primary transition-colors">{col.title}</h2>
                        {col.marketing_tagline && (
                          <p className="text-sm text-muted-foreground mt-1">{col.marketing_tagline}</p>
                        )}
                        {col.featured && (
                          <span className="inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Destaque</span>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                ))}
                {collections.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-16">
                    Nenhuma coleção disponível de momento.
                  </p>
                )}
              </div>
            </div>
          ) : activeCollection ? (
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Category Filtering Sidebar */}
              <aside className="w-full lg:w-64 shrink-0">
                {/* Desktop Sidebar Panel */}
                <div className="hidden lg:block bg-card border rounded-2xl p-5 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Filtrar Categoria</h3>
                  <div className="space-y-1">
                    {[
                      { id: 'all', label: 'Todos os Livros', count: books.length },
                      { id: 'educational', label: 'Educativos', count: counts.educational },
                      { id: 'inspirational', label: 'Inspiracionais', count: counts.inspirational },
                      { id: 'children', label: 'Infantis', count: counts.children }
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                          selectedCategory === cat.id
                            ? 'bg-primary/10 text-primary font-bold'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedCategory === cat.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {cat.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile Filter Action Area */}
                <div className="lg:hidden flex items-center justify-between bg-card border rounded-xl p-4 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-bold text-foreground">Filtro Ativo</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setMobileFilterOpen(true)}
                    className="rounded-full text-xs"
                  >
                    Filtrar ({selectedCategory === 'all' ? 'Todos' : selectedCategory === 'educational' ? 'Educativo' : selectedCategory === 'inspirational' ? 'Inspiracional' : 'Infantil'})
                  </Button>
                </div>

                {/* Mobile Slide-out Drawer */}
                {mobileFilterOpen && (
                  <div className="fixed inset-0 z-50 bg-black/60 lg:hidden flex justify-end">
                    <div className="bg-background w-80 h-full p-6 shadow-2xl flex flex-col animate-in slide-in-from-right duration-base">
                      <div className="flex items-center justify-between border-b pb-4 mb-6">
                        <h3 className="text-lg font-bold text-foreground">Filtrar por Categoria</h3>
                        <Button variant="ghost" size="icon" onClick={() => setMobileFilterOpen(false)}>
                          <X className="h-5 w-5" />
                        </Button>
                      </div>
                      <div className="space-y-2 flex-1 overflow-y-auto">
                        {[
                          { id: 'all', label: 'Todos os Livros', count: books.length },
                          { id: 'educational', label: 'Educativos', count: counts.educational },
                          { id: 'inspirational', label: 'Inspiracionais', count: counts.inspirational },
                          { id: 'children', label: 'Infantis', count: counts.children }
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => {
                              setSelectedCategory(cat.id);
                              setMobileFilterOpen(false);
                            }}
                            className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                              selectedCategory === cat.id
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${selectedCategory === cat.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                              {cat.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </aside>

              {/* Books Grid. `min-w-0` para a coluna poder encolher: sem isso, qualquer fila
                  que deslize na horizontal alarga a página no telemóvel (achado 68). */}
              <div className="flex-1 min-w-0">
                {sortedBooks.length > 0 ? (
                  <>
                    <CatalogToolbar
                      className="mb-6"
                      total={sortedBooks.length}
                      shownFrom={1}
                      shownTo={catalog.visible.length}
                      shownCount={catalog.visible.length}
                      sortBy={sortBy}
                      onSortChange={setSortBy}
                      grouped={grouped}
                      onGroupedChange={setGrouped}
                      canGroup={podeAgrupar}
                    />
                    {grupos.length > 0 ? (
                      <div className="space-y-10">
                        {grupos.map((grupo) => (
                          <section key={grupo.value} aria-labelledby={`grupo-col-${grupo.value}`}>
                            <div className="mb-4 flex items-baseline gap-2 border-b border-border pb-2">
                              <h2 id={`grupo-col-${grupo.value}`} className="text-lg font-semibold">{grupo.label}</h2>
                              <span className="text-sm text-muted-foreground tabular-nums">{grupo.products.length}</span>
                            </div>
                            <div className={PRODUCT_GRID_CLASS}>
                              {grupo.products.map((book) => (
                                <ProductCard
                                  key={book.id}
                                  product={book}
                                  onQuickView={setQuickView}
                                  onCartOpen={() => setIsCartOpen(true)}
                                />
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className={PRODUCT_GRID_CLASS}>
                        {catalog.visible.map((book) => (
                          <ProductCard
                            key={book.id}
                            product={book}
                            onQuickView={setQuickView}
                            onCartOpen={() => setIsCartOpen(true)}
                          />
                        ))}
                      </div>
                    )}
                    {catalog.isMobile && (
                      <CatalogInfiniteTail
                        sentinelRef={catalog.infinite.sentinelRef}
                        hasMore={catalog.infinite.hasMore}
                        loadMore={catalog.infinite.loadMore}
                        shown={catalog.visible.length}
                        total={sortedBooks.length}
                        onClearFilters={selectedCategory !== 'all' ? () => setSelectedCategory('all') : undefined}
                      />
                    )}
                  </>
                ) : (
                  <div className="text-center py-20 bg-card border rounded-2xl">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/60 mb-3" />
                    <p className="text-muted-foreground font-medium">Nenhum livro encontrado nesta categoria.</p>
                    <Button onClick={() => setSelectedCategory('all')} size="sm" variant="outline" className="mt-4 rounded-full">
                      Limpar Filtros
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-16">Coleção não encontrada.</p>
          )}
        </section>
      </main>

      <QuickViewModal 
        product={quickView} 
        open={!!quickView} 
        onClose={() => setQuickView(null)} 
        onCartOpen={() => setIsCartOpen(true)} 
      />

      {/* No telemóvel o rodapé curto, no computador o completo (ver components/Footer.jsx). */}
      <Footer />
    </>
  );
}
