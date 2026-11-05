import React, { useCallback, useState } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import HeroSlider from '@/components/HeroSlider.jsx';
import DestaquesSemana from '@/components/DestaquesSemana.jsx';
import CatalogShowcase from '@/components/home/CatalogShowcase.jsx';
import DiscoveryFeed from '@/components/DiscoveryFeed.jsx';
import { pageTitle, BRAND } from '@/lib/brand';

/**
 * Página inicial: destaques, prateleiras por tema e, a seguir, "Mais para si", que continua
 * a mostrar livros enquanto se desce. Depois dos livros vem só o rodapé (no desktop; no
 * telemóvel a barra inferior faz esse papel). As garantias de envio e a newsletter estão no
 * rodapé, por isso não se repetem aqui entre os livros.
 */
const HomePage = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const openCart = useCallback(() => setIsCartOpen(true), []);

  return (
    <>
      <Helmet>
        <title>{pageTitle('Livros e Histórias')}</title>
        <meta name="description" content={`${BRAND.name} — literatura cristã adventista, educação e inspiração.`} />
      </Helmet>

      <Header onCartOpen={openCart} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main>
        <HeroSlider />
        <DestaquesSemana onCartOpen={openCart} />
        <CatalogShowcase onCartOpen={openCart} />
        <DiscoveryFeed onCartOpen={openCart} />
      </main>

      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  );
};

export default HomePage;
