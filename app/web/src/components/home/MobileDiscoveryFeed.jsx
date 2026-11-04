import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductsList from '@/components/ProductsList.jsx';
import CatalogInfiniteTail from '@/components/CatalogInfiniteTail';
import { getProducts } from '@/api/EcommerceApi';
import { useCatalogWindow } from '@/hooks/useCatalogWindow';
import { discoveryOrder, hasInterest, interestFromRecent } from '@/lib/discovery';
import { getRecentlyViewed } from '@/lib/recentlyViewed';

const LOTE = 12;

// A ordem vive em lib/discovery.js; reexportada para os testes deste componente.
export { discoveryOrder };

/**
 * Fim da página inicial no telemóvel: o catálogo continua, em lotes, enquanto se desliza.
 * Os livros só são pedidos quando a secção se aproxima do ecrã — quem não chega cá abaixo não
 * paga o pedido. No desktop não aparece: a página inicial fica como sempre foi.
 */
export default function MobileDiscoveryFeed({ onCartOpen }) {
  const sectionRef = useRef(null);
  const [near, setNear] = useState(false);
  const [products, setProducts] = useState(null);
  const [personal, setPersonal] = useState(false);
  const ordered = useMemo(() => products || [], [products]);
  // Lotes, e o lugar reposto ao voltar de um livro (com a página inicial como chave).
  const { isMobile, saved, infinite } = useCatalogWindow({ items: ordered, ready: !!products, batch: LOTE });

  // Quem volta de um livro estava no meio do feed: carrega já, sem esperar pela aproximação.
  useEffect(() => {
    if (isMobile && saved?.y) setNear(true);
  }, [isMobile, saved]);

  useEffect(() => {
    if (!isMobile || near) return undefined;
    const el = sectionRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile, near]);

  useEffect(() => {
    // Só no telemóvel: no desktop o feed não aparece, e o pedido seria para nada.
    if (!isMobile || !near || products) return undefined;
    let active = true;
    getProducts({})
      .then(({ products: list }) => {
        if (!active) return;
        const interest = interestFromRecent(getRecentlyViewed(), list || []);
        setPersonal(hasInterest(interest));
        setProducts(discoveryOrder(list || [], interest));
      })
      .catch(() => { if (active) setProducts([]); });
    return () => { active = false; };
  }, [isMobile, near, products]);

  if (!isMobile) return null;

  return (
    <section ref={sectionRef} className="bg-background pb-6 pt-8 md:hidden" aria-labelledby="titulo-descobrir">
      <div className="container-custom">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="titulo-descobrir" className="text-2xl font-bold">Continue a descobrir</h2>
            <p className="text-sm text-muted-foreground">
              {personal ? 'Primeiro, livros parecidos com os que viu; depois, todo o catálogo' : 'Todos os livros da livraria'}
            </p>
          </div>
          <Link to="/shop" className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            Loja <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div>
          <ProductsList
            embedded
            products={ordered.slice(0, infinite.count)}
            isLoading={!products}
            skeletonCount={4}
            onCartOpen={onCartOpen}
          />
        </div>
        {products && (
          <CatalogInfiniteTail
            sentinelRef={infinite.sentinelRef}
            hasMore={infinite.hasMore}
            loadMore={infinite.loadMore}
            shown={Math.min(infinite.count, ordered.length)}
            total={ordered.length}
          />
        )}
      </div>
    </section>
  );
}
