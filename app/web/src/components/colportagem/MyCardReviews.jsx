// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { BadgeCheck, Printer, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { colporteurCard, colporteurReviews, colporteurTopBooks, ratingText } from '@/lib/colporteurApi';
import { imprimirCartao, Estrelas } from '@/components/admin/colportagem/ColporteurExtras';

/**
 * Na área do colportor: o seu cartão de identificação (para imprimir) e as avaliações que os
 * clientes lhe deram (a média e os comentários, sem saber quem os escreveu), mais os livros que
 * mais vendeu este ano.
 */
export default function MyCardReviews({ me }) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState(null);
  const [books, setBooks] = useState([]);
  const [busy, setBusy] = useState(false);
  const activo = me.status === 'activo' && me.code;

  useEffect(() => {
    let vivo = true;
    colporteurReviews().then((r) => { if (vivo) setReviews(r); }).catch(() => { if (vivo) setReviews({ avg: null, count: 0, items: [] }); });
    if (me.id) colporteurTopBooks({ colporteurId: me.id }).then((b) => { if (vivo) setBooks(b || []); }).catch(() => {});
    return () => { vivo = false; };
  }, [me.id]);

  const imprimir = async () => {
    setBusy(true);
    try {
      const card = await colporteurCard();
      if (!imprimirCartao(card)) throw new Error('O browser bloqueou a janela de impressão. Permita janelas pop-up para este site.');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Não foi possível abrir o cartão', description: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {activo && (
        <div className="rounded-2xl border border-border p-5">
          <h3 className="mb-2 flex items-center gap-2 font-semibold"><BadgeCheck className="h-4 w-4" />O meu cartão</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            O cartão de identificação, com o seu código, a categoria, a igreja e um QR que qualquer pessoa pode usar para confirmar que é colportor
            da Livraria. Imprima, recorte e plastifique. Se o perder, peça à equipa um novo: o antigo deixa de ser válido.
          </p>
          <Button size="sm" onClick={imprimir} disabled={busy}><Printer className="mr-1.5 h-4 w-4" />Imprimir o meu cartão</Button>
        </div>
      )}
      <div className="rounded-2xl border border-border p-5">
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><Star className="h-4 w-4" />Avaliações dos clientes</h3>
        {!reviews ? <p className="text-sm text-muted-foreground">A carregar…</p> : reviews.count ? (
          <>
            <p className="mb-2 flex items-center gap-2"><Estrelas value={reviews.avg} /><span className="font-semibold">{ratingText(reviews.avg, reviews.count)}</span></p>
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
              {reviews.items.filter((r) => r.comment).slice(0, 10).map((r, i) => (
                <li key={i} className="rounded-lg bg-muted/50 p-2"><Estrelas value={r.rating} size="h-3 w-3" /> <span className="ml-1">{r.comment}</span>
                  <span className="block text-xs text-muted-foreground">{r.kind === 'entrega' ? 'Entrega' : 'Venda com o seu código'} · {new Date(r.created).toLocaleDateString('pt-AO')}</span></li>
              ))}
            </ul>
          </>
        ) : <p className="text-sm text-muted-foreground">Ainda sem avaliações. Os clientes avaliam depois de receberem uma encomenda entregue por si ou comprada com o seu código.</p>}
      </div>
      {books.length > 0 && (
        <div className="rounded-2xl border border-border p-5 sm:col-span-2">
          <h3 className="mb-3 font-semibold">Os livros que mais vendeu este ano</h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {books.map((b) => (
              <li key={b.book_id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                <span className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                  {b.cover ? <img src={b.cover} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="line-clamp-2 font-medium">{b.title}</span>
                  <span className="block text-muted-foreground">{Number(b.qty).toLocaleString('pt-AO')} un. · {ratingText(b.rating_avg, b.rating_count)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
