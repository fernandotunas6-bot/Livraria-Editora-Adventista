import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductsList from '@/components/ProductsList.jsx';
import CatalogInfiniteTail from '@/components/CatalogInfiniteTail';
import { getProducts } from '@/api/EcommerceApi';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInfiniteList } from '@/hooks/useInfiniteList';

const LOTE = 12;

/**
 * Ordem do feed: primeiro os destaques, depois os disponíveis (os mais recentes à frente), e
 * só no fim os esgotados. Cada livro uma vez. Sem "mais vendidos" nem recomendações
 * inventadas: só o que os dados dizem de facto.
 */
export function discoveryOrder(products = []) {
  const seen = new Set();
  const unique = products.filter((p) => p?.id && !seen.has(p.id) && seen.add(p.id));
  const stock = (p) => (p.purchasable === false ? 0 : (p.variants?.[0]?.inventory_quantity ?? 1));
  const rank = (p) => (p.featured && stock(p) > 0 ? 0 : stock(p) > 0 ? 1 : 2);
  return [...unique].sort((a, b) => rank(a) - rank(b) || (b.order || 0) - (a.order || 0));
}

/**
 * Fim da página inicial no telemóvel: o catálogo continua, em lotes, enquanto se desliza.
 * Os livros só são pedidos quando a secção se aproxima do ecrã — quem não chega cá abaixo não
 * paga o pedido. No desktop não aparece: a página inicial fica como sempre foi.
 */
export default function MobileDiscoveryFeed({ onCartOpen }) {
  const isMobile = useIsMobile();
  const sectionRef = useRef(null);
  const [near, setNear] = useState(false);
  const [products, setProducts] = useState(null);

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
    if (!near || products) return undefined;
    let active = true;
    getProducts({})
      .then(({ products: list }) => { if (active) setProducts(discoveryOrder(list || [])); })
      .catch(() => { if (active) setProducts([]); });
    return () => { active = false; };
  }, [near, products]);

  const ordered = useMemo(() => products || [], [products]);
  const infinite = useInfiniteList({ total: ordered.length, batch: LOTE, enabled: isMobile && !!products });

  if (!isMobile) return null;

  return (
    <section ref={sectionRef} className="bg-background pb-6 pt-8 md:hidden" aria-labelledby="titulo-descobrir">
      <div className="container-custom">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="titulo-descobrir" className="text-2xl font-bold">Continue a descobrir</h2>
            <p className="text-sm text-muted-foreground">Todos os livros da livraria</p>
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
