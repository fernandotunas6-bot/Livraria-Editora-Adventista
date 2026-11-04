import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Fim de uma lista que cresce sozinha (telemóvel).
 *
 * Enquanto há mais livros: o marcador que o IntersectionObserver vigia, e um botão "Mostrar
 * mais" para quem não desliza (teclado, leitor de ecrã, observador indisponível). Quando
 * acabam: diz que acabaram — o catálogo não finge ser infinito — e oferece outros caminhos.
 */
export default function CatalogInfiniteTail({ sentinelRef, hasMore, loadMore, shown, total, onClearFilters }) {
  if (total === 0) return null;

  if (hasMore) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3">
        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {shown} de {total} livros
        </p>
        <Button variant="outline" size="sm" className="h-11 rounded-full px-6" onClick={loadMore}>
          Mostrar mais livros
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-2xl border border-border bg-muted/30 px-4 py-6 text-center" role="status">
      <BookOpen className="mx-auto mb-2 h-6 w-6 text-primary" aria-hidden="true" />
      <p className="text-sm font-medium">
        {total === 1 ? 'Viu o único livro desta selecção.' : `Viu os ${total} livros desta selecção.`}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onClearFilters && (
          <Button variant="outline" size="sm" className="h-10 rounded-full" onClick={onClearFilters}>Ver todos os livros</Button>
        )}
        <Button asChild variant="outline" size="sm" className="h-10 rounded-full">
          <Link to="/colecoes">Explorar coleções</Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 rounded-full"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <ArrowUp className="mr-1 h-4 w-4" aria-hidden="true" /> Voltar ao topo
        </Button>
      </div>
    </div>
  );
}
