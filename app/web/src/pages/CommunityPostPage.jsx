import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Loader2 } from 'lucide-react';
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
  const { post, replies, liked, status, signedIn, publish, toggleLike, report, remove, pin, markOfficial, hide } = useCommunityThread(id);
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
            <Link to="/comunidade" className="hover:underline">Comunidade</Link>
            {topic && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <Link to={`/comunidade?tema=${encodeURIComponent(topic.slug)}`} className="hover:underline">{topic.name}</Link>
              </>
            )}
          </nav>

          {status === 'loading' && (
            <div className="flex justify-center py-16" role="status" aria-label="A carregar a publicação"><Loader2 className="h-6 w-6 animate-spin text-editorial-tinta-suave" aria-hidden="true" /></div>
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
                        <Link to={postPath(r.id)} className="block h-full rounded-2xl border border-editorial-filete bg-editorial-papel p-4 transition-shadow hover:shadow-md">
                          <p className="text-xs font-semibold uppercase tracking-wide text-editorial-ouro-texto">{postKind(r.kind).label}</p>
                          <p className="mt-1 line-clamp-3 text-sm text-editorial-tinta">{r.body}</p>
                          <p className="mt-2 text-xs text-editorial-tinta-suave">{r.author_name} · {relativeTime(r.created)} · {plural(r.replies_count || 0, 'resposta', 'respostas')}</p>
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
