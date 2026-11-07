import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Download, FileText, Loader2, Lock, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getDownloadUrl } from '@/lib/downloadsApi';
import { downloadAction, downloadKindLabel, formatFileSize, variantLabel } from '@/lib/downloads';

/**
 * Um material (PDF) com o botão certo para quem lê: descarregar, entrar ou comprar.
 * `compact` é a versão da ficha do produto (sem capa nem link para o produto); aí `product`
 * diz que variante dá acesso a um PDF pago.
 */
export default function DownloadItem({ item, product = null, compact = false }) {
  const { isAuthed } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const action = downloadAction(item, { isAuthed });
  const size = formatFileSize(item.file_size);

  const download = async () => {
    setBusy(true);
    try {
      const url = await getDownloadUrl(item);
      // O link traz Content-Disposition: attachment, por isso a página não muda.
      window.location.assign(url);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível descarregar', description: e.message });
    } finally {
      setBusy(false);
    }
  };

  const loginTo = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;

  return (
    <li className={`flex gap-3 rounded-xl border bg-card ${compact ? 'p-3' : 'p-4'}`}>
      {!compact && (
        item.cover ? (
          <img src={item.cover} alt="" loading="lazy" className="h-24 w-[4.5rem] shrink-0 rounded-md border object-cover" />
        ) : (
          <div className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-md border bg-muted/40" aria-hidden="true">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
        )
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{downloadKindLabel(item.kind)}</span>
          {item.edition && <span>{item.edition}</span>}
          <span className={item.access === 'paid' ? 'font-medium text-amber-700' : 'font-medium text-green-700'}>
            {item.access === 'paid' ? 'Para quem comprou' : 'Gratuito'}
          </span>
          {size && <span>· PDF {size}</span>}
        </div>
        <h3 className={`mt-1 font-semibold text-foreground ${compact ? 'text-sm' : 'text-lg'}`}>{item.title}</h3>
        {item.description && !compact && (
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{item.description}</p>
        )}
        {!compact && item.book_id && item.book_title && (
          <p className="mt-1 text-xs text-muted-foreground">
            Do produto <Link to={`/product/${item.book_id}`} className="text-primary hover:underline">{item.book_title}</Link>
          </p>
        )}
        <div className="mt-2">
          {action.kind === 'download' && (
            <Button size="sm" onClick={download} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              {action.label}
            </Button>
          )}
          {action.kind === 'login' && (
            <Button size="sm" variant="outline" asChild>
              <Link to={loginTo}><Lock className="mr-1.5 h-4 w-4" />{action.label}</Link>
            </Button>
          )}
          {action.kind === 'buy' && (compact ? (
            <p className="text-xs text-muted-foreground">
              <Lock className="mr-1 inline h-3.5 w-3.5" />
              {item.variant != null && product
                ? `Vem com a compra de "${variantLabel(product, item.variant)}", depois de paga.`
                : 'Vem com a compra deste produto, depois de paga.'}
            </p>
          ) : (
            <Button size="sm" variant="outline" asChild disabled={!item.book_id}>
              <Link to={`/product/${item.book_id}`}><ShoppingBag className="mr-1.5 h-4 w-4" />{action.label}</Link>
            </Button>
          ))}
        </div>
      </div>
    </li>
  );
}
