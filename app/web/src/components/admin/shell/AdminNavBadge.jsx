// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { cn } from '@/lib/utils';
import { badgeLabel } from '@/lib/adminSections';

/** O número de uma secção (encomendas por tratar, stock baixo…). Laranja quando é alerta. */
export default function AdminNavBadge({ badge, className }) {
  if (!badge) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
        badge.tone === 'warning' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-primary/10 text-primary',
        className,
      )}
    >
      {badge.count > 99 ? '99+' : badge.count}
      <span className="sr-only"> ({badgeLabel(badge)})</span>
    </span>
  );
}
