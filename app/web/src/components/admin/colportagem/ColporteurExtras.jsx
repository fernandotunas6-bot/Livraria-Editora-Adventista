// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, EyeOff, Eye, Printer, RefreshCw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/admin/igreja/registryUi';
import {
  cardVerifyLink, colporteurCard, colporteurReviews, colporteurTopBooks, hideColporteurReview, ratingText,
} from '@/lib/colporteurApi';
import { cardHtml, openPrint } from '@/lib/colporteurPrint';

export const Estrelas = ({ value, size = 'h-4 w-4' }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} aria-hidden="true" />
    ))}
  </span>
);

/** Imprime o cartão (abre a janela de impressão). Devolve false se o browser a bloqueou. */
export function imprimirCartao(card) {
  return openPrint(cardHtml(card, { verifyUrl: cardVerifyLink(card) }));
}

/**
 * Na ficha do colportor (equipa): o cartão de identificação, as avaliações dos clientes (com
 * ocultar/mostrar) e os livros mais vendidos por ele, com a média de cada livro.
 */
export default function ColporteurExtras({ colporteur: c, run }) {
  const [reviews, setReviews] = useState(null);
  const [books, setBooks] = useState(null);
  const [hideFor, setHideFor] = useState(null);
  const [reason, setReason] = useState('');
  const [erro, setErro] = useState('');

  const load = useCallback(async () => {
    setErro('');
    try {
      const [r, b] = await Promise.all([colporteurReviews(c.id), colporteurTopBooks({ colporteurId: c.id })]);
      setReviews(r);
      setBooks(b || []);
    } catch (e) {
      setErro(e.message || 'Não foi possível ler as avaliações.');
    }
  }, [c.id]);
  useEffect(() => { load(); }, [load]);

  const card = (reissue) => run(async () => {
    const k = await colporteurCard(c.id, reissue);
    if (!imprimirCartao(k)) throw new Error('O browser bloqueou a janela de impressão. Permita janelas pop-up para este site.');
    return reissue ? `Cartão reemitido (código ${k.card_check}). O anterior deixou de ser válido.` : 'Cartão pronto a imprimir.';
  });

  const toggleHide = (r, hidden) => run(async () => {
    await hideColporteurReview(r.id, hidden, reason.trim());
    setHideFor(null);
    setReason('');
    await load();
  }, hidden ? 'Avaliação oculta.' : 'Avaliação visível outra vez.');

  const activo = c.status === 'activo' && c.code;
  return (
    <>
      {activo && (
        <section className="space-y-2 rounded-xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-semibold"><BadgeCheck className="h-4 w-4 text-primary" />Cartão de identificação</h3>
          <p className="text-sm text-muted-foreground">
            Frente e verso, do tamanho de um cartão bancário, com o código {c.code}, a categoria, a igreja e um QR que abre a verificação
            pública (só com o código de verificação do cartão; nunca mostra o telefone). Vale até 31 de Dezembro do ano em que é emitido.
          </p>
          {c.card_check ? (
            <p className="text-sm">Código de verificação: <span className="font-mono font-semibold tracking-wider">{String(c.card_check).replace(/(.{4})(.{4})/, '$1-$2')}</span>
              {c.card_issued_at && <span className="text-muted-foreground"> · emitido a {new Date(c.card_issued_at).toLocaleDateString('pt-AO')}</span>}</p>
          ) : <p className="text-sm text-muted-foreground">Ainda sem cartão: o primeiro «Imprimir» emite-o.</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => card(false)}><Printer className="mr-1.5 h-4 w-4" />Imprimir cartão</Button>
            {c.card_check && (
              <Button size="sm" variant="outline" onClick={() => { if (window.confirm('Reemitir o cartão? O código de verificação muda e o cartão impresso deixa de ser válido.')) card(true); }}>
                <RefreshCw className="mr-1.5 h-4 w-4" />Reemitir (perdido ou novo ano)
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2 rounded-xl border border-border p-4">
        <h3 className="flex flex-wrap items-center gap-2 font-semibold">
          Avaliações dos clientes
          {reviews && reviews.count > 0 && <span className="flex items-center gap-1 text-sm font-normal"><Estrelas value={reviews.avg} /> {ratingText(reviews.avg, reviews.count)}</span>}
        </h3>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!reviews && !erro && <p className="text-sm text-muted-foreground">A carregar…</p>}
        {reviews && !reviews.items.length && <p className="text-sm text-muted-foreground">Ainda sem avaliações. Os clientes avaliam depois de receberem a encomenda (entregue por ele ou comprada com o seu código).</p>}
        {reviews && reviews.items.length > 0 && (
          <ul className="space-y-2">
            {reviews.items.map((r) => (
              <li key={r.id} className={`rounded-lg border border-border p-3 text-sm ${r.hidden ? 'bg-muted/40 opacity-75' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><Estrelas value={r.rating} />
                    <span className="text-muted-foreground">{r.customer || 'Cliente'} · {r.order_number} · {r.kind === 'entrega' ? 'entrega' : 'venda com o código'} · {new Date(r.updated || r.created).toLocaleDateString('pt-AO')}</span>
                  </span>
                  {r.hidden ? <Pill tone="amber">oculta: {r.hidden_reason}</Pill> : null}
                </div>
                {r.comment && <p className="mt-1">{r.comment}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.hidden ? (
                    <Button size="sm" variant="ghost" onClick={() => toggleHide(r, false)}><Eye className="mr-1.5 h-4 w-4" />Mostrar</Button>
                  ) : hideFor === r.id ? (
                    <>
                      <Input className="h-8 w-auto flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Porque oculta (ex.: linguagem imprópria)" maxLength={300} />
                      <Button size="sm" variant="outline" disabled={reason.trim().length < 3} onClick={() => toggleHide(r, true)}>Ocultar</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setHideFor(null); setReason(''); }}>Cancelar</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setHideFor(r.id)}><EyeOff className="mr-1.5 h-4 w-4" />Ocultar</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {books && books.length > 0 && (
        <section className="space-y-2 rounded-xl border border-border p-4">
          <h3 className="font-semibold">Livros mais vendidos este ano</h3>
          <p className="text-sm text-muted-foreground">Relatórios validados e vendas no site com o código, com a média das avaliações de cada livro no site.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {books.map((b) => (
              <li key={b.book_id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                <span className="relative grid h-16 w-11 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                  {b.cover ? <img src={b.cover} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="px-1 text-center text-[9px] leading-tight text-muted-foreground">{b.title}</span>}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="line-clamp-2 font-medium">{b.title}</span>
                  <span className="block text-muted-foreground">{Number(b.qty).toLocaleString('pt-AO')} {Number(b.qty) === 1 ? 'unidade' : 'unidades'} · {ratingText(b.rating_avg, b.rating_count)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
