import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowUp, Feather, Loader2, MessagesSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCommunity } from '@/hooks/useCommunity';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { useScrollMemory } from '@/hooks/useScrollMemory';
import PostComposer from '@/components/community/PostComposer';
import ComposerSheet from '@/components/community/ComposerSheet';
import PostCard from '@/components/community/PostCard';
import PostSkeleton from '@/components/community/PostSkeleton';
import { PAGE_SIZE } from '@/lib/communityApi';
import { draftStorageKey } from '@/lib/composerDraft';
import { plural } from '@/lib/communityStyle';

const EMPTY = { topic: '', kind: '', sort: 'recentes', query: '', book: '' };
// De quanto em quanto tempo se pergunta se há publicações novas (só com a página à vista).
const NEW_POSTS_EVERY_MS = 60_000;

function emptyText({ book, filters }) {
  if (book) return 'Ainda ninguém falou deste livro. Seja o primeiro.';
  if (filters.book) return 'Ainda não há publicações sobre este livro. Seja o primeiro.';
  if (filters.query) return `Nada encontrado para "${filters.query}".`;
  if (filters.sort === 'sem_resposta') return 'Todas as publicações já têm resposta.';
  if (filters.topic || filters.kind) return 'Ainda não há publicações com estes filtros. Comece a conversa.';
  return 'Ainda não há publicações. Comece a conversa.';
}

const hasFilters = (f) => !!(f.topic || f.kind || f.query || f.book || (f.sort && f.sort !== 'recentes'));

/** Repõe a posição no feed ao voltar de uma publicação (só no feed geral, não na ficha do livro). */
function FeedPlace({ ready }) {
  useScrollMemory({ ready, snapshot: {} });
  return null;
}

/**
 * Feed da comunidade. Sem `book`, é o feed geral (/comunidade) com os filtros do endereço; com
 * `book`, a discussão desse livro na ficha do produto, já com o livro escolhido.
 *
 * `onWrite`: o que fazem os botões "Escrever" dos estados vazios e do fim do feed.
 * `composerInSheet`: a barra fechada do compositor também chama `onWrite` (no telemóvel, a
 * folha de baixo) em vez de abrir o formulário no meio do feed. `onClearFilters`: "Ver todas".
 */
export default function CommunityFeed({
  book = null, filters = EMPTY, topics = [], onWrite = null, onClearFilters = null, composerInSheet = false,
  sheetOpen = false, onSheetOpenChange = null,
}) {
  const { user, canAccessAdmin } = useAuth();
  const { openAuth } = useAuthDialog();
  const f = { ...EMPTY, ...filters };
  const {
    posts, replies, liked, loading, refreshing, loadingMore, loadMoreFailed, hasMore, unavailable, error, signedIn, newCount,
    reload, loadMore, checkNew, publish, toggleLike, report, remove, pin, markOfficial, hide,
  } = useCommunity({ bookId: book?.id || f.book || null, topic: f.topic, kind: f.kind, sort: f.sort, query: f.query });
  const topicsBySlug = useMemo(() => Object.fromEntries(topics.map((t) => [t.slug, t])), [topics]);
  const sentinel = useRef(null);
  const listTop = useRef(null);
  const needAuth = () => openAuth({ mode: 'login' });
  const userKey = user?.reader_key || user?.id || '';
  const author = { name: user?.name || user?.email || 'Leitor', key: user?.reader_key || user?.id };
  const draftKey = draftStorageKey(userKey, book ? `livro:${book.id}` : 'feed');

  // Ao chegar ao fim da lista carrega a página seguinte; o botão fica para o teclado. Depois de
  // uma falha pára: com a rede em baixo, o sentinel continuava à vista e pedia sem parar.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loadMoreFailed || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, loadMoreFailed]);

  // "Há publicações novas": pergunta de minuto a minuto com a página à vista, e ao voltar a ela.
  useEffect(() => {
    if (book || f.sort !== 'recentes' || typeof document === 'undefined') return undefined;
    const tick = () => { if (document.visibilityState === 'visible') checkNew(); };
    const timer = setInterval(tick, NEW_POSTS_EVERY_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [book, f.sort, checkNew]);

  const showNew = () => {
    listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    reload();
  };

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-8 text-center text-editorial-tinta-suave">
        <MessagesSquare className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
        A comunidade abre em breve.
      </div>
    );
  }

  const write = () => {
    if (!signedIn) { needAuth(); return; }
    onWrite?.();
  };

  return (
    <div className="space-y-4">
      {!book && <FeedPlace ready={!loading && posts.length > 0} />}
      {signedIn ? (
        <PostComposer
          collapsible
          book={book}
          allowBook={!book}
          topics={topics}
          defaultTopic={f.topic}
          author={author}
          placeholder={book ? `O que achou de "${book.title}"?` : undefined}
          onSubmit={publish}
          onOpenRequest={composerInSheet && onWrite ? onWrite : undefined}
          draftKey={draftKey}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-4">
          <p className="flex items-center gap-2 text-sm text-editorial-tinta">
            <Feather className="h-4 w-4 text-editorial-ouro" aria-hidden="true" />
            Entre na sua conta para publicar, responder e gostar.
          </p>
          <Button type="button" onClick={needAuth} className="bg-editorial-petroleo hover:bg-editorial-petroleo/90">Entrar</Button>
        </div>
      )}

      {signedIn && onSheetOpenChange && (
        <ComposerSheet
          open={sheetOpen} onOpenChange={onSheetOpenChange}
          book={book} allowBook={!book} topics={topics} defaultTopic={f.topic} author={author}
          placeholder={book ? `O que achou de "${book.title}"?` : undefined}
          onSubmit={publish} draftKey={draftKey}
        />
      )}

      <div ref={listTop} className="scroll-mt-28" />
      {newCount > 0 && !refreshing && (
        <div className="sticky top-[calc(var(--header-offset,0px)+0.75rem)] z-20 flex justify-center">
          <button
            type="button" onClick={showNew}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-editorial-petroleo px-4 text-sm font-semibold text-white shadow-lg"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
            {newCount >= 10 ? 'Há publicações novas' : plural(newCount, 'publicação nova', 'publicações novas')}
          </button>
        </div>
      )}

      {loading ? (
        <PostSkeleton count={book ? 2 : 3} />
      ) : error && posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-8 text-center" role="alert">
          <p className="text-sm text-editorial-tinta">{error} Verifique a ligação à internet.</p>
          <Button type="button" variant="outline" onClick={reload} className="mt-3 border-editorial-filete bg-editorial-papel">
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Tentar outra vez
          </Button>
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-editorial-filete bg-editorial-papel p-8 text-center">
          <MessagesSquare className="mx-auto mb-3 h-7 w-7 text-editorial-ouro" aria-hidden="true" />
          <p className="text-sm text-editorial-tinta-suave">{emptyText({ book, filters: f })}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(onWrite || !signedIn) && f.sort !== 'sem_resposta' && (
              <Button type="button" onClick={write} className="bg-editorial-petroleo hover:bg-editorial-petroleo/90">
                <Feather className="mr-1.5 h-4 w-4" aria-hidden="true" /> Escrever
              </Button>
            )}
            {!book && onClearFilters && hasFilters(f) && (
              <Button type="button" variant="outline" onClick={onClearFilters} className="border-editorial-filete bg-editorial-papel">
                Ver todas as publicações
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing || undefined}>
          {refreshing && <p className="sr-only" role="status">A actualizar as publicações…</p>}
          {posts.map((post) => (
            <PostCard
              key={post.id} post={post} replies={replies[post.id] || []} liked={liked} signedIn={signedIn}
              isStaff={!!canAccessAdmin} topics={topicsBySlug} showBook={!book}
              onLike={toggleLike} onReport={report} onRemove={remove} onPublish={publish} onNeedAuth={needAuth}
              onPin={pin} onOfficial={markOfficial} onHide={hide}
            />
          ))}
          <div ref={sentinel} aria-hidden="true" />
          {loadMoreFailed ? (
            <div className="rounded-2xl border border-editorial-filete bg-editorial-papel p-4 text-center" role="alert">
              <p className="text-sm text-editorial-tinta">Não foi possível carregar mais publicações.</p>
              <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="mt-2 border-editorial-filete bg-editorial-papel">
                {loadingMore ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                Tentar outra vez
              </Button>
            </div>
          ) : hasMore ? (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="border-editorial-filete bg-editorial-papel">
                {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                {loadingMore ? 'A carregar…' : 'Ver mais publicações'}
              </Button>
            </div>
          ) : posts.length >= PAGE_SIZE / 2 && (
            <p className="py-2 text-center text-xs text-editorial-tinta-suave">
              Chegou ao fim.{signedIn && onWrite ? ' ' : ''}
              {signedIn && onWrite && (
                <button type="button" onClick={write} className="font-semibold text-editorial-petroleo underline underline-offset-2">Comece uma conversa</button>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
