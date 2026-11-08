import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PostSkeleton from '@/components/community/PostSkeleton';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PostCard from '@/components/community/PostCard';
import { GoldRule } from '@/components/community/CommunityParts';
import { useAuth } from '@/hooks/useAuth';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useCommunityThread } from '@/hooks/useCommunityThread';
import { listPosts, loadTopics } from '@/lib/communityApi';
import { plural, postKind, postPath } from '@/lib/communityStyle';
import { relativeTime } from '@/lib/communityText';
import { pageTitle } from '@/lib/brand';

/** Uma publicação da comunidade, com endereço próprio para partilhar, e todas as respostas. */
export default function CommunityPostPage() {
  const { id } = useParams();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [topics, setTopics] = useState([]);
  const [related, setRelated] = useState([]);
  const { canAccessAdmin } = useAuth();
  const { openAuth } = useAuthDialog();
  const { post, replies, liked, status, signedIn, reload, publish, toggleLike, report, remove, pin, markOfficial, hide } = useCommunityThread(id);
  const navigate = useNavigate();
  const location = useLocation();
  // Veio do feed (dentro do site)? Então "Comunidade" volta atrás: o feed reaparece com as
  // mesmas publicações e no mesmo sítio. Por link de fora, abre o feed do início.
  const cameFromSite = location.key !== 'default' && typeof window !== 'undefined' && window.history.length > 1;
  const backToFeed = (e) => {
    if (!cameFromSite) return;
    e.preventDefault();
    navigate(-1);
  };
  const topicsBySlug = useMemo(() => Object.fromEntries(topics.map((t) => [t.slug, t])), [topics]);
  const topic = post?.topic ? topicsBySlug[post.topic] : null;

  useEffect(() => { loadTopics().then(setTopics).catch(() => setTopics([])); }, []);
  useEffect(() => {
    if (!post) return;
    let alive = true;
    listPosts({ topic: post.topic || '', bookId: post.topic ? null : post.book_id, limit: 5 })
      .then((rows) => { if (alive) setRelated(rows.filter((r) => r.id !== post.id).slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [post]);

  const excerpt = String(post?.body || '').replace(/\s+/g, ' ').trim().slice(0, 155);
  const title = post ? `${postKind(post.kind).label} de ${post.author_name}` : 'Publicação';

  return (
    <>
      <Helmet>
        <title>{pageTitle(`${title} — Comunidade`)}</title>
        {excerpt && <meta name="description" content={excerpt} />}
        {post && <link rel="canonical" href={`${window.location.origin}${postPath(post.id)}`} />}
      </Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="min-h-[60vh] bg-editorial-tela py-8">
        <div className="mx-auto w-full max-w-3xl px-4">
          <nav aria-label="Caminho" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-editorial-tinta-suave">
            <Link to="/comunidade" onClick={backToFeed} className="-ml-2 inline-flex min-h-10 items-center gap-0.5 rounded-full px-2 font-medium text-editorial-petroleo hover:underline">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Comunidade
            </Link>
            {topic && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <Link to={`/comunidade?tema=${encodeURIComponent(topic.slug)}`} className="hover:underline">{topic.name}</Link>
              </>
            )}
          </nav>

          {status === 'loading' && <PostSkeleton count={1} />}
          {status === 'error' && (
            <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center" role="alert">
              <h1 className="text-2xl font-semibold text-editorial-tinta">Não foi possível abrir a publicação</h1>
              <p className="mt-2 text-sm text-editorial-tinta-suave">Verifique a ligação à internet e tente outra vez.</p>
              <Button type="button" variant="outline" onClick={() => reload()} className="mt-4 border-editorial-filete bg-editorial-papel">
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Tentar outra vez
              </Button>
            </div>
          )}
          {status === 'missing' && (
            <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center">
              <h1 className="text-2xl font-semibold text-editorial-tinta">Esta publicação já não está disponível</h1>
              <p className="mt-2 text-sm text-editorial-tinta-suave">Pode ter sido apagada pelo autor ou ocultada pela equipa.</p>
              <Link to="/comunidade" className="mt-4 inline-block font-semibold text-editorial-petroleo hover:underline">Voltar à comunidade</Link>
            </div>
          )}
          {status === 'unavailable' && (
            <p className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center text-editorial-tinta-suave">A comunidade abre em breve.</p>
          )}
          {status === 'ready' && post && (
            <>
              <h1 className="sr-only">{title}</h1>
              <PostCard
                post={post} replies={replies} liked={liked} signedIn={signedIn} isStaff={!!canAccessAdmin}
                topics={topicsBySlug} full
                onLike={toggleLike} onReport={report} onRemove={remove} onPublish={publish}
                onNeedAuth={() => openAuth({ mode: 'login' })} onPin={pin} onOfficial={markOfficial} onHide={hide}
              />
              {related.length > 0 && (
                <section className="mt-10" aria-labelledby="mais-conversas">
                  <h2 id="mais-conversas" className="text-2xl font-semibold text-editorial-tinta">Mais conversas{topic ? ` em ${topic.name}` : ''}</h2>
                  <GoldRule className="my-4" />
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {related.map((r) => (
                      <li key={r.id}>
                        <Link to={postPath(r.id)} className="flex h-full gap-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-4 transition-shadow hover:shadow-md">
                          {r.book_cover && <img src={r.book_cover} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded object-cover shadow-sm" />}
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-editorial-ouro-texto">{postKind(r.kind).label}</span>
                            <span className="mt-1 line-clamp-3 block text-sm text-editorial-tinta">{r.body}</span>
                            <span className="mt-2 block text-xs text-editorial-tinta-suave">{r.author_name} · {relativeTime(r.created)} · {plural(r.replies_count || 0, 'resposta', 'respostas')}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
