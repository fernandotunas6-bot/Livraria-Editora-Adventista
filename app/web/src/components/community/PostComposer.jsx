import React, { useEffect, useId, useState } from 'react';
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
        <ul className="max-h-60 overflow-y-auto rounded-xl border border-editorial-filete bg-editorial-papel text-sm shadow-sm" aria-label="Livros encontrados">
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

/**
 * Escrever uma publicação ou uma resposta. `onSubmit(fields)` devolve `''` quando correu bem,
 * ou a mensagem de erro, que aparece por baixo do formulário. Com `collapsible`, começa fechado
 * numa barra ("Partilhe uma ideia…"), como numa rede social.
 */
export default function PostComposer({
  onSubmit, onCancel, compact = false, collapsible = false, placeholder, submitLabel = 'Publicar',
  book = null, allowBook = true, topics = [], defaultTopic = '', author = null,
}) {
  const ids = { body: useId(), quote: useId(), page: useId(), link: useId(), topic: useId(), kind: useId() };
  const [open, setOpen] = useState(!collapsible);
  const [kind, setKind] = useState('discussao');
  const [topic, setTopic] = useState(defaultTopic || '');
  const [body, setBody] = useState('');
  const [chosenBook, setChosenBook] = useState(book);
  const [showQuote, setShowQuote] = useState(false);
  const [quote, setQuote] = useState('');
  const [quotePage, setQuotePage] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { setChosenBook(book); }, [book]);
  useEffect(() => { setTopic(defaultTopic || ''); }, [defaultTopic]);
  // Uma citação abre logo o campo da citação.
  useEffect(() => { if (kind === 'citacao') setShowQuote(true); }, [kind]);

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
    setShowQuote(false); setShowLinks(false); setKind('discussao');
    if (!book) setChosenBook(null);
    if (collapsible) setOpen(false);
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
  };

  if (collapsible && !open) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-3 shadow-sm sm:p-4">
        {author && <Monogram name={author.name} authorKey={author.key} />}
        <button
          type="button"
          data-composer-open=""
          className="min-h-11 flex-1 rounded-full border border-editorial-filete bg-editorial-tela px-4 text-left text-sm text-editorial-tinta-suave transition-colors hover:bg-editorial-filete/40"
          onClick={() => setOpen(true)}
        >
          Partilhe uma ideia, uma pergunta ou uma leitura…
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={compact ? 'space-y-2' : 'space-y-4 rounded-2xl border border-editorial-filete bg-editorial-papel p-4 shadow-sm sm:p-5'}>
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
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-editorial-petroleo ${active ? 'border-editorial-petroleo bg-editorial-petroleo/5 font-semibold text-editorial-tinta' : 'border-editorial-filete text-editorial-tinta-suave hover:bg-editorial-tela'}`}
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
          rows={compact ? 2 : 4} maxLength={MAX_BODY} className="resize-y bg-editorial-papel text-[15px]"
          autoFocus={collapsible && open}
        />
        {!compact && <p className="mt-1 text-right text-xs text-editorial-tinta-suave tabular-nums">{body.length}/{MAX_BODY}</p>}
      </div>

      {!compact && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {topics.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor={ids.topic} className="text-xs font-semibold text-editorial-tinta">Tema</Label>
                <select
                  id={ids.topic} value={topic} onChange={(e) => setTopic(e.target.value)}
                  className="h-11 w-full rounded-md border border-input bg-editorial-papel px-3 text-sm sm:h-10"
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
                <Textarea id={ids.quote} value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} maxLength={MAX_QUOTE} placeholder="Copie a frase tal como está no livro" className="bg-editorial-papel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.page} className="text-xs font-semibold text-editorial-tinta">Página</Label>
                <Input id={ids.page} value={quotePage} onChange={(e) => setQuotePage(e.target.value)} maxLength={40} placeholder="p. 45" className="bg-editorial-papel" />
              </div>
            </div>
          )}

          {showLinks && (
            <div className="space-y-2">
              <Label htmlFor={ids.link} className="text-xs font-semibold text-editorial-tinta">Link para uma leitura ou referência</Label>
              <div className="flex gap-2">
                <Input
                  id={ids.link} type="url" inputMode="url" value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                  placeholder="https://…" className="bg-editorial-papel"
                />
                <Button type="button" variant="outline" onClick={addLink}>Acrescentar</Button>
              </div>
              {links.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {links.map((href) => (
                    <li key={href} className="flex items-center gap-1 rounded-full bg-editorial-tela px-2.5 py-1 text-xs">
                      <Link2 className="h-3 w-3" aria-hidden="true" />{linkHost(href)}
                      <button type="button" aria-label={`Tirar ${linkHost(href)}`} onClick={() => setLinks((l) => l.filter((x) => x !== href))}><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" aria-pressed={showQuote} onClick={() => setShowQuote((v) => !v)}>
              <Quote className="h-4 w-4" aria-hidden="true" /> Citação
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9 gap-1.5" aria-pressed={showLinks} onClick={() => setShowLinks((v) => !v)}>
              <Link2 className="h-4 w-4" aria-hidden="true" /> Link
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!compact && (
          <p className="mr-auto text-xs text-editorial-tinta-suave">
            Fica público, com o nome do seu perfil.{' '}
            <a href="/privacidade#comunidade" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-editorial-tinta">O que fica visível</a>
          </p>
        )}
        {(onCancel || (collapsible && open)) && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel || (() => { setOpen(false); setError(''); })}>Cancelar</Button>
        )}
        <Button type="submit" size="sm" disabled={sending || !body.trim()} className="bg-editorial-petroleo hover:bg-editorial-petroleo/90">
          {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
