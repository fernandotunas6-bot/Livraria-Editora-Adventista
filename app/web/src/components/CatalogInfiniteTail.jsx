// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, BookOpen } from 'lucide-react';
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
        {/* Quanto já se viu, em barra: o indicador que girava sempre dizia "a carregar" mesmo
            parado — os livros já estão no browser, o lote seguinte aparece de imediato. */}
        <div className="w-40" aria-live="polite">
          <p className="mb-1.5 text-center text-xs text-muted-foreground">{shown} de {total} livros</p>
          <div
            className="h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Livros vistos"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={shown}
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-base" style={{ width: `${Math.round((shown / total) * 100)}%` }} />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-11 rounded-md px-6" onClick={loadMore}>
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
          <Button variant="outline" size="sm" className="h-10 rounded-md" onClick={onClearFilters}>Ver todos os livros</Button>
        )}
        <Button asChild variant="outline" size="sm" className="h-10 rounded-md">
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
