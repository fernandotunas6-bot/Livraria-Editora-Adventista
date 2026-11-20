// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ExternalLink } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton,
  SidebarMenuSubItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { badgeLabel } from '@/lib/adminSections';

/**
 * Disposição "Barra lateral": todas as secções à esquerda, por grupos, com o número do que há a
 * tratar. Recolhe aos ícones (botão do topo, Ctrl+B ou a margem da barra), e aí os nomes passam
 * a dica e os números a um ponto. No telemóvel é a gaveta que abre do botão de menu — nas duas
 * disposições.
 *
 * A secção aberta desdobra-se e mostra as suas vistas (Colportagem › Resumo, Candidaturas,
 * Contas…), com os números do que pedem acção; as outras secções continuam à vista. Recolhida aos
 * ícones, as vistas ficam na linha das vistas dentro da secção.
 */
export default function AdminSidebarNav({ nav, active, view = null, onNavigate, collapsible = 'icon' }) {
  const { isMobile, setOpenMobile, openMobile } = useSidebar();
  const navRef = useRef(null);

  // A secção aberta fica à vista na lista (Colportagem, Configurações… ficam lá em baixo) — e,
  // desdobrada, a vista aberta dela, que fica por baixo do nome.
  useEffect(() => {
    const el = navRef.current;
    const target = el?.querySelector('[data-sidebar="menu-sub-button"][data-active="true"]')
      || el?.querySelector('[data-sidebar="menu-button"][data-active="true"]');
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [active, view, openMobile]);

  const go = (id, opts) => {
    onNavigate(id, opts);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible={collapsible} aria-label="Menu do painel">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          to="/admin"
          className="flex h-10 items-center gap-2.5 rounded-md px-1.5 outline-hidden ring-sidebar-ring focus-visible:ring-2"
          onClick={(e) => { e.preventDefault(); go('inicio'); }}
        >
          <img src="/logo-icon.svg" alt="" className="h-8 w-8 shrink-0 object-contain" />
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">Painel</span>
            <span className="block truncate text-xs text-sidebar-foreground/80">Livraria Adventista</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Secções do painel" ref={navRef}>
          {nav.map((group) => (
            <SidebarGroup key={group.id} className="py-1.5">
              {group.label && <SidebarGroupLabel className="uppercase tracking-wider text-sidebar-foreground/80">{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = item.id === active;
                    const Icon = item.icon;
                    const hasViews = item.views?.length > 1;
                    const viewAlerts = (item.views || []).filter((v) => v.badge && v.badge.tone !== 'count');
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={isActive}
                          aria-current={isActive && !(hasViews && view) ? 'page' : undefined}
                          aria-expanded={hasViews ? isActive : undefined}
                          tooltip={item.badge ? `${item.label} · ${badgeLabel(item.badge)}` : item.label}
                          onClick={() => go(item.id)}
                          // 40 px na gaveta do telemóvel (toque), 32 px com rato.
                          className={cn('relative h-10 md:h-8', isActive && 'text-primary [&>svg]:text-primary')}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                          {hasViews && (
                            <ChevronRight
                              aria-hidden="true"
                              className={cn('ml-auto transition-transform duration-200 group-data-[collapsible=icon]:hidden', isActive && 'rotate-90', item.badge && 'mr-7')}
                            />
                          )}
                          {/* Recolhida, o número vira um ponto no ícone. */}
                          {(item.badge || (!isActive && viewAlerts.length > 0)) && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute right-1 top-1 hidden h-2 w-2 rounded-full group-data-[collapsible=icon]:block',
                                (item.badge?.tone || 'warning') === 'warning' ? 'bg-amber-500' : 'bg-primary',
                              )}
                            />
                          )}
                        </SidebarMenuButton>
                        {item.badge && (
                          <SidebarMenuBadge
                            className={cn(
                              'rounded-full',
                              item.badge.tone === 'warning' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-primary/10 text-primary',
                            )}
                          >
                            {item.badge.count > 99 ? '99+' : item.badge.count}
                            <span className="sr-only"> ({badgeLabel(item.badge)})</span>
                          </SidebarMenuBadge>
                        )}
                        {hasViews && isActive && (
                          <SidebarMenuSub aria-label={`Vistas de ${item.label}`}>
                            {item.views.map((v, i) => {
                              const viewActive = v.id === view;
                              const ViewIcon = v.icon;
                              const groupStart = v.group && v.group !== item.views[i - 1]?.group;
                              const alert = v.badge && v.badge.tone !== 'count' ? v.badge : null;
                              return (
                                <React.Fragment key={v.id}>
                                  {groupStart && (
                                    <li aria-hidden="true" className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                                      {v.group}
                                    </li>
                                  )}
                                  <SidebarMenuSubItem>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={viewActive}
                                      className={cn('h-9 md:h-7', viewActive && 'font-medium text-primary')}
                                    >
                                      <button
                                        type="button"
                                        aria-current={viewActive ? 'page' : undefined}
                                        title={v.description || undefined}
                                        onClick={() => go(item.id, { view: v.id })}
                                        className="w-full text-left"
                                      >
                                        {ViewIcon && <ViewIcon aria-hidden="true" className={viewActive ? 'text-primary!' : 'opacity-70'} />}
                                        <span className="flex-1 truncate">{v.label}</span>
                                        {alert && (
                                          <span
                                            className={cn(
                                              'ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                                              alert.tone === 'warning' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-primary/10 text-primary',
                                            )}
                                          >
                                            {alert.count > 99 ? '99+' : alert.count}
                                            <span className="sr-only"> ({badgeLabel(alert)})</span>
                                          </span>
                                        )}
                                      </button>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                </React.Fragment>
                              );
                            })}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>

      {/* Em baixo fica espaço para o botão do atendimento (canto inferior esquerdo, por cima da
          barra), que de outro modo tapava "Ver a loja". */}
      <SidebarFooter className="border-t border-sidebar-border pb-20">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Ver a loja">
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                <span>Ver a loja</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
