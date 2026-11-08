import React, { useEffect, useId, useRef, useState } from 'react';
import { BookHeart, BookOpen, CircleHelp, Link2, Loader2, MessagesSquare, Quote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { searchProducts } from '@/api/EcommerceApi';
import { MAX_LINKS, linkHost, linkProblem, safeHref } from '@/lib/communityLinks';
import { MAX_BODY, MAX_QUOTE } from '@/lib/communityText';
import { POST_KINDS } from '@/lib/communityStyle';
import Monogram from '@/components/community/Monogram';
import { clearDraft, counterState, isEmptyDraft, readDraft, saveDraft } from '@/lib/composerDraft';

const KIND_ICONS = { discussao: MessagesSquare, pergunta: CircleHelp, citacao: Quote, recomendacao: BookHeart };
const PLACEHOLDERS = {
  discussao: 'Partilhe uma ideia sobre uma leitura ou um tema…',
  pergunta: 'Qual é a sua pergunta? Quanto mais clara, melhores as respostas.',
  citacao: 'Porque é que esta passagem o marcou?',
  recomendacao: 'Que livro recomenda, e a quem?',
};

/** Escolher o livro de que se fala, com a pesquisa do catálogo e a capa. */
export function BookPicker({ value, onChange }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { products } = await searchProducts(q, 6);
        if (alive) setResults(products || []);
      } catch {
        if (alive) setResults([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-editorial-filete bg-editorial-tela px-3 py-2 text-sm">
        {value.image
          ? <img src={value.image} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
          : <BookOpen className="h-4 w-4 shrink-0 text-editorial-ouro" aria-hidden="true" />}
        <span className="truncate font-semibold text-editorial-tinta">{value.title}</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label="Tirar o livro" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-editorial-tinta">Livro de que fala (opcional)</Label>
      <div className="relative">
        <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, autor ou código" autoComplete="off" className="bg-editorial-papel" />
        {searching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {results.length > 0 && (
        <ul className="max-h-60 overflow-y-auto rounded-xl border border-editorial-filete bg-editorial-papel text-sm shadow-xs" aria-label="Livros encontrados">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-editorial-tela"
                onClick={() => { onChange({ id: p.id, title: p.title, image: p.image || '' }); setQuery(''); setResults([]); }}
              >
                {p.image ? <img src={p.image} alt="" className="h-10 w-7 shrink-0 rounded object-cover" /> : <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.title}</span>
                  {p.subtitle && <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Contador de caracteres que só aparece perto do limite (`counterState`). */
function Counter({ length, max, id }) {
  const state = counterState(length, max);
  if (state === 'hidden') return null;
  return (
    <p id={id} className={`mt-1 text-right text-xs tabular-nums ${state === 'warn' ? 'font-semibold text-destructive' : 'text-editorial-tinta-suave'}`} aria-live="polite">
      {length}/{max}
    </p>
  );
}

/**
 * Escrever uma publicação ou uma resposta. `onSubmit(fields)` devolve `''` quando correu bem,
 * ou a mensagem de erro, que aparece por baixo do formulário. Com `collapsible`, começa fechado
 * numa barra ("Partilhe uma ideia…"), como numa rede social; com `onOpenRequest`, a barra não
 * abre o formulário no sítio e pede ao pai que o abra (no telemóvel, numa folha de baixo).
 *
 * No telemóvel:
 * - `draftKey` guarda o rascunho no aparelho (`composerDraft.js`) e recupera-o ao voltar;
 * - `stickyActions` prende "Publicar" ao fundo da folha, por cima do teclado;
 * - os campos têm 16 px de letra: abaixo disso o iPhone faz zoom ao tocar e a página salta.
 */
export default function PostComposer({
  onSubmit, onCancel, onSent, onOpenRequest, compact = false, collapsible = false, placeholder, submitLabel = 'Publicar',
  book = null, allowBook = true, topics = [], defaultTopic = '', author = null, draftKey = '', stickyActions = false,
  autoFocus = false,
}) {
  const ids = { body: useId(), quote: useId(), page: useId(), link: useId(), topic: useId(), kind: useId(), bodyCount: useId() };
  const restored = useRef(readDraft(draftKey));
  const draft = restored.current;
  const [open, setOpen] = useState(!collapsible);
  const [kind, setKind] = useState(draft?.kind || 'discussao');
  const [topic, setTopic] = useState(draft?.topic ?? (defaultTopic || ''));
  const [body, setBody] = useState(draft?.body || '');
  const [chosenBook, setChosenBook] = useState(book || draft?.book || null);
  const [showQuote, setShowQuote] = useState(!!draft?.quote);
  const [quote, setQuote] = useState(draft?.quote || '');
  const [quotePage, setQuotePage] = useState(draft?.quotePage || '');
  const [showLinks, setShowLinks] = useState(!!draft?.links?.length);
  const [linkInput, setLinkInput] = useState('');
  const [links, setLinks] = useState(draft?.links || []);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [draftNotice, setDraftNotice] = useState(!!draft);

  useEffect(() => { if (book) setChosenBook(book); }, [book]);
  useEffect(() => { if (!draft) setTopic(defaultTopic || ''); }, [defaultTopic, draft]);
  // Uma citação abre logo o campo da citação.
  useEffect(() => { if (kind === 'citacao') setShowQuote(true); }, [kind]);

  // O rascunho fica no aparelho enquanto se escreve (meio segundo depois da última tecla).
  useEffect(() => {
    if (!draftKey) return undefined;
    const t = setTimeout(() => {
      saveDraft(draftKey, { body, quote: showQuote ? quote : '', quotePage: showQuote ? quotePage : '', links, kind, topic, book: allowBook ? chosenBook : null });
    }, 500);
    return () => clearTimeout(t);
  }, [draftKey, body, quote, quotePage, showQuote, links, kind, topic, chosenBook, allowBook]);

  const addLink = () => {
    const href = safeHref(linkInput);
    if (!href) { setError('Esse link não serve: use um endereço que comece por http:// ou https://.'); return; }
    const problem = linkProblem(linkInput);
    if (problem) { setError(problem); return; }
    if (links.includes(href)) { setLinkInput(''); return; }
    if (links.length >= MAX_LINKS) { setError(`No máximo ${MAX_LINKS} links por publicação.`); return; }
    setLinks((l) => [...l, href]);
    setLinkInput('');
    setError('');
  };

  const reset = () => {
    setBody(''); setQuote(''); setQuotePage(''); setLinks([]); setLinkInput('');
    setShowQuote(false); setShowLinks(false); setKind('discussao'); setDraftNotice(false);
    if (!book) setChosenBook(null);
    if (collapsible) setOpen(false);
    clearDraft(draftKey);
  };

  const discardDraft = () => {
    reset();
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    if (!compact && kind === 'citacao' && !quote.trim()) { setError('Escreva a citação do livro.'); return; }
    setSending(true);
    setError('');
    const err = await onSubmit({
      body, quote: showQuote ? quote : '', quotePage: showQuote ? quotePage : '', links,
      bookId: chosenBook?.id || null, topic: topic || null, kind,
    });
    setSending(false);
    if (err) { setError(err); return; }
    reset();
    onSent?.();
  };

  if (collapsible && !open) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-3 shadow-xs sm:p-4">
        {author && <Monogram name={author.name} authorKey={author.key} />}
        <button
          type="button"
          data-composer-open=""
          className="min-h-11 flex-1 truncate rounded-full border border-editorial-filete bg-editorial-tela px-4 text-left text-sm text-editorial-tinta-suave transition-colors hover:bg-editorial-filete/40"
          onClick={() => (onOpenRequest ? onOpenRequest() : setOpen(true))}
        >
          {draft && !isEmptyDraft(draft) ? 'Continuar o rascunho…' : 'Partilhe uma ideia, uma pergunta ou uma leitura…'}
        </button>
      </div>
    );
  }

  const actionsClass = stickyActions
    ? 'sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-editorial-filete bg-editorial-papel/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xs'
    : 'flex flex-wrap items-center justify-end gap-2';

  return (
    <form onSubmit={submit} className={compact ? 'space-y-2' : stickyActions ? 'space-y-4' : 'space-y-4 rounded-2xl border border-editorial-filete bg-editorial-papel p-4 shadow-xs sm:p-5'}>
      {draftNotice && !isEmptyDraft({ body, quote, links }) && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-editorial-tela px-3 py-2 text-xs text-editorial-tinta" role="status">
          Recuperámos o rascunho que estava a escrever.
          <button type="button" onClick={discardDraft} className="ml-auto min-h-8 rounded-full px-2 font-semibold text-editorial-petroleo underline underline-offset-2">Apagar o rascunho</button>
        </p>
      )}
      {!compact && (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-editorial-tinta-suave">O que quer publicar?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POST_KINDS.map((k) => {
              const Icon = KIND_ICONS[k.value];
              const active = kind === k.value;
              return (
                <label
                  key={k.value}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-editorial-petroleo ${active ? 'border-editorial-petroleo bg-editorial-petroleo/5 font-semibold text-editorial-tinta' : 'border-editorial-filete text-editorial-tinta-suave hover:bg-editorial-tela'}`}
                >
                  <input type="radio" name={ids.kind} value={k.value} checked={active} onChange={() => setKind(k.value)} className="sr-only" />
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-editorial-petroleo' : ''}`} aria-hidden="true" />
                  {k.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div>
        <Label htmlFor={ids.body} className="sr-only">{compact ? 'Resposta' : 'Publicação'}</Label>
        <Textarea
          id={ids.body} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder || PLACEHOLDERS[kind]}
          rows={compact ? 2 : 4} maxLength={MAX_BODY} className="resize-y bg-editorial-papel text-base sm:text-[15px]"
          aria-describedby={counterState(body.length, MAX_BODY) === 'hidden' ? undefined : ids.bodyCount}
          autoFocus={autoFocus || (collapsible && open)}
          enterKeyHint={compact ? 'send' : 'enter'}
        />
        <Counter length={body.length} max={MAX_BODY} id={ids.bodyCount} />
      </div>

      {!compact && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {topics.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor={ids.topic} className="text-xs font-semibold text-editorial-tinta">Tema</Label>
                <select
                  id={ids.topic} value={topic} onChange={(e) => setTopic(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-editorial-papel px-3 text-base sm:h-10 sm:text-sm"
                >
                  <option value="">Sem tema</option>
                  {topics.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                </select>
              </div>
            )}
            {allowBook && <BookPicker value={chosenBook} onChange={setChosenBook} />}
          </div>

          {showQuote && (
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1.5">
                <Label htmlFor={ids.quote} className="text-xs font-semibold text-editorial-tinta">Citação do livro</Label>
                <Textarea id={ids.quote} value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} maxLength={MAX_QUOTE} placeholder="Copie a frase tal como está no livro" className="bg-editorial-papel text-base sm:text-sm" />
                <Counter length={quote.length} max={MAX_QUOTE} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.page} className="text-xs font-semibold text-editorial-tinta">Página</Label>
                <Input id={ids.page} value={quotePage} onChange={(e) => setQuotePage(e.target.value)} maxLength={40} placeholder="p. 45" inputMode="text" className="bg-editorial-papel" />
              </div>
            </div>
          )}

          {showLinks && (
            <div className="space-y-2">
              <Label htmlFor={ids.link} className="text-xs font-semibold text-editorial-tinta">Link para uma leitura ou referência</Label>
              <div className="flex gap-2">
                <Input
                  id={ids.link} type="url" inputMode="url" enterKeyHint="done" value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                  placeholder="https://…" className="bg-editorial-papel"
                />
                <Button type="button" variant="outline" onClick={addLink}>Acrescentar</Button>
              </div>
              {links.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {links.map((href) => (
                    <li key={href} className="flex items-center gap-1 rounded-full bg-editorial-tela py-0.5 pl-2.5 pr-0.5 text-xs">
                      <Link2 className="h-3 w-3" aria-hidden="true" />{linkHost(href)}
                      <button
                        type="button" aria-label={`Tirar ${linkHost(href)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-editorial-filete/60"
                        onClick={() => setLinks((l) => l.filter((x) => x !== href))}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-10 gap-1.5" aria-pressed={showQuote} onClick={() => setShowQuote((v) => !v)}>
              <Quote className="h-4 w-4" aria-hidden="true" /> Citação
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-10 gap-1.5" aria-pressed={showLinks} onClick={() => setShowLinks((v) => !v)}>
              <Link2 className="h-4 w-4" aria-hidden="true" /> Link
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className={actionsClass}>
        {!compact && (
          <p className="mr-auto text-xs text-editorial-tinta-suave">
            Fica público, com o nome do seu perfil.{' '}
            <a href="/privacidade#comunidade" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-editorial-tinta">O que fica visível</a>
          </p>
        )}
        {(onCancel || (collapsible && open)) && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel || (() => { setOpen(false); setError(''); })}>
            {draftKey && !isEmptyDraft({ body, quote, links }) ? 'Fechar (fica guardado)' : 'Cancelar'}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={sending || !body.trim()} className="bg-editorial-petroleo hover:bg-editorial-petroleo/90">
          {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
