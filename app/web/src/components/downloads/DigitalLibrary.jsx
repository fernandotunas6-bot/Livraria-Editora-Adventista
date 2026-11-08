import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Download, ExternalLink, FileText, Loader2, MessageCircle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getDownloadUrl } from '@/lib/downloadsApi';
import { downloadKindLabel, formatFileSize } from '@/lib/downloads';
import {
  TONE_CLASS, digitalState, downloadsLabel, inlinePdfSupported, libraryActions, libraryHint, loadMyLibrary,
} from '@/lib/digitalLibrary';
import { cn } from '@/lib/utils';

const dateOnly = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-AO');
};

/** Um livro da biblioteca: o estado ligado ao pagamento e o botão certo. */
function LibraryItem({ item, onOpened }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const state = digitalState(item.state);
  const actions = libraryActions(item, { inlinePdf: inlinePdfSupported() });
  const hint = libraryHint(item);
  const size = formatFileSize(item.file_size);

  const open = async (mode) => {
    // "Abrir" mostra o PDF num separador novo. A janela abre já, no toque: o Safari bloqueia as que
    // se abrem depois de esperar pela rede.
    const win = mode === 'open' ? window.open('', '_blank') : null;
    setBusy(mode);
    try {
      const url = await getDownloadUrl(item, { mode });
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        // O link traz Content-Disposition: attachment, por isso a página não muda.
        window.location.assign(url);
      }
      onOpened?.();
    } catch (e) {
      win?.close();
      toast({ variant: 'destructive', title: 'Não foi possível abrir', description: e.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <li className="flex gap-3 rounded-xl border bg-card p-3 sm:p-4" data-livro-digital={item.state}>
      {item.cover ? (
        <img src={item.cover} alt="" loading="lazy" className="h-28 w-20 shrink-0 rounded-md border object-cover" />
      ) : (
        <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-md border bg-muted/40" aria-hidden="true">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', TONE_CLASS[state.tone])}>{state.label}</span>
          <span className="text-muted-foreground">{downloadKindLabel(item.kind)}{item.edition ? ` · ${item.edition}` : ''}{size ? ` · PDF ${size}` : ''}</span>
        </div>
        <h3 className="mt-1 font-semibold leading-snug text-foreground">{item.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Encomenda {item.order_number || '—'}{item.ordered_at ? ` · ${dateOnly(item.ordered_at)}` : ''}
          {item.state === 'open' ? ` · ${downloadsLabel(item.downloads, item.last_download)}` : ''}
        </p>
        {hint && <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.includes('open') && (
            <Button size="sm" onClick={() => open('open')} disabled={!!busy}>
              {busy === 'open' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              Abrir
            </Button>
          )}
          {actions.includes('download') && (
            <Button size="sm" variant={actions.includes('open') ? 'outline' : 'default'} onClick={() => open('download')} disabled={!!busy}>
              {busy === 'download' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              Descarregar
            </Button>
          )}
          {actions.includes('pay') && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/profile?tab=orders"><Wallet className="mr-1.5 h-4 w-4" aria-hidden="true" />Ver a encomenda e pagar</Link>
            </Button>
          )}
          {actions.includes('contact') && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/contact"><MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />Falar connosco</Link>
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Perfil → Biblioteca: os livros digitais que a conta comprou, com o estado de cada um. Abrem
 * quando a encomenda está paga (regra na base de dados: migração livros_digitais); até lá a pessoa
 * vê o que falta e o caminho para pagar.
 */
export default function DigitalLibrary({ userId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    let alive = true;
    loadMyLibrary()
      .then((rows) => { if (alive) { setItems(rows); setError(''); } })
      .catch((e) => { if (alive) { setItems([]); setError(e.message); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => load(), [load, userId]);

  if (items === null) {
    return <div className="flex justify-center py-16" role="status" aria-label="A abrir a biblioteca"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" /></div>;
  }

  const ready = items.filter((i) => i.state === 'open');
  const waiting = items.filter((i) => i.state !== 'open');

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium text-foreground">Ainda não tem livros digitais.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando comprar a edição digital de um livro, ela aparece aqui e abre assim que o pagamento for confirmado.
          </p>
        </div>
      ) : (
        <>
          {ready.length > 0 && (
            <section aria-labelledby="biblioteca-disponiveis" className="space-y-2">
              <h3 id="biblioteca-disponiveis" className="text-sm font-semibold text-foreground">Disponíveis ({ready.length})</h3>
              <ul className="grid gap-3 lg:grid-cols-2">
                {ready.map((item) => <LibraryItem key={item.download_id} item={item} onOpened={load} />)}
              </ul>
            </section>
          )}
          {waiting.length > 0 && (
            <section aria-labelledby="biblioteca-a-espera" className="space-y-2">
              <h3 id="biblioteca-a-espera" className="text-sm font-semibold text-foreground">À espera do pagamento ou fechados ({waiting.length})</h3>
              <ul className="grid gap-3 lg:grid-cols-2">
                {waiting.map((item) => <LibraryItem key={item.download_id} item={item} />)}
              </ul>
            </section>
          )}
        </>
      )}
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Os materiais gratuitos estão em <Link to="/materiais" className="text-primary hover:underline">Materiais</Link>.
      </p>
    </div>
  );
}
