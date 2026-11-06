import React, { useEffect, useId, useState } from 'react';
import { BookOpen, Link2, Loader2, Quote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { searchProducts } from '@/api/EcommerceApi';
import { MAX_LINKS, linkHost, safeHref } from '@/lib/communityLinks';
import { MAX_BODY, MAX_QUOTE } from '@/lib/communityText';

/** Escolher o livro de que se fala, com a pesquisa do catálogo. */
function BookPicker({ value, onChange }) {
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
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate font-medium">{value.title}</span>
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Tirar o livro" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">Livro de que fala (opcional)</Label>
      <div className="relative">
        <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Título, autor ou código" autoComplete="off" />
        {searching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border bg-popover text-sm" aria-label="Livros encontrados">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full truncate px-3 py-2 text-left hover:bg-muted" onClick={() => { onChange({ id: p.id, title: p.title }); setQuery(''); setResults([]); }}>
                {p.title}{p.subtitle ? <span className="text-muted-foreground"> · {p.subtitle}</span> : null}
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
 * ou a mensagem de erro, que aparece por baixo do formulário.
 */
export default function PostComposer({ onSubmit, onCancel, compact = false, placeholder = 'Partilhe uma ideia, uma pergunta ou uma leitura…', submitLabel = 'Publicar', book = null, allowBook = true }) {
  const ids = { body: useId(), quote: useId(), page: useId(), link: useId() };
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

  const addLink = () => {
    const href = safeHref(linkInput);
    if (!href) { setError('Esse link não serve: use um endereço que comece por http:// ou https://.'); return; }
    if (links.includes(href)) { setLinkInput(''); return; }
    if (links.length >= MAX_LINKS) { setError(`No máximo ${MAX_LINKS} links por publicação.`); return; }
    setLinks((l) => [...l, href]);
    setLinkInput('');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');
    const err = await onSubmit({ body, quote: showQuote ? quote : '', quotePage: showQuote ? quotePage : '', links, bookId: chosenBook?.id || null });
    setSending(false);
    if (err) { setError(err); return; }
    setBody(''); setQuote(''); setQuotePage(''); setLinks([]); setLinkInput('');
    setShowQuote(false); setShowLinks(false);
    if (!book) setChosenBook(null);
  };

  return (
    <form onSubmit={submit} className={compact ? 'space-y-2' : 'space-y-3 rounded-2xl border bg-card p-4 shadow-sm'}>
      <Label htmlFor={ids.body} className="sr-only">{compact ? 'Resposta' : 'Publicação'}</Label>
      <Textarea
        id={ids.body} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder}
        rows={compact ? 2 : 3} maxLength={MAX_BODY} className="resize-y"
      />

      {!compact && (
        <>
          {allowBook && <BookPicker value={chosenBook} onChange={setChosenBook} />}

          {showQuote && (
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-1.5">
                <Label htmlFor={ids.quote} className="text-xs">Citação do livro</Label>
                <Textarea id={ids.quote} value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} maxLength={MAX_QUOTE} placeholder="Copie a frase tal como está no livro" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.page} className="text-xs">Página</Label>
                <Input id={ids.page} value={quotePage} onChange={(e) => setQuotePage(e.target.value)} maxLength={40} placeholder="p. 45" />
              </div>
            </div>
          )}

          {showLinks && (
            <div className="space-y-2">
              <Label htmlFor={ids.link} className="text-xs">Link para uma leitura ou referência</Label>
              <div className="flex gap-2">
                <Input
                  id={ids.link} type="url" inputMode="url" value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
                  placeholder="https://…"
                />
                <Button type="button" variant="outline" onClick={addLink}>Acrescentar</Button>
              </div>
              {links.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {links.map((href) => (
                    <li key={href} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                      <Link2 className="h-3 w-3" aria-hidden="true" />{linkHost(href)}
                      <button type="button" aria-label={`Tirar ${linkHost(href)}`} onClick={() => setLinks((l) => l.filter((x) => x !== href))}><X className="h-3 w-3" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" aria-pressed={showQuote} onClick={() => setShowQuote((v) => !v)}>
              <Quote className="h-4 w-4" aria-hidden="true" /> Citação
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" aria-pressed={showLinks} onClick={() => setShowLinks((v) => !v)}>
              <Link2 className="h-4 w-4" aria-hidden="true" /> Link
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!compact && <p className="mr-auto text-xs text-muted-foreground">Fica público, com o nome do seu perfil.</p>}
        {onCancel && <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" size="sm" disabled={sending || !body.trim()}>
          {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
