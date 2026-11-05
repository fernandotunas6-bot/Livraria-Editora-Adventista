import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle, Search, X } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { pageTitle } from '@/lib/brand';
import { buildFaq, filterFaq } from '@/lib/faqData';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { calcShippingCents } from '@/lib/shipping';
import { formatCurrency } from '@/api/EcommerceApi';
import PageBannerSlider from '@/components/PageBannerSlider';

const FAQPage = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { settings } = useSiteSettings();

  // Os valores vêm do mesmo cálculo que o checkout usa: a resposta sobre portes não pode
  // dizer um preço e a caixa cobrar outro.
  const faqs = useMemo(() => buildFaq({
    free_threshold: formatCurrency((Number(settings.shipping_free_threshold) || 20000) * 100),
    shipping_cost: formatCurrency(calcShippingCents('delivery', 0, settings)),
    express_cost: formatCurrency(calcShippingCents('express', 0, settings)),
  }), [settings]);

  const visible = useMemo(() => filterFaq(faqs, query), [faqs, query]);
  const total = visible.reduce((n, s) => n + s.questions.length, 0);

  // Dados estruturados (FAQPage): o Google pode mostrar as respostas directamente na pesquisa.
  const jsonLd = useMemo(() => JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.flatMap((s) => s.questions).map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  }), [faqs]);

  return (
    <>
      {/* O JSON-LD vai pela prop `script` e não como filho: como filho, o react-helmet deixava
          de aplicar o <title> desta página. */}
      <Helmet script={[{ type: 'application/ld+json', innerHTML: jsonLd }]}>
        <title>{pageTitle('Perguntas frequentes')}</title>
        <meta name="description" content="Perguntas frequentes sobre encomendas, pagamentos, entregas, devoluções e a sua conta na Livraria Adventista." />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">Perguntas Frequentes</h1>
        <p className="text-base text-white/85 sm:text-lg">Encomendas, pagamentos, entregas, devoluções e a sua conta</p>
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom max-w-4xl">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar: portes, reembolso, palavra-passe…"
              aria-label="Pesquisar nas perguntas frequentes"
              className="h-12 rounded-xl pl-10 pr-10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!query && (
            <nav aria-label="Temas" className="mb-10 flex flex-wrap gap-2">
              {faqs.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="rounded-full border bg-card px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                  {s.category}
                </a>
              ))}
            </nav>
          )}

          {query && (
            <p className="mb-6 text-sm text-muted-foreground" role="status">
              {total ? `${total} resposta${total === 1 ? '' : 's'} para "${query}".` : `Nenhuma resposta para "${query}".`}
            </p>
          )}

          <div className="space-y-10">
            {visible.map((section, i) => (
              <motion.section
                key={section.id}
                id={section.id}
                className="scroll-mt-28"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.06, 0.3) }}
              >
                <h2 className="mb-4 text-2xl font-semibold text-primary">{section.category}</h2>
                <Accordion type="single" collapsible className="space-y-2">
                  {section.questions.map((faq, j) => (
                    <AccordionItem key={faq.question} value={`${section.id}-${j}`} className="rounded-xl border border-border bg-card px-6">
                      <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        <p className="leading-relaxed">{faq.answer}</p>
                        {faq.link && (
                          <Link to={faq.link.to} className="mt-3 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            {faq.link.label} <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </motion.section>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-start gap-4 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Não encontrou a resposta?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Escreva-nos com o número da encomenda, se tiver. Respondemos em dias úteis.
              </p>
            </div>
            <Button asChild className="btn-primary shrink-0">
              <Link to="/contact"><MessageCircle className="mr-2 h-4 w-4" />Falar connosco</Link>
            </Button>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Veja também os <Link to="/termos" className="underline hover:text-primary">Termos e Condições</Link>,
            a <Link to="/privacidade" className="underline hover:text-primary">Política de Privacidade</Link> e
            as condições de <Link to="/shipping-returns" className="underline hover:text-primary">Envios e Devoluções</Link>.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default FAQPage;
