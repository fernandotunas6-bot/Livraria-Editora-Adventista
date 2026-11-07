import React, { useEffect, useMemo, useRef } from 'react';
import { Feather, Loader2, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCommunity } from '@/hooks/useCommunity';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import PostComposer from '@/components/community/PostComposer';
import PostCard from '@/components/community/PostCard';

const EMPTY = { topic: '', kind: '', sort: 'recentes', query: '', book: '' };

function emptyText({ book, filters }) {
  if (book) return 'Ainda ninguém falou deste livro. Seja o primeiro.';
  if (filters.book) return 'Ainda não há publicações sobre este livro. Seja o primeiro.';
  if (filters.query) return `Nada encontrado para "${filters.query}".`;
  if (filters.sort === 'sem_resposta') return 'Todas as publicações já têm resposta.';
  if (filters.topic || filters.kind) return 'Ainda não há publicações com estes filtros. Comece a conversa.';
  return 'Ainda não há publicações. Comece a conversa.';
}

/**
 * Feed da comunidade. Sem `book`, é o feed geral (/comunidade) com os filtros do endereço; com
 * `book`, a discussão desse livro na ficha do produto, já com o livro escolhido.
 */
export default function CommunityFeed({ book = null, filters = EMPTY, topics = [] }) {
  const { user, canAccessAdmin } = useAuth();
  const { openAuth } = useAuthDialog();
  const f = { ...EMPTY, ...filters };
  const {
    posts, replies, liked, loading, loadingMore, hasMore, unavailable, error, signedIn,
    loadMore, publish, toggleLike, report, remove, pin, markOfficial, hide,
  } = useCommunity({ bookId: book?.id || f.book || null, topic: f.topic, kind: f.kind, sort: f.sort, query: f.query });
  const topicsBySlug = useMemo(() => Object.fromEntries(topics.map((t) => [t.slug, t])), [topics]);
  const sentinel = useRef(null);
  const needAuth = () => openAuth({ mode: 'login' });

  // Ao chegar ao fim da lista carrega a página seguinte; o botão fica para o teclado.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-8 text-center text-editorial-tinta-suave">
        <MessagesSquare className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
        A comunidade abre em breve.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {signedIn ? (
        <PostComposer
          collapsible={!book}
          book={book}
          allowBook={!book}
          topics={topics}
          defaultTopic={f.topic}
          author={{ name: user?.name || user?.email || 'Leitor', key: user?.reader_key || user?.id }}
          placeholder={book ? `O que achou de "${book.title}"?` : undefined}
          onSubmit={publish}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-4">
          <p className="flex items-center gap-2 text-sm text-editorial-tinta">
            <Feather className="h-4 w-4 text-editorial-ouro" aria-hidden="true" />
            Entre na sua conta para publicar, responder e gostar.
          </p>
          <Button type="button" size="sm" onClick={needAuth} className="bg-editorial-petroleo hover:bg-editorial-petroleo/90">Entrar</Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-label="A carregar publicações">
          <Loader2 className="h-6 w-6 animate-spin text-editorial-tinta-suave" aria-hidden="true" />
        </div>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-10 text-center text-sm text-editorial-tinta-suave">
          {emptyText({ book, filters: f })}
        </p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id} post={post} replies={replies[post.id] || []} liked={liked} signedIn={signedIn}
              isStaff={!!canAccessAdmin} topics={topicsBySlug} showBook={!book}
              onLike={toggleLike} onReport={report} onRemove={remove} onPublish={publish} onNeedAuth={needAuth}
              onPin={pin} onOfficial={markOfficial} onHide={hide}
            />
          ))}
          <div ref={sentinel} aria-hidden="true" />
          {hasMore && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="border-editorial-filete bg-editorial-papel">
                {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                Ver mais publicações
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
