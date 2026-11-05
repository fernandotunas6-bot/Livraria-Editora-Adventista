import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Sparkles, History, BookOpen, Heart } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ShoppingCart from '@/components/ShoppingCart';
import ProductCard from '@/components/ProductCard';
import PageBannerSlider from '@/components/PageBannerSlider';
import { PRODUCT_GRID_CLASS } from '@/lib/productGrid';
import { pageTitle } from '@/lib/brand';
import { getRecommendations } from '@/api/EcommerceApi';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';

/**
 * Sugestões de livros: o que o cliente guardou e viu, livros do mesmo género e as novidades.
 * É para aqui que aponta o "Ver todas as sugestões" dos emails.
 */
function Section({ icon: Icon, title, subtitle, products, onCartOpen }) {
  if (!products?.length) return null;
  return (
    <section className="mb-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
          </div>
          {subtitle && <p className="text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
        </div>
      </div>
      <div className={PRODUCT_GRID_CLASS}>
        {products.map((product, index) => (
          <ProductCard key={product.id} product={product} onCartOpen={onCartOpen} index={index} />
        ))}
      </div>
    </section>
  );
}

export default function SuggestionsPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const { isAuthed, ready } = useAuth();
  const { openAuth } = useAuthDialog();

  useEffect(() => {
    if (ready === false) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getRecommendations()
      .then((data) => { if (!cancelled) setState({ loading: false, error: '', data }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.message, data: null }); });
    return () => { cancelled = true; };
  }, [isAuthed, ready]);

  const openCart = () => setIsCartOpen(true);
  const { loading, error, data } = state;
  const recentIds = new Set((data?.recent || []).map((p) => p.id));
  // "Para si" sem repetir o que já aparece em "Vistos recentemente".
  const forYou = (data?.forYou || []).filter((p) => !recentIds.has(p.id)).slice(0, 10);
  const shown = new Set([...recentIds, ...forYou.map((p) => p.id)]);
  const newest = (data?.newest || []).filter((p) => !shown.has(p.id)).slice(0, 10);

  return (
    <>
      <Helmet>
        <title>{pageTitle('Sugestões para si')}</title>
        <meta name="description" content="Livros escolhidos a partir do que viu e guardou, e as novidades da Livraria Adventista." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <Header onCartOpen={openCart} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">Sugestões para si</h1>
        <p className="text-base text-white/85 sm:text-lg">
          {data?.personal ? 'Escolhidas a partir dos livros que viu, guardou e comprou.' : 'As novidades da livraria e os livros que andou a ver.'}
        </p>
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom">
          {loading && (
            <div className={PRODUCT_GRID_CLASS} aria-busy="true" aria-label="A carregar sugestões">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
              <p className="mb-4 text-muted-foreground">{error}</p>
              <Link to="/shop" className="font-medium text-primary hover:underline">Ver o catálogo →</Link>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <Section icon={Heart} title="Escolhidos para si" subtitle="Da sua lista de desejos, do que viu e de géneros de que gosta." products={forYou} onCartOpen={openCart} />
              <Section icon={History} title="Vistos recentemente" subtitle="Para voltar onde ficou." products={data.recent.slice(0, 10)} onCartOpen={openCart} />
              <Section icon={Sparkles} title="Novidades" subtitle="Os últimos livros a chegar às nossas prateleiras." products={newest} onCartOpen={openCart} />

              {!isAuthed && (
                <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
                  <BookOpen className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden="true" />
                  <p className="mb-4 text-muted-foreground">
                    Entre na sua conta para as sugestões contarem também com a lista de desejos e as compras, em qualquer dispositivo.
                  </p>
                  <button type="button" onClick={() => openAuth()} className="inline-flex items-center rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
                    Entrar ou criar conta
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
