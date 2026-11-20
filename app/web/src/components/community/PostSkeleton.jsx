// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Lugar das publicações enquanto chegam: a forma do cartão (autor, texto, acções), em vez de um
 * spinner num ecrã vazio. Numa rede lenta, quem abre a comunidade vê logo onde vai aparecer o
 * quê, e a página não salta quando as publicações chegam.
 */
export default function PostSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4" role="status" aria-label="A carregar publicações">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-editorial-filete bg-editorial-papel p-4 sm:p-5" aria-hidden="true">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-10 w-10 rounded-full bg-editorial-tela" />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-32 bg-editorial-tela" />
              <Skeleton className="h-3 w-16 bg-editorial-tela" />
            </div>
            <Skeleton className="ml-auto h-6 w-20 rounded-full bg-editorial-tela" />
          </div>
          <Skeleton className="h-3.5 w-full bg-editorial-tela" />
          <Skeleton className="h-3.5 w-11/12 bg-editorial-tela" />
          <Skeleton className={`h-3.5 bg-editorial-tela ${i % 2 ? 'w-2/3' : 'w-4/5'}`} />
          <div className="flex gap-3 border-t border-editorial-filete pt-3">
            <Skeleton className="h-8 w-14 bg-editorial-tela" />
            <Skeleton className="h-8 w-24 bg-editorial-tela" />
            <Skeleton className="h-8 w-24 bg-editorial-tela" />
          </div>
        </div>
      ))}
    </div>
  );
}
