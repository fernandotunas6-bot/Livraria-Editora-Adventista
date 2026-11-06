import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import CommunityFeed from '@/components/community/CommunityFeed';
import { pageTitle } from '@/lib/brand';

/** Comunidade: conversar sobre livros ou qualquer assunto, com respostas, citações e links. */
export default function CommunityPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  return (
    <>
      <Helmet>
        <title>{pageTitle('Comunidade')}</title>
        <meta name="description" content="Converse com outros leitores sobre livros, leituras e fé." />
      </Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="section-spacing bg-background">
        <div className="mx-auto w-full max-w-2xl px-4">
          <h1 className="text-3xl font-bold text-foreground">Comunidade</h1>
          <p className="mt-2 mb-6 text-muted-foreground">
            Converse sobre livros ou qualquer assunto. Indique o livro, cite uma passagem com a página e partilhe links para outras leituras.
          </p>
          <CommunityFeed />
          <p className="mt-8 text-xs text-muted-foreground">
            Seja respeitoso. Links para conteúdo adulto, encurtadores e sites perigosos não são aceites, e as publicações com três denúncias ficam ocultas até a equipa as rever. Os links são de outros utilizadores: abra-os com cuidado.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
