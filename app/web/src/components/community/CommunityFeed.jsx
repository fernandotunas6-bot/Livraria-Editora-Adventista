import React from 'react';
import { Loader2, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCommunity } from '@/hooks/useCommunity';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import PostComposer from '@/components/community/PostComposer';
import PostCard from '@/components/community/PostCard';

/**
 * Feed da comunidade. Sem `book`, é o feed geral (/comunidade); com `book`, a discussão desse
 * livro na ficha do produto, já com o livro escolhido.
 */
export default function CommunityFeed({ book = null }) {
  const { openAuth } = useAuthDialog();
  const {
    posts, replies, liked, loading, hasMore, unavailable, error, signedIn,
    loadMore, publish, toggleLike, report, remove,
  } = useCommunity({ bookId: book?.id || null });
  const needAuth = () => openAuth({ mode: 'login' });

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
        <MessagesSquare className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
        A comunidade abre em breve.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {signedIn ? (
        <PostComposer
          book={book}
          allowBook={!book}
          placeholder={book ? `O que achou de "${book.title}"?` : undefined}
          onSubmit={publish}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Entre na sua conta para publicar, responder e gostar.</p>
          <Button type="button" size="sm" onClick={needAuth}>Entrar</Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="A carregar" /></div>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {book ? 'Ainda ninguém falou deste livro. Seja o primeiro.' : 'Ainda não há publicações. Comece a conversa.'}
        </p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id} post={post} replies={replies[post.id] || []} liked={liked} signedIn={signedIn}
              showBook={!book}
              onLike={toggleLike} onReport={report} onRemove={remove} onPublish={publish} onNeedAuth={needAuth}
            />
          ))}
          {hasMore && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore}>Ver mais publicações</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
