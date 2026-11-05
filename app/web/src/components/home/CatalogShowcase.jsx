import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getProducts, getProduct } from '@/api/EcommerceApi';
import ProductRail from '@/components/home/ProductRail';
import QuickViewModal from '@/components/QuickViewModal';
import { Button } from '@/components/ui/button';
import { buildShowcaseCategories, categoryShopLink } from '@/lib/catalogCategories';

/**
 * Faixas que não entram na página inicial: os destaques já têm a secção própria logo acima
 * (DestaquesSemana), "Disponíveis agora" repete os outros livros todos, e "Catálogo Geral" é
 * uma etiqueta interna, não um tema que o leitor procure.
 */
const HIDDEN_ON_HOME = new Set(['destaques', 'stock', 'catalogo']);

/** Esqueleto com a mesma forma das filas, para a página não saltar quando os livros chegam. */
function RailSkeleton() {
  return (
    <div className="container-custom py-7 md:py-9" aria-hidden="true">
      <div className="mb-4 h-7 w-48 rounded bg-muted" />
      <div className="flex gap-3 overflow-hidden sm:gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="w-[calc((100%-0.75rem)/2)] shrink-0 sm:w-[calc((100%-2rem)/3)] md:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]">
            <div className="aspect-[2/3] rounded-xl bg-muted" />
            <div className="mt-2 h-4 w-4/5 rounded bg-muted" />
            <div className="mt-1.5 h-4 w-1/2 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Montra da página inicial: primeiro as novidades, depois uma prateleira por tema, cada uma
 * com "Ver todos" para a loja já filtrada. A navegação por tema no topo leva a cada uma.
 */
export default function CatalogShowcase({ onCartOpen }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [modalProduct, setModalProduct] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    getProducts({})
      .then((res) => setProducts(res.products || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) {
      setModalProduct(null);
      setModalLoading(false);
      return;
    }
    setModalProduct(selected);
    setModalLoading(true);
    getProduct(selected.id)
      .then(setModalProduct)
      .catch(() => {})
      .finally(() => setModalLoading(false));
  }, [selected]);

  const rails = useMemo(() => {
    if (!products.length) return [];
    const disponivel = (p) => (p.purchasable && (p.variants?.[0]?.inventory_quantity ?? 0) > 0 ? 1 : 0);
    // Em cada prateleira, os que se podem comprar já vêm primeiro.
    const porDisponibilidade = (list) => [...list].sort((a, b) => disponivel(b) - disponivel(a));
    const novidades = [...products].sort((a, b) => (b.order || 0) - (a.order || 0));
    return [
      {
        id: 'novidades',
        title: 'Novidades',
        description: 'Os títulos mais recentes da livraria',
        books: porDisponibilidade(novidades.slice(0, 12)),
        shopLink: '/shop?sort=newest',
      },
      ...buildShowcaseCategories(products)
        .filter((cat) => !HIDDEN_ON_HOME.has(cat.id))
        .map((cat) => ({ ...cat, books: porDisponibilidade(cat.books), shopLink: categoryShopLink(cat) })),
    ];
  }, [products]);

  if (loading) {
    return (
      <section className="bg-background py-4" aria-busy="true" aria-label="A carregar catálogo">
        <RailSkeleton />
        <RailSkeleton />
      </section>
    );
  }

  if (!rails.length) return null;

  return (
    <>
      <section className="bg-background pt-6 md:pt-10">
        <div className="container-custom">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Explore por tema</h2>
          <nav aria-label="Temas" className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rails.map((rail) => (
              <a
                key={rail.id}
                href={`#cat-${rail.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`cat-${rail.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:border-primary hover:text-primary"
              >
                {rail.title}
              </a>
            ))}
          </nav>
        </div>

        <div className="divide-y divide-border/50">
          {rails.map((rail) => (
            <ProductRail
              key={rail.id}
              id={rail.id}
              title={rail.title}
              description={rail.description}
              accent={rail.accent}
              products={rail.books}
              shopLink={rail.shopLink}
              onCartOpen={onCartOpen}
              onQuickView={setSelected}
            />
          ))}
        </div>

        <div className="container-custom pb-10 pt-4 text-center">
          <Button asChild size="lg" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10">
            <Link to="/shop">Ver o catálogo completo <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>

      <QuickViewModal
        product={modalProduct}
        loading={modalLoading}
        open={!!selected}
        onClose={() => setSelected(null)}
        onCartOpen={onCartOpen}
      />
    </>
  );
}
