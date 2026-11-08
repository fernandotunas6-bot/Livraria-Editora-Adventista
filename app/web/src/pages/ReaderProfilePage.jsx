import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { Award, BadgeCheck, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostSkeleton from '@/components/community/PostSkeleton';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import Monogram from '@/components/community/Monogram';
import { GoldRule } from '@/components/community/CommunityParts';
import { PAGE_SIZE, isMissingTable, loadReader, loadReaderPosts } from '@/lib/communityApi';
import { plural, postKind, postPath, readerSince } from '@/lib/communityStyle';
import { relativeTime } from '@/lib/communityText';
import { pageTitle } from '@/lib/brand';
import { useReaderLevel } from '@/hooks/useReader';
import ReaderBadge from '@/components/community/ReaderBadge';

/** Perfil público de um leitor: nome, desde quando, actividade e publicações. Sem email nem foto. */
export default function ReaderProfilePage() {
  const { key } = useParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [reader, setReader] = useState(null);
  // O distintivo do nível de leitor (Leitor, assíduo, de honra), pela chave pública.
  const readerLevel = useReaderLevel(reader && !reader.is_staff ? reader.author_key : null);
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [moreState, setMoreState] = useState('idle');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    Promise.all([loadReader(key), loadReaderPosts(key)])
      .then(([r, p]) => {
        if (!alive) return;
        if (!r) { setStatus('missing'); return; }
        setReader(r); setPosts(p); setHasMore(p.length === PAGE_SIZE); setStatus('ready');
      })
      // Sem rede não é "leitor não encontrado": mostra-se o erro com "Tentar outra vez".
      .catch((e) => { if (alive) setStatus(isMissingTable(e) ? 'unavailable' : 'error'); });
    return () => { alive = false; };
  }, [key, attempt]);

  // As publicações seguintes, pela data da última mostrada (a função já aceitava `before`).
  const loadMore = useCallback(async () => {
    const last = posts.reduce((min, p) => (!min || p.created < min ? p.created : min), null);
    if (!last) return;
    setMoreState('loading');
    try {
      const page = await loadReaderPosts(key, last);
      setPosts((prev) => [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]);
      setHasMore(page.length === PAGE_SIZE);
      setMoreState('idle');
    } catch {
      setMoreState('error');
    }
  }, [key, posts]);

  const stats = reader ? [
    ['Publicações', reader.posts_count], ['Respostas', reader.replies_count],
    ['Gostos recebidos', reader.likes_received], ['Livros comentados', reader.books_count],
  ] : [];

  return (
    <>
      <Helmet>
        <title>{pageTitle(reader ? `${reader.author_name} — Comunidade` : 'Leitor — Comunidade')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="min-h-[60vh] bg-editorial-tela py-8">
        <div className="mx-auto w-full max-w-3xl px-4">
          <nav aria-label="Caminho" className="mb-4 flex items-center gap-1 text-sm text-editorial-tinta-suave">
            <Link to="/comunidade" className="hover:underline">Comunidade</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> <span>Leitor</span>
          </nav>

          {status === 'loading' && <PostSkeleton count={2} />}
          {status === 'error' && (
            <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center" role="alert">
              <h1 className="text-2xl font-semibold text-editorial-tinta">Não foi possível abrir o perfil</h1>
              <p className="mt-2 text-sm text-editorial-tinta-suave">Verifique a ligação à internet e tente outra vez.</p>
              <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)} className="mt-4 border-editorial-filete bg-editorial-papel">
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Tentar outra vez
              </Button>
            </div>
          )}
          {status === 'missing' && (
            <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center">
              <h1 className="text-2xl font-semibold text-editorial-tinta">Leitor não encontrado</h1>
              <Link to="/comunidade" className="mt-3 inline-block font-semibold text-editorial-petroleo hover:underline">Voltar à comunidade</Link>
            </div>
          )}
          {status === 'unavailable' && <p className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center text-editorial-tinta-suave">A comunidade abre em breve.</p>}

          {status === 'ready' && reader && (
            <>
              <section className="overflow-hidden rounded-2xl border border-editorial-filete bg-editorial-papel shadow-xs">
                <div className="h-20 bg-editorial-marinho" aria-hidden="true" />
                <div className="-mt-10 px-5 pb-5">
                  <Monogram name={reader.author_name} authorKey={reader.author_key} size="lg" staff={reader.is_staff} />
                  <h1 className="mt-3 text-3xl font-semibold text-editorial-tinta">{reader.author_name}</h1>
                  <p className="text-sm text-editorial-tinta-suave">{readerSince(reader.since)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reader.is_staff && <span className="inline-flex items-center gap-1 rounded-full bg-editorial-tela px-2.5 py-1 text-xs font-semibold text-editorial-ouro-texto"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Equipa da Livraria</span>}
                    {reader.is_founder && <span className="inline-flex items-center gap-1 rounded-full bg-editorial-tela px-2.5 py-1 text-xs font-semibold text-editorial-ouro-texto"><Award className="h-3.5 w-3.5" aria-hidden="true" /> Membro fundador</span>}
                    {!reader.is_staff && <ReaderBadge level={readerLevel} size="md" className="px-2.5 py-1" />}
                  </div>
                  <GoldRule className="my-4" />
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-editorial-tela p-3 text-center">
                        <dd className="text-2xl font-semibold tabular-nums text-editorial-tinta" style={{ fontFamily: "'Fraunces', serif" }}>{value || 0}</dd>
                        <dt className="text-xs text-editorial-tinta-suave">{label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>

              <section className="mt-8" aria-labelledby="publicacoes-do-leitor">
                <h2 id="publicacoes-do-leitor" className="text-2xl font-semibold text-editorial-tinta">Publicações</h2>
                {posts.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-8 text-center text-sm text-editorial-tinta-suave">Ainda sem publicações.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {posts.map((p) => (
                      <li key={p.id}>
                        <Link to={postPath(p.id)} className="flex gap-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-4 transition-shadow hover:shadow-md">
                          {p.book_cover && <img src={p.book_cover} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded object-cover shadow-xs" />}
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-editorial-ouro-texto">{postKind(p.kind).label}{p.book_title ? ` · ${p.book_title}` : ''}</span>
                            <span className="mt-1 line-clamp-3 block text-[15px] text-editorial-tinta">{p.body}</span>
                            <span className="mt-2 block text-xs text-editorial-tinta-suave">{relativeTime(p.created)} · {plural(p.likes_count || 0, 'gosto', 'gostos')} · {plural(p.replies_count || 0, 'resposta', 'respostas')}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {hasMore && (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    {moreState === 'error' && <p className="text-sm text-editorial-tinta" role="alert">Não foi possível carregar mais publicações.</p>}
                    <Button type="button" variant="outline" onClick={loadMore} disabled={moreState === 'loading'} className="border-editorial-filete bg-editorial-papel">
                      {moreState === 'loading' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                      {moreState === 'error' ? 'Tentar outra vez' : 'Ver mais publicações'}
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
