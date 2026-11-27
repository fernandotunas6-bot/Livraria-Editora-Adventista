// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Um filtro em pílula: o mesmo nos géneros da Loja e nas províncias das Lojas (revisão do estilo de 27/11, escolha 5).
 * A pílula fica só para os filtros e as etiquetas; as acções usam os cantos dos campos (`rounded-md`, escolha 4).
 * O estado vai também no `aria-pressed`, para quem usa um leitor de ecrã.
 */
export function FilterChip({ active = false, className, children, ...props }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      aria-pressed={active}
      className={cn('h-10 shrink-0 rounded-full sm:h-8', active && 'btn-primary', className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export default FilterChip;
