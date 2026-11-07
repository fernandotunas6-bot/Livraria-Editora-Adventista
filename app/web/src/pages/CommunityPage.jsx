import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, X } from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import CommunityFeed from '@/components/community/CommunityFeed';
import { ClubBanner, CommunityHero, CommunitySidebar, FeedToolbar, TopicNav } from '@/components/community/CommunityParts';
import { loadCurrentClub, loadSidebar, loadTopics } from '@/lib/communityApi';
import { filtersFromSearch, searchFromFilters } from '@/lib/communityStyle';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { pageTitle } from '@/lib/brand';

/**
 * Comunidade de Leitores: revista literária e rede social ao mesmo tempo. Temas e tipos de
 * publicação, ordenação (Recentes, Em alta, Sem resposta), pesquisa, clube do livro do mês e a
 * coluna lateral. Os filtros ficam no endereço (`?tema=&tipo=&ordem=&q=&livro=`).
 */
export default function CommunityPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(params.toString()), [params]);
  const [topics, setTopics] = useState([]);
  const [sidebar, setSidebar] = useState(null);
  const [club, setClub] = useState(null);
  const { isAuthed } = useAuth();
  const { openAuth } = useAuthDialog();
  const feedRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([loadTopics(), loadSidebar(), loadCurrentClub()]).then(([t, s, c]) => {
      if (!alive) return;
      if (t.status === 'fulfilled') setTopics(t.value.filter((x) => x.active !== false));
      if (s.status === 'fulfilled') setSidebar(s.value);
      if (c.status === 'fulfilled') setClub(c.value);
    });
    return () => { alive = false; };
  }, []);

  const change = useCallback((patch) => {
    const next = { ...filters, ...patch };
    setParams(new URLSearchParams(searchFromFilters(next).replace(/^\?/, '')), { replace: false });
  }, [filters, setParams]);

  const counts = useMemo(() => Object.fromEntries((sidebar?.topics || []).map((t) => [t.slug, t.posts])), [sidebar]);
  const activeTopic = topics.find((t) => t.slug === filters.topic);
  const bookTitle = filters.book
    ? (sidebar?.books || []).find((b) => b.id === filters.book)?.title || (club?.book_id === filters.book ? club.book_title : '')
    : '';

  const write = () => {
    if (!isAuthed) { openAuth({ mode: 'login' }); return; }
    // Vai ao editor fechado do feed e abre-o (o foco passa para o texto).
    const bar = feedRef.current?.querySelector('[data-composer-open]');
    if (!bar) { feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    bar.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => bar.click(), 350);
  };

  const title = activeTopic ? `${activeTopic.name} — Comunidade` : 'Comunidade de Leitores';

  return (
    <>
      <Helmet>
        <title>{pageTitle(title)}</title>
        <meta name="description" content={activeTopic?.description || 'Converse com outros leitores sobre livros, a Bíblia e a vida: citações, perguntas e recomendações.'} />
      </Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="bg-editorial-tela">
        <CommunityHero stats={sidebar} onWrite={write} />
        <div className="container-custom py-8">
          <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_18rem] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
            <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <TopicNav topics={topics} active={filters.topic} counts={counts} onChange={(topic) => change({ topic })} />
            </div>

            <div className="min-w-0 space-y-4" ref={feedRef}>
              <ClubBanner club={!filters.book && !filters.topic ? club : null} />
              {activeTopic && (
                <div className="rounded-2xl border border-editorial-filete bg-editorial-papel p-4">
                  <h2 className="text-2xl font-semibold text-editorial-tinta">{activeTopic.name}</h2>
                  {activeTopic.description && <p className="mt-1 text-sm text-editorial-tinta-suave">{activeTopic.description}</p>}
                </div>
              )}
              {filters.book && (
                <div className="flex items-center gap-2 rounded-2xl border border-editorial-filete bg-editorial-papel p-3 text-sm text-editorial-tinta">
                  <BookOpen className="h-4 w-4 text-editorial-ouro" aria-hidden="true" />
                  <span className="flex-1">A discussão sobre <strong>{bookTitle || 'este livro'}</strong></span>
                  <button type="button" onClick={() => change({ book: '' })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-editorial-petroleo hover:bg-editorial-tela">
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Ver tudo
                  </button>
                </div>
              )}
              <FeedToolbar filters={filters} onChange={change} />
              <CommunityFeed filters={filters} topics={topics} />
            </div>

            <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <CommunitySidebar sidebar={sidebar} />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
