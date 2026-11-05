import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, MessageCircle, Package, Sparkles, Star } from 'lucide-react';
import ProductsList from '@/components/ProductsList.jsx';
import CatalogInfiniteTail from '@/components/CatalogInfiniteTail';
import { getProducts } from '@/api/EcommerceApi';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { useScrollMemory } from '@/hooks/useScrollMemory';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { discoveryOrder, hasInterest, interestFromRecent } from '@/lib/discovery';
import { getRecentlyViewed } from '@/lib/recentlyViewed';

// A ordem vive em lib/discovery.js; reexportada para os testes.
export { discoveryOrder };

/** Livros por lote: duas filas no telemóvel, quatro filas de quatro no desktop. */
export const BATCH_MOBILE = 12;
export const BATCH_DESKTOP = 16;
const MINI_COUNT = 5;

const inStock = (p) => p.purchasable !== false && (p.variants?.[0]?.inventory_quantity ?? 0) > 0;

/** Livro em ponto pequeno para a coluna lateral: capa, título e preço numa linha. */
function MiniBook({ product }) {
  const v = product.variants?.[0];
  const price = v?.sale_price_formatted || v?.price_formatted;
  return (
    <Link to={`/product/${product.id}`} className="group flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted">
      <img src={product.image} alt="" loading="lazy" decoding="async" className="h-16 w-11 shrink-0 rounded object-cover shadow-sm" />
      <span className="min-w-0">
        <span className="line-clamp-2 text-xs font-medium leading-snug group-hover:text-primary">{product.title}</span>
        {price && <span className="mt-0.5 block text-xs font-bold text-brand-ink tabular-nums">{price}</span>}
      </span>
    </Link>
  );
}

/**
 * Painel lateral (desktop), com o aspecto do "Refinar catálogo" da loja: atalhos para a loja
 * filtrada, ajuda directa e, por baixo, uma lista curta de livros disponíveis em destaque.
 */
function DiscoveryAside({ products, excludeId }) {
  const { settings } = useSiteSettings();
  const whatsapp = String(settings.whatsapp || settings.contact_phone || '').replace(/\D/g, '');

  const genres = useMemo(() => {
    const counts = new Map();
    for (const p of products) {
      const g = p.type?.value;
      if (g) counts.set(g, (counts.get(g) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [products]);

  const mini = useMemo(() => {
    const disponiveis = products.filter((p) => inStock(p) && String(p.id) !== String(excludeId));
    const destaques = disponiveis.filter((p) => p.featured);
    const resto = disponiveis.filter((p) => !p.featured).sort((a, b) => (b.order || 0) - (a.order || 0));
    return [...destaques, ...resto].slice(0, MINI_COUNT);
  }, [products, excludeId]);

  const link = 'flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted hover:text-primary';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Refinar catálogo</h2>

        <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          <Package className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" /> Disponibilidade
        </h3>
        <nav aria-label="Disponibilidade" className="mb-4 space-y-0.5">
          <Link to="/shop?inStockOnly=true" className={link}>Apenas com stock</Link>
          <Link to="/shop?featuredOnly=true" className={link}>Em destaque</Link>
          <Link to="/shop?sort=newest" className={link}>Novidades</Link>
        </nav>

        {genres.length > 0 && (
          <>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              <BookOpen className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" /> Género
            </h3>
            <nav aria-label="Géneros" className="mb-4 space-y-0.5">
              {genres.map(([g, n]) => (
                <Link key={g} to={`/shop?category=${encodeURIComponent(g)}`} className={link}>
                  <span className="truncate">{g}</span>
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">{n}</span>
                </Link>
              ))}
            </nav>
          </>
        )}

        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-sm font-medium">Precisa de ajuda a escolher?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Fale connosco e indicamos o livro certo.</p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-xs font-medium text-white hover:bg-green-800"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
              </a>
            )}
            <Link to="/contact" className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted">
              Contactos e lojas
            </Link>
          </div>
        </div>
      </div>

      {mini.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Star className="h-4 w-4 text-amber-500" aria-hidden="true" /> Escolhas da livraria
          </h2>
          <div className="space-y-1">
            {mini.map((p) => <MiniBook key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Mais para si": no fim da página, o catálogo continua a aparecer enquanto se desce, como
 * nas grandes lojas online. Primeiro os livros parecidos com os que a pessoa abriu, depois os
 * destaques e o resto disponível, e os esgotados no fim (lib/discovery.js).
 *
 * Os livros só são pedidos quando a secção se aproxima do ecrã. No desktop, à esquerda, fica
 * o painel lateral da loja (atalhos e ajuda) e uma lista curta de livros, que acompanha a
 * descida. O catálogo é finito: quando acaba, diz que acabou e o rodapé aparece a seguir.
 */
export default function DiscoveryFeed({ onCartOpen, excludeId = null, title = 'Mais para si' }) {
  const sectionRef = useRef(null);
  const isMobile = useIsMobile();
  const [near, setNear] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [personal, setPersonal] = useState(false);

  const ordered = useMemo(
    () => (catalog || []).filter((p) => String(p.id) !== String(excludeId)),
    [catalog, excludeId],
  );
  const batch = isMobile ? BATCH_MOBILE : BATCH_DESKTOP;
  const infinite = useInfiniteList({ total: ordered.length, batch, resetKey: String(excludeId ?? ''), enabled: !!catalog });
  const saved = useScrollMemory({ ready: !!catalog && ordered.length > 0, snapshot: { count: infinite.count } });
  const { setCount } = infinite;

  // Quem volta de um livro estava no meio da lista: carrega já, sem esperar pela aproximação.
  useEffect(() => {
    if (saved?.y) setNear(true);
  }, [saved]);

  useEffect(() => {
    if (catalog && saved?.count) setCount(saved.count);
    // Só quando a lista fica pronta: é a reposição ao voltar atrás.
  }, [catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (near) return undefined;
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
  }, [near]);

  useEffect(() => {
    if (!near || catalog) return undefined;
    let active = true;
    getProducts({})
      .then(({ products: list }) => {
        if (!active) return;
        const interest = interestFromRecent(getRecentlyViewed(), list || []);
        setPersonal(hasInterest(interest));
        setCatalog(discoveryOrder(list || [], interest));
      })
      .catch(() => { if (active) setCatalog([]); });
    return () => { active = false; };
  }, [near, catalog]);

  if (catalog && ordered.length === 0) return null;

  return (
    <section ref={sectionRef} className="border-t border-border bg-background pb-10 pt-8 md:pt-10" aria-labelledby="titulo-mais-para-si">
      <div className="container-custom">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 id="titulo-mais-para-si" className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" /> {title}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {personal ? 'Primeiro, livros parecidos com os que viu; depois, todo o catálogo' : 'Continue a descer para ver mais livros'}
            </p>
          </div>
          <Link to="/shop" className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            Loja <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex gap-8">
          {!isMobile && catalog && (
            <aside className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain pb-2 [scrollbar-width:thin]">
                <DiscoveryAside products={catalog} excludeId={excludeId} />
              </div>
            </aside>
          )}
          <div className="min-w-0 flex-1 lg:[&_.product-grid]:grid-cols-3 xl:[&_.product-grid]:grid-cols-4">
            <ProductsList
              embedded
              products={ordered.slice(0, infinite.count)}
              isLoading={!catalog}
              skeletonCount={isMobile ? 4 : 8}
              onCartOpen={onCartOpen}
            />
            {catalog && (
              <CatalogInfiniteTail
                sentinelRef={infinite.sentinelRef}
                hasMore={infinite.hasMore}
                loadMore={infinite.loadMore}
                shown={Math.min(infinite.count, ordered.length)}
                total={ordered.length}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
