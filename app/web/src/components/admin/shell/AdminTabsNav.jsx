import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import AdminNavBadge from '@/components/admin/shell/AdminNavBadge';

/**
 * Disposição "Separadores no topo" (a de sempre, arrumada): uma linha com os grupos (Catálogo,
 * Vendas, Relatórios…) e, por baixo, as secções do grupo aberto. Antes eram seis caixas com
 * todas as secções, que no computador ocupavam quatro linhas (~300 px) antes do conteúdo, e no
 * telemóvel o primeiro ecrã inteiro.
 *
 * Carregar num grupo abre a secção onde se estava nesse grupo da última vez (ou a primeira).
 * `compact`: no telemóvel só a linha das secções do grupo, a deslizar; o resto está na gaveta.
 */
export default function AdminTabsNav({ nav, active, onNavigate, compact = false }) {
  const activeGroup = nav.find((g) => g.items.some((i) => i.id === active)) || nav[0];
  const lastInGroup = useRef({});
  useEffect(() => {
    if (activeGroup) lastInGroup.current[activeGroup.id] = active;
  }, [active, activeGroup]);

  const openGroup = (group) => {
    const remembered = lastInGroup.current[group.id];
    const target = group.items.some((i) => i.id === remembered) ? remembered : group.items[0]?.id;
    if (target) onNavigate(target);
  };

  // A secção activa fica à vista na linha das secções (no telemóvel a linha desliza).
  const sectionsRef = useRef(null);
  useEffect(() => {
    sectionsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const groupTotal = (group) => group.items.reduce((n, i) => n + (i.badge?.count || 0), 0);
  const groupWarns = (group) => group.items.some((i) => i.badge?.tone === 'warning');
  const showSections = activeGroup && (activeGroup.items.length > 1 || activeGroup.label);

  return (
    <div className={cn('border-b border-border bg-background', compact && 'sticky top-14 z-20')}>
      {!compact && (
        <nav aria-label="Grupos do painel" className="px-3 sm:px-4 lg:px-6">
          <ul className="-mb-px flex gap-1 overflow-x-auto scrollbar-none">
            {nav.map((group) => {
              const isActive = group.id === activeGroup?.id;
              const total = groupTotal(group);
              return (
                <li key={group.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => openGroup(group)}
                    aria-current={isActive ? 'true' : undefined}
                    className={cn(
                      'inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                      isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                    )}
                  >
                    {group.label || group.items[0]?.label}
                    {total > 0 && <AdminNavBadge badge={{ count: total, tone: groupWarns(group) ? 'warning' : 'info' }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {showSections && (
        <nav
          aria-label={`Secções de ${activeGroup.label || 'Início'}`}
          className={cn('px-3 sm:px-4 lg:px-6', !compact && 'border-t border-border bg-muted/40')}
        >
          <ul ref={sectionsRef} className="flex gap-1.5 overflow-x-auto py-2 scrollbar-none">
            {activeGroup.items.map((item) => {
              const isActive = item.id === active;
              const Icon = item.icon;
              return (
                <li key={item.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                        : 'border-border bg-background text-foreground/80 hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                    {item.badge && <AdminNavBadge badge={item.badge} className={isActive ? 'bg-white/20 text-white' : undefined} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
