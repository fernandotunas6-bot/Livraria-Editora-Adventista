import { useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { useScrollMemory } from '@/hooks/useScrollMemory';

/**
 * Lista de livros que no telemóvel cresce ao deslizar e no desktop aparece inteira, como
 * sempre. Junta o que a loja já fazia: lotes (useInfiniteList), reinício quando os filtros
 * mudam (`resetKey`) e o lugar reposto ao voltar de um livro (useScrollMemory).
 */
export function useCatalogWindow({ items, ready, resetKey = '', batch = 24 }) {
  const isMobile = useIsMobile();
  const infinite = useInfiniteList({ total: items.length, batch, resetKey, enabled: isMobile && ready });
  const saved = useScrollMemory({ ready: ready && items.length > 0, snapshot: { count: infinite.count } });
  const { setCount } = infinite;

  useEffect(() => {
    if (ready && saved?.count) setCount(saved.count);
    // Só quando a lista fica pronta: é a reposição ao voltar atrás.
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isMobile,
    saved,
    infinite,
    visible: isMobile ? items.slice(0, infinite.count) : items,
  };
}
