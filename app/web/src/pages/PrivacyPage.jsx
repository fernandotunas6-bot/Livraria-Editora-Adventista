import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation } from 'react-router-dom';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PageBannerSlider from '@/components/PageBannerSlider';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { pageTitle } from '@/lib/brand';
import { PRIVACY_UPDATED, inlineParts, privacySections } from '@/lib/privacyPolicy';

function Inline({ text }) {
  return inlineParts(text).map((part, i) => {
    if (part.href) return <Link key={i} to={part.href} className="font-medium text-primary underline underline-offset-2">{part.text}</Link>;
    if (part.bold) return <strong key={i} className="font-semibold text-foreground">{part.text}</strong>;
    return <Fragment key={i}>{part.text}</Fragment>;
  });
}

/** Política de privacidade (/privacidade): o texto vem de lib/privacyPolicy.js. */
export default function PrivacyPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { settings } = useSiteSettings();
  const sections = useMemo(() => privacySections(settings), [settings]);
  const { hash } = useLocation();

  // /privacidade#comunidade (o link da comunidade): o site volta ao topo a cada mudança de
  // página, por isso a secção só se mostra depois disso.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return undefined;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 120);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <>
      <Helmet>
        <title>{pageTitle('Política de privacidade')}</title>
        <meta name="description" content="Que dados pessoais tratamos na loja, na comunidade de leitores e no atendimento, com quem os partilhamos e como exercer os seus direitos." />
      </Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl/10 md:text-5xl/none">Política de privacidade</h1>
        <p className="text-base text-white/85 sm:text-lg">Última actualização: {PRIVACY_UPDATED}</p>
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom grid max-w-5xl gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label="Nesta página" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nesta página</p>
            <ol className="space-y-1 text-sm">
              {sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="block rounded px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:py-1">{s.title}</a></li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 space-y-10 text-[15px] leading-relaxed text-foreground/85">
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-titulo`} className="scroll-mt-24">
                <h2 id={`${s.id}-titulo`} className="mb-3 text-2xl font-semibold text-foreground">{s.title}</h2>
                <div className="space-y-3">
                  {s.blocks.map((b, i) => (b.list ? (
                    <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
                      {b.list.map((item, j) => <li key={j}><Inline text={item} /></li>)}
                    </ul>
                  ) : (
                    <p key={i}><Inline text={b.p} /></p>
                  )))}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
