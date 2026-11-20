// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BadgeCheck, BookOpen, Copy, ExternalLink, EyeOff, Flag, Heart, MessageCircle, MoreHorizontal, Pin, PinOff,
  Share2, Trash2, UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cleanLinks, linkHost, linkifySegments } from '@/lib/communityLinks';
import { relativeTime } from '@/lib/communityText';
import { needsClamp, plural, postKind, postPath, readerPath, whatsappShareUrl } from '@/lib/communityStyle';
import Monogram from '@/components/community/Monogram';
import TopicIcon from '@/components/community/TopicIcon';
import PostComposer from '@/components/community/PostComposer';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { useReaderLevel } from '@/hooks/useReader';
import ReaderBadge from '@/components/community/ReaderBadge';
import { canNativeShare, nativeShare } from '@/lib/nativeShare';
import { useBloqueios } from '@/lib/communityBlocks';

const REPORT_REASONS = ['Spam ou publicidade', 'Link suspeito', 'Ofensivo ou desrespeitoso', 'Outro motivo'];
// Links de utilizadores: sem passar autoridade de pesquisa, sem dar acesso à página de origem.
const USER_LINK_REL = 'nofollow ugc noopener noreferrer';
const KIND_TONE = {
  discussao: 'bg-editorial-tela text-editorial-tinta',
  pergunta: 'bg-sky-50 text-sky-900',
  citacao: 'bg-amber-50 text-editorial-ouro-texto',
  recomendacao: 'bg-emerald-50 text-emerald-900',
};

function Body({ text, clamp = true }) {
  const [open, setOpen] = useState(false);
  const long = clamp && needsClamp(text);
  return (
    <div>
      <p className={`whitespace-pre-line wrap-break-word text-[15px] leading-relaxed text-editorial-tinta ${long && !open ? 'line-clamp-6' : ''}`}>
        {linkifySegments(text).map((seg, i) => (seg.type === 'link'
          ? <a key={i} href={seg.href} target="_blank" rel={USER_LINK_REL} className="break-all text-editorial-petroleo underline underline-offset-2">{seg.label}</a>
          : <React.Fragment key={i}>{seg.value}</React.Fragment>))}
      </p>
      {long && (
        <button type="button" className="mt-1 text-sm font-semibold text-editorial-petroleo hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Mostrar menos' : 'Ler mais'}
        </button>
      )}
    </div>
  );
}

function Author({ post, small = false, linkToPost = true }) {
  const now = useMinuteTick();
  // O distintivo do leitor (Leitor, assíduo, de honra), pedido em lote pela chave pública.
  const level = useReaderLevel(post.author_is_staff ? null : post.author_key);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Monogram name={post.author_name} authorKey={post.author_key} size={small ? 'sm' : 'md'} staff={post.author_is_staff} />
      <div className="min-w-0">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
          {post.author_key ? (
            <Link to={readerPath(post.author_key)} className="truncate font-semibold text-editorial-tinta hover:underline">{post.author_name}</Link>
          ) : <span className="truncate font-semibold text-editorial-tinta">{post.author_name}</span>}
          {post.author_is_staff && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-editorial-tela px-1.5 py-0.5 text-[11px] font-semibold text-editorial-ouro-texto">
              <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Equipa da Livraria
            </span>
          )}
          {!post.author_is_staff && !small && <ReaderBadge level={level} />}
        </p>
        <p className="text-xs text-editorial-tinta-suave">
          {linkToPost && !post.parent_id ? (
            <Link to={postPath(post.id)} className="hover:underline"><time dateTime={post.created}>{relativeTime(post.created, now)}</time></Link>
          ) : <time dateTime={post.created}>{relativeTime(post.created, now)}</time>}
        </p>
      </div>
    </div>
  );
}

function ShareMenu({ post }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // No telemóvel, a folha de partilha do próprio sistema (WhatsApp, Facebook, SMS, copiar…),
  // como nas lojas e redes sociais; o menu fica para o computador e para quem a cancelar.
  // Cancelada pela pessoa ou não suportada neste navegador: nada a fazer (lib/nativeShare.js).
  const partilhar = () => nativeShare({
    title: `${postKind(post.kind).label} de ${post.author_name}`,
    text: String(post.quote || post.body || '').replace(/\s+/g, ' ').slice(0, 140),
    url: `${origin}${postPath(post.id)}`,
  });
  if (canNativeShare()) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={partilhar} className="h-11 gap-1.5 px-2.5 text-editorial-tinta-suave hover:text-editorial-tinta sm:h-9">
        <Share2 className="h-4 w-4" aria-hidden="true" /> Partilhar
      </Button>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${origin}${postPath(post.id)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-11 gap-1.5 px-2.5 text-editorial-tinta-suave hover:text-editorial-tinta sm:h-9">
          <Share2 className="h-4 w-4" aria-hidden="true" /> {copied ? 'Copiado' : 'Partilhar'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild>
          <a href={whatsappShareUrl(post, origin)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" /> WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copy}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Copiar o link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** O primeiro nome, para as frases curtas («Bloquear Ana»). */
const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'esta pessoa';

function Actions({ post, liked, signedIn, isStaff, replyCount, onLike, onReply, onReport, onRemove, onNeedAuth, onPin, onOfficial, onHide, onBlock, share = false }) {
  const [reporting, setReporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  // Bloquear: quem não é o próprio nem a equipa (a equipa modera; não se esconde de quem modera).
  const podeBloquear = !!onBlock && !post.mine && !!post.author_key && !post.author_is_staff;
  const [notice, setNotice] = useState('');
  const guard = (fn) => () => (signedIn ? fn() : onNeedAuth());
  const run = async (fn) => { const err = await fn(); if (err) setNotice(err); };

  const sendReport = async (reason) => {
    const err = await onReport(post, reason);
    setReporting(false);
    setNotice(err || 'Obrigado. A equipa vai rever esta publicação.');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-0.5">
        <Button
          type="button" variant="ghost" size="sm"
          className={`h-11 gap-1.5 px-2.5 sm:h-9 ${liked ? 'text-rose-700 hover:text-rose-700' : 'text-editorial-tinta-suave hover:text-editorial-tinta'}`}
          aria-pressed={liked} aria-label={`${liked ? 'Retirar gosto' : 'Gostar'} (${post.likes_count || 0})`}
          onClick={guard(() => onLike(post))}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} aria-hidden="true" />
          <span className="tabular-nums">{post.likes_count || 0}</span>
        </Button>
        {onReply && (
          <Button type="button" variant="ghost" size="sm" className="h-11 gap-1.5 px-2.5 text-editorial-tinta-suave hover:text-editorial-tinta sm:h-9" onClick={guard(onReply)}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Responder{replyCount ? <span className="tabular-nums">({replyCount})</span> : null}
          </Button>
        )}
        {share && <ShareMenu post={post} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="ml-auto h-11 w-11 text-editorial-tinta-suave sm:h-9 sm:w-9" aria-label="Mais acções">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!post.mine && (
              <DropdownMenuItem onSelect={guard(() => setReporting(true))}>
                <Flag className="mr-2 h-4 w-4" aria-hidden="true" /> Denunciar
              </DropdownMenuItem>
            )}
            {podeBloquear && (
              <DropdownMenuItem onSelect={guard(() => setConfirmBlock(true))}>
                <UserX className="mr-2 h-4 w-4" aria-hidden="true" /> Bloquear {primeiroNome(post.author_name)}
              </DropdownMenuItem>
            )}
            {post.mine && (
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Apagar
              </DropdownMenuItem>
            )}
            {isStaff && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Equipa</DropdownMenuLabel>
                {!post.parent_id && onPin && (
                  <DropdownMenuItem onSelect={() => run(() => onPin(post))}>
                    {post.pinned ? <PinOff className="mr-2 h-4 w-4" aria-hidden="true" /> : <Pin className="mr-2 h-4 w-4" aria-hidden="true" />}
                    {post.pinned ? 'Desafixar' : 'Fixar no topo'}
                  </DropdownMenuItem>
                )}
                {post.parent_id && onOfficial && (
                  <DropdownMenuItem onSelect={() => run(() => onOfficial(post))}>
                    <BadgeCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                    {post.is_official ? 'Tirar resposta oficial' : 'Marcar como resposta oficial'}
                  </DropdownMenuItem>
                )}
                {onHide && (
                  <DropdownMenuItem onSelect={() => run(() => onHide(post))}>
                    <EyeOff className="mr-2 h-4 w-4" aria-hidden="true" /> Ocultar
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {reporting && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-editorial-filete bg-editorial-tela p-2.5 text-xs" role="group" aria-label="Motivo da denúncia">
          <span className="font-semibold text-editorial-tinta">Porquê?</span>
          {REPORT_REASONS.map((r) => (
            <Button key={r} type="button" size="sm" variant="outline" className="h-10 bg-editorial-papel text-xs sm:h-8" onClick={() => sendReport(r)}>{r}</Button>
          ))}
          <Button type="button" size="sm" variant="ghost" className="h-10 text-xs sm:h-8" onClick={() => setReporting(false)}>Cancelar</Button>
        </div>
      )}
      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
          <span>Apagar {post.parent_id ? 'esta resposta' : 'esta publicação e as respostas'}?</span>
          <Button type="button" size="sm" variant="destructive" className="h-10 text-xs sm:h-8" onClick={async () => { const err = await onRemove(post); if (err) setNotice(err); setConfirmDelete(false); }}>Apagar</Button>
          <Button type="button" size="sm" variant="ghost" className="h-10 text-xs sm:h-8" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
        </div>
      )}
      {confirmBlock && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-editorial-filete bg-editorial-tela p-2.5 text-xs" role="group" aria-label="Bloquear">
          <span>
            Bloquear {post.author_name}? Deixa de ver as publicações e as respostas desta pessoa; ela não é avisada.
            Desbloqueia-se em Perfil → Segurança e privacidade.
          </span>
          <Button
            type="button" size="sm" className="h-10 text-xs sm:h-8"
            onClick={async () => { const err = await onBlock(post); setConfirmBlock(false); if (err) setNotice(err); }}
          >
            Bloquear
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-10 text-xs sm:h-8" onClick={() => setConfirmBlock(false)}>Cancelar</Button>
        </div>
      )}
      {notice && <p className="text-xs text-editorial-tinta-suave" role="status">{notice}</p>}
    </div>
  );
}

/** Citação em destaque, como numa revista: serifa em itálico, filete dourado, livro e página. */
function PullQuote({ post }) {
  return (
    <figure className="relative rounded-r-xl border-l-[3px] border-editorial-ouro bg-editorial-tela/70 py-3 pl-4 pr-3">
      <blockquote className="text-lg italic leading-snug text-editorial-tinta font-serif">
        “{post.quote}”
      </blockquote>
      {(post.book_title || post.quote_page) && (
        <figcaption className="mt-1.5 text-xs font-medium uppercase tracking-wide text-editorial-ouro-texto">
          {[post.book_title, post.quote_page].filter(Boolean).join(' · ')}
        </figcaption>
      )}
    </figure>
  );
}

function BookCard({ post }) {
  return (
    <Link
      to={`/product/${post.book_id}`}
      className="flex items-center gap-3 rounded-xl border border-editorial-filete bg-editorial-papel p-2.5 transition-colors hover:bg-editorial-tela"
    >
      {post.book_cover ? (
        <img src={post.book_cover} alt="" loading="lazy" className="h-16 w-11 shrink-0 rounded object-cover shadow-xs" />
      ) : (
        <span className="grid h-16 w-11 shrink-0 place-items-center rounded bg-editorial-tela" aria-hidden="true"><BookOpen className="h-5 w-5 text-editorial-ouro" /></span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-editorial-tinta font-serif">{post.book_title}</span>
        {post.book_author && <span className="block truncate text-xs text-editorial-tinta-suave">{post.book_author}</span>}
        <span className="mt-0.5 block text-xs font-semibold text-editorial-petroleo">Ver o livro</span>
      </span>
    </Link>
  );
}

function Reply({ reply, ...props }) {
  return (
    <div className={`rounded-xl p-3 ${reply.is_official ? 'border border-editorial-ouro/60 bg-amber-50/60' : 'bg-editorial-tela/60'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Author post={reply} small linkToPost={false} />
        {reply.is_official && (
          <span className="inline-flex items-center gap-1 rounded-full bg-editorial-papel px-2 py-0.5 text-[11px] font-semibold text-editorial-ouro-texto">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Resposta oficial
          </span>
        )}
      </div>
      <div className="mt-2"><Body text={reply.body} /></div>
      <div className="mt-1">
        <Actions post={reply} {...props} />
      </div>
    </div>
  );
}

/**
 * Uma publicação da comunidade. No feed mostra as respostas mais recentes e liga à página da
 * publicação; na página (`full`) mostra todas e o editor de resposta aberto.
 */
export default function PostCard({
  post, replies = [], liked, signedIn, isStaff = false, topics = {}, full = false, showBook = true,
  onLike, onReport, onRemove, onPublish, onNeedAuth, onPin, onOfficial, onHide,
}) {
  // Na página da publicação o editor de resposta fica sempre aberto para quem tem sessão;
  // "Responder" leva-lhe o foco em vez de o fechar.
  const [replying, setReplying] = useState(full);
  const [focusReply, setFocusReply] = useState(false);
  const replyBox = useRef(null);
  const navigate = useNavigate();
  const { bloqueado, bloquear, desbloquear } = useBloqueios();
  const focusBox = () => {
    const box = replyBox.current?.querySelector('textarea');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box?.focus({ preventScroll: true });
  };
  const onReply = () => {
    if (!full) {
      setReplying((v) => !v);
      setFocusReply(true);
      return;
    }
    focusBox();
  };
  // No feed, "Responder" abre a caixa e já põe o cursor nela (antes abria sem foco).
  useEffect(() => {
    if (!focusReply || !replying) return;
    setFocusReply(false);
    focusBox();
  }, [focusReply, replying]);

  // Tocar no cartão (fora dos botões e links) abre a conversa, como num feed de telemóvel; antes
  // só a hora, minúscula, e "Ver … respostas" levavam lá. Seleccionar texto não conta.
  const openThread = (e) => {
    if (full || e.defaultPrevented) return;
    if (e.target.closest('a, button, input, textarea, select, label, summary, [role="menuitem"], [role="dialog"], form, [data-no-card-link]')) return;
    if (typeof window !== 'undefined' && String(window.getSelection?.() || '').trim()) return;
    navigate(postPath(post.id));
  };
  // Quem foi bloqueado (lib/communityBlocks.js): a publicação e as respostas dessa pessoa não
  // aparecem. Na página da publicação fica um aviso, para se poder desbloquear.
  const autorBloqueado = !post.mine && bloqueado(post.author_key);
  const showComposer = replying && signedIn;
  const daQuemSeVe = replies.filter((r) => r.mine || !bloqueado(r.author_key));
  const official = daQuemSeVe.filter((r) => r.is_official);
  const others = daQuemSeVe.filter((r) => !r.is_official);
  const visibleReplies = full ? daQuemSeVe : [...official, ...others.slice(-(official.length ? 1 : 2))];
  // O feed só recebe as respostas que mostra (FEED_REPLIES_PER_POST): o total vem da publicação.
  const totalReplies = Math.max(Number(post.replies_count) || 0, replies.length);
  const hiddenCount = totalReplies - visibleReplies.length;
  const links = cleanLinks(post.links);
  const topic = post.topic ? topics[post.topic] : null;
  const kind = postKind(post.kind);
  const answered = post.kind === 'pergunta' && official.length > 0;
  const onBlock = (alvo) => bloquear(alvo.author_key, alvo.author_name);
  const actionProps = {
    liked: false, signedIn, isStaff, onLike, onReport, onRemove, onNeedAuth, onPin, onOfficial, onHide, onBlock,
  };

  if (autorBloqueado) {
    if (!full) return null;
    return (
      <div className="rounded-2xl border border-editorial-filete bg-editorial-papel p-5 text-sm text-editorial-tinta-suave" data-autor-bloqueado>
        <p>Bloqueou quem escreveu esta publicação, por isso não a vê.</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => desbloquear(post.author_key)}>
          Desbloquear {primeiroNome(post.author_name)}
        </Button>
      </div>
    );
  }

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-editorial-filete bg-editorial-papel shadow-[0_1px_2px_rgba(29,42,63,0.06)] transition-shadow hover:shadow-[0_6px_24px_-8px_rgba(29,42,63,0.18)] ${full ? '' : 'cursor-pointer'}`}
      aria-label={`${kind.label} de ${post.author_name}`}
      onClick={openThread}
    >
      {post.pinned && (
        <div className="flex items-center gap-1.5 border-b border-editorial-filete bg-editorial-tela px-4 py-1.5 text-xs font-semibold text-editorial-ouro-texto sm:px-5">
          <Pin className="h-3.5 w-3.5" aria-hidden="true" /> Fixada pela equipa
        </div>
      )}
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <Author post={post} />
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${KIND_TONE[kind.value]}`}>
            {kind.label}{answered ? ' · Respondida' : ''}
          </span>
        </div>

        {topic && (
          <Link
            to={`/comunidade?tema=${encodeURIComponent(topic.slug)}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-editorial-petroleo hover:underline"
          >
            <TopicIcon name={topic.icon} className="h-3.5 w-3.5" /> {topic.name}
          </Link>
        )}

        <Body text={post.body} clamp={!full} />
        {post.quote && <PullQuote post={post} />}
        {showBook && post.book_id && post.book_title && <BookCard post={post} />}

        {links.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Links partilhados">
            {links.map((href) => (
              <li key={href}>
                <a
                  href={href} target="_blank" rel={USER_LINK_REL}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-editorial-filete bg-editorial-papel px-3 py-1.5 text-xs font-medium text-editorial-tinta hover:bg-editorial-tela"
                  title="Link partilhado por um leitor. Abre noutro separador."
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-editorial-tinta-suave" aria-hidden="true" />
                  <span className="truncate">{linkHost(href)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-editorial-filete pt-1.5">
          <Actions
            post={post} {...actionProps} liked={liked?.has(post.id)} share replyCount={post.replies_count ?? replies.length}
            onReply={onReply}
          />
        </div>

        {(visibleReplies.length > 0 || showComposer) && (
          <section className="space-y-2.5" aria-label="Respostas">
            {visibleReplies.map((r) => <Reply key={r.id} reply={r} {...actionProps} liked={liked?.has(r.id)} />)}
            {hiddenCount > 0 && (
              <Link to={postPath(post.id)} className="inline-block text-sm font-semibold text-editorial-petroleo hover:underline">
                Ver {hiddenCount === 1 ? 'mais 1 resposta' : `todas as ${plural(totalReplies, 'resposta', 'respostas')}`}
              </Link>
            )}
            {showComposer && (
              <div ref={replyBox} data-no-card-link="">
              <PostComposer
                compact
                placeholder={`Responder a ${post.author_name}…`}
                submitLabel="Responder"
                onSubmit={async (fields) => {
                  const err = await onPublish({ ...fields, parentId: post.id, bookId: post.book_id });
                  if (!err && !full) setReplying(false);
                  return err;
                }}
                onCancel={full ? undefined : () => setReplying(false)}
              />
              </div>
            )}
          </section>
        )}
        {full && !signedIn && (
          <p className="rounded-xl bg-editorial-tela px-4 py-3 text-sm text-editorial-tinta">
            <button type="button" onClick={onNeedAuth} className="font-semibold text-editorial-petroleo underline underline-offset-2">Entre na sua conta</button> para responder.
          </p>
        )}
      </div>
    </article>
  );
}
