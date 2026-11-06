import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ExternalLink, Flag, Heart, MessageCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { linkHost, linkifySegments } from '@/lib/communityLinks';
import { initials, relativeTime } from '@/lib/communityText';
import PostComposer from '@/components/community/PostComposer';

const REPORT_REASONS = ['Spam ou publicidade', 'Link suspeito', 'Ofensivo ou desrespeitoso', 'Outro motivo'];
// Links de utilizadores: sem passar autoridade de pesquisa, sem dar acesso à página de origem.
const USER_LINK_REL = 'nofollow ugc noopener noreferrer';

function Body({ text }) {
  return (
    <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
      {linkifySegments(text).map((seg, i) => (seg.type === 'link'
        ? <a key={i} href={seg.href} target="_blank" rel={USER_LINK_REL} className="text-primary underline underline-offset-2 break-all">{seg.label}</a>
        : <React.Fragment key={i}>{seg.value}</React.Fragment>))}
    </p>
  );
}

function Actions({ post, liked, signedIn, onLike, onReply, onReport, onRemove, onNeedAuth, replyCount }) {
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');

  const guard = (fn) => () => (signedIn ? fn() : onNeedAuth());

  const sendReport = async (reason) => {
    const err = await onReport(post, reason);
    setReporting(false);
    setNotice(err || 'Obrigado. A equipa vai rever esta publicação.');
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <Button
          type="button" variant="ghost" size="sm"
          className={`h-8 gap-1.5 px-2 ${liked ? 'text-rose-600' : ''}`}
          aria-pressed={liked}
          aria-label={liked ? 'Retirar gosto' : 'Gostar'}
          onClick={guard(() => onLike(post))}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} aria-hidden="true" />
          <span className="tabular-nums">{post.likes_count || 0}</span>
        </Button>
        {onReply && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={guard(onReply)}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Responder{replyCount ? ` (${replyCount})` : ''}
          </Button>
        )}
        {!post.mine && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={guard(() => setReporting((v) => !v))}>
            <Flag className="h-4 w-4" aria-hidden="true" /> Denunciar
          </Button>
        )}
        {post.mine && (
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Apagar
          </Button>
        )}
      </div>

      {reporting && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs" role="group" aria-label="Motivo da denúncia">
          <span className="font-medium">Porquê?</span>
          {REPORT_REASONS.map((r) => (
            <Button key={r} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => sendReport(r)}>{r}</Button>
          ))}
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReporting(false)}>Cancelar</Button>
        </div>
      )}
      {confirmDelete && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs">
          <span>Apagar {post.parent_id ? 'esta resposta' : 'esta publicação e as respostas'}?</span>
          <Button type="button" size="sm" variant="destructive" className="h-7 text-xs" onClick={async () => { const err = await onRemove(post); if (err) setNotice(err); setConfirmDelete(false); }}>Apagar</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
        </div>
      )}
      {notice && <p className="text-xs text-muted-foreground" role="status">{notice}</p>}
    </div>
  );
}

function Author({ post, small }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        aria-hidden="true"
        className={`${small ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs'} grid shrink-0 place-items-center rounded-full bg-marca/15 font-semibold text-primary`}
      >
        {initials(post.author_name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{post.author_name}</p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={post.created}>{relativeTime(post.created)}</time>
        </p>
      </div>
    </div>
  );
}

/** Uma publicação da comunidade, com as respostas (um nível) por baixo. */
export default function PostCard({ post, replies = [], liked, signedIn, onLike, onReport, onRemove, onPublish, onNeedAuth, showBook = true }) {
  const [replying, setReplying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const visibleReplies = showAll ? replies : replies.slice(-3);
  const links = Array.isArray(post.links) ? post.links : [];

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm" aria-label={`Publicação de ${post.author_name}`}>
      <Author post={post} />

      <div className="mt-3 space-y-3">
        <Body text={post.body} />

        {post.quote && (
          <blockquote className="border-l-4 border-marca/50 bg-muted/40 py-2 pl-3 pr-2 text-sm italic text-foreground">
            “{post.quote}”
            {(post.book_title || post.quote_page) && (
              <footer className="mt-1 text-xs not-italic text-muted-foreground">
                — {[post.book_title, post.quote_page].filter(Boolean).join(', ')}
              </footer>
            )}
          </blockquote>
        )}

        {links.length > 0 && (
          <ul className="space-y-1.5" aria-label="Links partilhados">
            {links.map((href) => (
              <li key={href}>
                <a
                  href={href} target="_blank" rel={USER_LINK_REL}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50"
                  title="Link partilhado por um utilizador. Abre noutro separador."
                >
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-medium">{linkHost(href)}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">link externo</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        {showBook && post.book_id && post.book_title && (
          <Link to={`/product/${post.book_id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/70">
            <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{post.book_title}</span>
          </Link>
        )}
      </div>

      <Actions
        post={post} liked={liked?.has(post.id)} signedIn={signedIn} replyCount={replies.length}
        onLike={onLike} onReport={onReport} onRemove={onRemove} onNeedAuth={onNeedAuth}
        onReply={() => setReplying((v) => !v)}
      />

      {(replies.length > 0 || replying) && (
        <section className="mt-3 space-y-3 border-l-2 border-muted pl-3 sm:pl-4" aria-label="Respostas">
          {replies.length > 3 && !showAll && (
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setShowAll(true)}>
              Ver as {replies.length} respostas
            </button>
          )}
          {visibleReplies.map((r) => (
            <div key={r.id} className="rounded-xl bg-muted/30 p-3">
              <Author post={r} small />
              <div className="mt-2"><Body text={r.body} /></div>
              <Actions post={r} liked={liked?.has(r.id)} signedIn={signedIn} onLike={onLike} onReport={onReport} onRemove={onRemove} onNeedAuth={onNeedAuth} />
            </div>
          ))}
          {replying && (
            <PostComposer
              compact
              placeholder={`Responder a ${post.author_name}…`}
              submitLabel="Responder"
              onSubmit={async (fields) => {
                const err = await onPublish({ ...fields, parentId: post.id, bookId: post.book_id });
                if (!err) setReplying(false);
                return err;
              }}
              onCancel={() => setReplying(false)}
            />
          )}
        </section>
      )}
    </article>
  );
}
