// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ADMIN_SECTIONS, badgeLabel } from '@/lib/adminSections';

/**
 * As vistas de uma secção (Colportagem › Contas, Configurações › Envio…): qual está aberta, como
 * mudar, e a linha que as mostra dentro da secção.
 *
 * Dentro do painel, o invólucro (AdminShell) dá à secção aberta o `AdminViewContext`: a vista
 * vem do endereço (`vista`), só aparecem as vistas que a pessoa pode abrir, e a barra lateral
 * mostra-as por baixo da secção. Fora do painel (testes, uma secção solta) a secção guarda a vista
 * sozinha, com as vistas do registo.
 *
 * A linha das vistas (`AdminViewNav`) aparece onde a navegação ainda não as mostra: nos
 * separadores no topo, no telemóvel e com a barra lateral recolhida aos ícones. Com a barra
 * lateral aberta, as vistas já estão lá e a linha não se repete.
 */
export const AdminViewContext = createContext(null);

function registryViews(sectionId, perms) {
  return (ADMIN_SECTIONS[sectionId]?.views || [])
    .filter((v) => !v.allowed || !perms || v.allowed(perms))
    .map((v) => ({ id: v.id, label: v.label, icon: v.icon, group: v.group || '', description: v.description || '', badge: null }));
}

/**
 * A vista aberta numa secção: `{ view, setView, explicit, views, localNav, … }`.
 * `explicit`: a vista foi escolhida (está no endereço). Sem escolha, a secção pode preferir outra
 * para começar (a Colportagem abre nas candidaturas quando há alguma por decidir).
 * `perms` (de `adminPermissions`) só conta fora do painel, para esconder as vistas sem acesso.
 */
export function useSectionView(sectionId, { perms } = {}) {
  const ctx = useContext(AdminViewContext);
  const [local, setLocal] = useState(null);
  const inShell = !!ctx && ctx.sectionId === sectionId;
  const fallback = useMemo(() => registryViews(sectionId, perms), [sectionId, perms]);
  if (inShell) return ctx;
  const views = fallback;
  const view = local && views.some((v) => v.id === local) ? local : (views[0]?.id ?? null);
  return {
    sectionId,
    sectionLabel: ADMIN_SECTIONS[sectionId]?.label || '',
    views,
    view,
    explicit: local != null,
    setView: (id) => setLocal(id),
    reportBadges: null,
    localNav: true,
  };
}

/**
 * Dá ao painel os números das vistas ({ [vista]: { count, tone } }): `warning`/`info` pedem
 * acção e aparecem também na barra lateral; `count` é um total ("Igrejas (31)") e fica só aqui.
 */
export function useReportViewBadges(state, badges) {
  const key = JSON.stringify(badges || {});
  const report = state?.reportBadges;
  const sectionId = state?.sectionId;
  useEffect(() => {
    if (!report) return undefined;
    report(sectionId, JSON.parse(key));
    return () => report(sectionId, null);
  }, [report, sectionId, key]);
}

function ViewBadge({ badge, active }) {
  // Zero não pede acção nem é um total que valha a pena: sem número (como na barra lateral).
  if (!badge || !(Number(badge.count) > 0)) return null;
  if (badge.tone === 'count') {
    return (
      <span className={cn('tabular-nums', active ? 'text-muted-foreground' : 'text-muted-foreground/80')}>
        {' '}({badge.count})
      </span>
    );
  }
  return (
    <span
      className={cn(
        'ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-white',
        badge.tone === 'warning' ? 'bg-amber-500' : 'bg-primary',
      )}
    >
      {badge.count > 99 ? '99+' : badge.count}
      <span className="sr-only"> ({badgeLabel(badge)})</span>
    </span>
  );
}

/** Vistas seguidas com o mesmo `group` ficam juntas, sob o título do grupo. */
function groupViews(views) {
  const out = [];
  for (const v of views) {
    const last = out[out.length - 1];
    if (last && last.label === v.group) last.items.push(v);
    else out.push({ label: v.group, items: [v] });
  }
  return out;
}

/**
 * A linha das vistas, dentro da secção. `variant="tabs"` (a de omissão): uma fila, que no
 * telemóvel desliza na horizontal. `variant="aside"`: uma coluna com os grupos (Configurações).
 * `badges` junta-se aos números que a navegação já tem.
 */
export function AdminViewNav({ state, badges = {}, variant = 'tabs', className }) {
  const listRef = useRef(null);
  const active = state?.view;
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  if (!state?.localNav || !state.views || state.views.length < 2) return null;

  const label = `Vistas de ${state.sectionLabel || 'secção'}`;
  const badgeOf = (v) => badges[v.id] || v.badge || null;
  const button = (v, extra) => {
    const isActive = v.id === active;
    const Icon = v.icon;
    return (
      <button
        type="button"
        onClick={() => state.setView(v.id)}
        aria-current={isActive ? 'page' : undefined}
        title={v.description || undefined}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
          extra(isActive),
        )}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span>{v.label}</span>
        <ViewBadge badge={badgeOf(v)} active={isActive} />
      </button>
    );
  };

  if (variant === 'aside') {
    return (
      <nav aria-label={label} ref={listRef} className={cn('space-y-3 rounded-xl border border-border bg-background p-2 lg:sticky lg:top-24', className)}>
        {groupViews(state.views).map((group) => (
          <div key={group.label || group.items[0].id}>
            {group.label && <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</p>}
            <ul className="flex flex-row flex-wrap gap-0.5 lg:flex-col">
              {group.items.map((v) => (
                <li key={v.id}>
                  {button(v, (on) => cn('w-full justify-start px-2.5 py-2', on ? 'bg-marca/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'))}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={label} className={cn('mb-4', className)}>
      <ul ref={listRef} className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground scrollbar-none sm:w-fit sm:flex-wrap sm:overflow-visible">
        {state.views.map((v) => (
          <li key={v.id} className="shrink-0">
            {button(v, (on) => cn('h-8 px-3', on ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'))}
          </li>
        ))}
      </ul>
    </nav>
  );
}

const PanelContext = createContext(null);

/** O conteúdo das vistas: só a aberta é montada (o mesmo que os separadores faziam). */
export function ViewPanels({ value, className, children }) {
  return (
    <PanelContext.Provider value={value}>
      <div className={className}>{children}</div>
    </PanelContext.Provider>
  );
}

export function ViewPanel({ value, className, children }) {
  const current = useContext(PanelContext);
  if (current !== value) return null;
  return <div className={cn('mt-2', className)}>{children}</div>;
}
