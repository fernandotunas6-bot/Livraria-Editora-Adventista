import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { badgeLabel } from '@/lib/adminSections';

/**
 * Disposição "Barra lateral": todas as secções à esquerda, por grupos, com o número do que há a
 * tratar. Recolhe aos ícones (botão do topo, Ctrl+B ou a margem da barra), e aí os nomes passam
 * a dica e os números a um ponto. No telemóvel é a gaveta que abre do botão de menu — nas duas
 * disposições.
 */
export default function AdminSidebarNav({ nav, active, onNavigate, collapsible = 'icon' }) {
  const { isMobile, setOpenMobile, openMobile } = useSidebar();
  const navRef = useRef(null);

  // A secção aberta fica à vista na lista (Colportagem, Configurações… ficam lá em baixo).
  useEffect(() => {
    navRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, openMobile]);

  const go = (id) => {
    onNavigate(id);
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
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          isActive={isActive}
                          aria-current={isActive ? 'page' : undefined}
                          tooltip={item.badge ? `${item.label} · ${badgeLabel(item.badge)}` : item.label}
                          onClick={() => go(item.id)}
                          // 40 px na gaveta do telemóvel (toque), 32 px com rato.
                          className={cn('relative h-10 md:h-8', isActive && 'text-primary [&>svg]:text-primary')}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                          {/* Recolhida, o número vira um ponto no ícone. */}
                          {item.badge && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute right-1 top-1 hidden h-2 w-2 rounded-full group-data-[collapsible=icon]:block',
                                item.badge.tone === 'warning' ? 'bg-amber-500' : 'bg-primary',
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
