import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Truck, Package, RotateCcw, MapPin, Zap } from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { pageTitle } from '@/lib/brand';
import PageBannerSlider from '@/components/PageBannerSlider';
import { MOTION } from '@/lib/motion';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { calcShippingCents } from '@/lib/shipping';
import { formatCurrency } from '@/api/EcommerceApi';

const ShippingReturnsPage = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { settings } = useSiteSettings();

  // Os custos vêm do mesmo cálculo que o checkout usa, e não de texto escrito à mão: uma
  // página de condições que discorda do que o cliente paga na caixa é pior do que não
  // existir. O subtotal zero serve para ler a tabela — abaixo do mínimo para o envio grátis.
  const custoNormal = calcShippingCents('delivery', 0, settings);
  const custoExpresso = calcShippingCents('express', 0, settings);
  const envioGratisAcimaDe = (Number(settings.shipping_free_threshold) || 20000) * 100;

  const Seccao = ({ icone: Icone, titulo, atraso, children }) => (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: MOTION.base, delay: atraso }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Icone className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">{titulo}</h2>
      </div>
      <div className="space-y-6 bg-card border border-border rounded-xl p-6">{children}</div>
    </motion.section>
  );

  return (
    <>
      <Helmet>
        <title>{pageTitle('Envios e Devoluções')}</title>
        <meta name="description" content="Prazos de entrega, custos de envio em Angola e como devolver um livro." />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl/10 md:text-5xl/none">Envios e Devoluções</h1>
        <p className="text-base text-white/85 sm:text-lg">Tudo o que precisa saber sobre entregas e devoluções</p>
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom max-w-4xl">
          <div className="space-y-12">
            <Seccao icone={Truck} titulo="Formas de entrega" atraso={0.05}>
              <div className="border-b border-border pb-5">
                <h3 className="text-lg font-semibold mb-1 text-foreground flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" /> Entrega ao domicílio
                </h3>
                <p className="text-muted-foreground">
                  {formatCurrency(custoNormal)} por encomenda, em todo o território nacional.
                </p>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Grátis</strong> acima de {formatCurrency(envioGratisAcimaDe)}.
                </p>
              </div>

              <div className="border-b border-border pb-5">
                <h3 className="text-lg font-semibold mb-1 text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Entrega expressa
                </h3>
                <p className="text-muted-foreground">{formatCurrency(custoExpresso)} — prioridade, 24 a 48 horas em Luanda.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-1 text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Levantamento na loja
                </h3>
                <p className="text-muted-foreground">
                  <strong className="text-foreground">Grátis.</strong> Escolha a loja no checkout e levante quando lhe der jeito.
                </p>
              </div>
            </Seccao>

            <Seccao icone={Package} titulo="Prazos" atraso={0.1}>
              <ul className="space-y-2 text-muted-foreground list-disc list-inside">
                <li><strong className="text-foreground">Luanda:</strong> 5 a 7 dias úteis.</li>
                <li><strong className="text-foreground">Outras províncias:</strong> 7 a 14 dias úteis.</li>
                <li><strong className="text-foreground">Expressa:</strong> 24 a 48 horas em Luanda.</li>
              </ul>
              <p className="text-muted-foreground">
                A contagem começa depois de a encomenda ser confirmada. Pode acompanhá-la a qualquer momento na
                página <strong className="text-foreground">Rastrear Encomenda</strong>, com o número da compra e o
                email que usou.
              </p>
            </Seccao>

            <Seccao icone={RotateCcw} titulo="Devoluções" atraso={0.15}>
              <div className="border-b border-border pb-5">
                <h3 className="text-lg font-semibold mb-2 text-foreground">30 dias para devolver</h3>
                <p className="text-muted-foreground">
                  Aceitamos devoluções em até 30 dias a contar da entrega, desde que o livro esteja em bom estado e
                  na embalagem original.
                </p>
              </div>

              <div className="border-b border-border pb-5">
                <h3 className="text-lg font-semibold mb-2 text-foreground">Como devolver</h3>
                <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
                  <li>Escreva-nos pelo formulário da página de Contacto, com o número da encomenda.</li>
                  <li>Combinamos consigo a recolha ou a entrega numa das lojas físicas.</li>
                  <li>O reembolso é feito depois de recebermos e conferirmos o livro.</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2 text-foreground">Quem paga o reenvio</h3>
                <p className="text-muted-foreground">
                  Se o livro chegou danificado, incompleto ou não corresponde ao que encomendou, o reenvio é por
                  nossa conta. Nas restantes devoluções, combinamos consigo no momento do pedido.
                </p>
              </div>
            </Seccao>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
};

export default ShippingReturnsPage;
