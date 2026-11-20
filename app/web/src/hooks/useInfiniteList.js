// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useRef, useState } from 'react';

/** Quantos mostrar a seguir: mais um lote, sem passar do total. */
export function nextCount(current, batch, total) {
  return Math.min(Math.max(current, 0) + Math.max(batch, 1), Math.max(total, 0));
}

/**
 * Lista que cresce sozinha quando o fim se aproxima (telemóvel).
 *
 * Os livros já estão no browser (o catálogo inteiro chega num pedido, com cache), por isso
 * "carregar mais" é desenhar mais cartões, não ir à rede: não há pedidos repetidos, nem
 * duplicados, nem ordem trocada entre lotes. O marcador no fim da lista é vigiado por um
 * IntersectionObserver com 600 px de antecedência, e o lote seguinte chega antes de o dedo
 * lá chegar. Mudar os filtros (`resetKey`) volta ao primeiro lote.
 *
 * Devolve `loadMore` para o botão "Mostrar mais", a alternativa para quem não usa o deslize
 * (teclado, leitor de ecrã) ou para quando o observador não existe.
 */
export function useInfiniteList({ total, batch = 24, resetKey = '', enabled = true, initialCount, rootMargin = '600px 0px' }) {
  const [count, setCount] = useState(() => Math.min(initialCount || batch, total || batch));
  const sentinelRef = useRef(null);
  const firstKey = useRef(true);

  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    setCount(batch);
  }, [resetKey, batch]);

  const loadMore = useCallback(() => setCount((c) => nextCount(c, batch, total)), [batch, total]);
  const hasMore = count < total;

  useEffect(() => {
    if (!enabled || !hasMore) return undefined;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, hasMore, loadMore, rootMargin, count]);

  return { count: Math.min(count, total), setCount, hasMore, loadMore, sentinelRef };
}
