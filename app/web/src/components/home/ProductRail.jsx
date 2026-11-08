import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '@/components/ProductCard';

/** Livros por fila. O resto está a um clique, em "Ver todos". */
export const RAIL_MAX_ITEMS = 12;

/**
 * Uma fila de livros com título e "Ver todos", como nas prateleiras de qualquer loja online.
 *
 * Usa o mesmo cartão da loja (preço, disponibilidade e "Comprar"). A fila desliza na
 * horizontal com encaixe por cartão. Mostra 2 cartões no telemóvel e 6 no ecrã largo, e no
 * desktop tem setas para avançar e recuar.
 */
export default function ProductRail({ id, title, description, accent, products, shopLink, onCartOpen, onQuickView }) {
  const trackRef = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges, products]);

  const scrollBy = (dir) => {
    const el = trackRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  if (!products?.length) return null;
  const items = products.slice(0, RAIL_MAX_ITEMS);

  const arrow = 'hidden h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-xs transition-colors hover:bg-muted disabled:opacity-40 disabled:pointer-events-none md:inline-flex';

  return (
    <section id={id ? `cat-${id}` : undefined} className="scroll-mt-28 py-7 md:py-9" aria-labelledby={id ? `rail-${id}` : undefined}>
      <div className="container-custom">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {accent && <span className="mt-1 h-7 w-1 shrink-0 rounded-full" style={{ background: accent }} aria-hidden="true" />}
            <div className="min-w-0">
              <h2 id={id ? `rail-${id}` : undefined} className="text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
              {description && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className={arrow} onClick={() => scrollBy(-1)} disabled={edges.start} aria-label={`Recuar em ${title}`}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" className={arrow} onClick={() => scrollBy(1)} disabled={edges.end} aria-label={`Avançar em ${title}`}>
              <ChevronRight className="h-4 w-4" />
            </button>
            {shopLink && (
              <Link to={shopLink} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-primary hover:underline">
                Ver todos <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <div
          ref={trackRef}
          onScroll={updateEdges}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 scrollbar-none sm:gap-4 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((product, i) => (
            <div
              key={product.id}
              className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] md:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-4rem)/5)] xl:w-[calc((100%-5rem)/6)]"
            >
              <ProductCard product={product} index={i} onCartOpen={onCartOpen} onQuickView={onQuickView} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
