import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PageBannerSlider from '@/components/PageBannerSlider';
import { pageTitle } from '@/lib/brand';
import { useSiteSettings } from '@/hooks/useSiteSettings';

/** Os dados de contacto da loja, das Configurações, para os textos legais nunca os terem desactualizados. */
export function useStoreIdentity() {
  const { settings } = useSiteSettings();
  return {
    name: settings.site_name || 'Livraria Adventista',
    email: settings.contact_email || '',
    phone: settings.contact_phone || '',
    address: settings.contact_address || '',
  };
}

/** Bloco de contactos da loja, usado no fim dos textos legais. */
export function StoreContacts() {
  const store = useStoreIdentity();
  return (
    <address className="space-y-1 not-italic">
      <p><strong className="text-foreground">{store.name}</strong></p>
      {store.address && <p>{store.address}</p>}
      {store.email && <p>Email: <a href={`mailto:${store.email}`} className="text-primary underline">{store.email}</a></p>}
      {store.phone && <p>Telefone: {store.phone}</p>}
      <p>Formulário: <Link to="/contact" className="text-primary underline">página de Contacto</Link></p>
    </address>
  );
}

function TableOfContents({ sections }) {
  return (
    <ol className="mt-2 space-y-1 text-sm">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="block rounded-md py-1 text-muted-foreground transition-colors hover:text-primary">
            {i + 1}. {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Moldura das páginas legais: título, data da versão, índice e secções numeradas.
 *
 * `sections` é `[{ id, title, body }]`. O índice e os ids servem para ligar directamente a
 * uma secção (por exemplo, /termos#devolucoes a partir de um email).
 */
export default function LegalPage({ title, description, subtitle, updated, intro, sections }) {
  const [isCartOpen, setIsCartOpen] = useState(false);
  return (
    <>
      <Helmet>
        <title>{pageTitle(title)}</title>
        <meta name="description" content={description} />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="text-base text-white/85 sm:text-lg">{subtitle}</p>}
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom grid max-w-5xl gap-10 lg:grid-cols-[220px_1fr]">
          {/* No telemóvel o índice fica recolhido: aberto, empurrava o texto para baixo de um ecrã inteiro. */}
          <details className="rounded-xl border bg-card px-4 py-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">Nesta página ({sections.length} secções)</summary>
            <TableOfContents sections={sections} />
          </details>
          <nav aria-label="Índice" className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nesta página</p>
            <TableOfContents sections={sections} />
          </nav>

          <article className="min-w-0">
            <p className="mb-6 text-sm text-muted-foreground">Última actualização: {updated}</p>
            {intro && <div className="legal-body mb-10 space-y-4 text-muted-foreground leading-relaxed">{intro}</div>}
            <div className="space-y-10">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-28">
                  <h2 className="mb-3 text-xl font-semibold text-foreground sm:text-2xl">{i + 1}. {s.title}</h2>
                  <div className="space-y-3 leading-relaxed text-muted-foreground [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ul]:list-disc [&_ul]:space-y-1.5">
                    {s.body}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>

      <Footer />
    </>
  );
}
