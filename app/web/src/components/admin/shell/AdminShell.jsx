import React, { useEffect, useRef, useState } from 'react';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import AdminTopBar from '@/components/admin/shell/AdminTopBar';
import AdminTabsNav from '@/components/admin/shell/AdminTabsNav';
import AdminSidebarNav from '@/components/admin/shell/AdminSidebarNav';
import AdminSectionHeader from '@/components/admin/shell/AdminSectionHeader';
import AdminCommandPalette from '@/components/admin/shell/AdminCommandPalette';
import { findSection } from '@/lib/adminSections';
import { pushRecentSection, readRecentSections } from '@/lib/adminSearch';

/**
 * A estrutura do painel, nas duas disposições (ver docs/PAINEL_ADMIN.md):
 *
 *   "tabs"    — barra do topo · grupos · secções do grupo · conteúdo
 *   "sidebar" — barra lateral (recolhível) | barra do topo · conteúdo
 *
 * No telemóvel (abaixo de 768 px) as duas usam a gaveta que abre do botão de menu, e os
 * separadores mostram só a linha das secções do grupo. O conteúdo de cada secção é o mesmo nas
 * duas: a disposição muda a navegação, não o que se faz em cada secção.
 */
export default function AdminShell(props) {
  const { sidebarOpen, onSidebarOpenChange } = props;
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={onSidebarOpenChange} className="bg-muted/30">
      <ShellBody {...props} />
    </SidebarProvider>
  );
}

function ShellBody({
  nav, active, onNavigate, layout, onLayoutChange, user, roleLabel, onProfile, onLogout,
  alerts, actions, onSearchOrders, onSearchProducts, sync, findProduct, onEditProduct, children,
}) {
  const { isMobile } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);
  const current = findSection(nav, active);
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  // Ao mudar de secção: volta ao topo e o foco passa para o título da secção (não na primeira
  // pintura, para não roubar o foco a quem acabou de entrar).
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo({ top: 0, behavior: 'instant' });
    headingRef.current?.focus({ preventScroll: true });
  }, [active]);

  // As secções abertas há pouco (por pessoa), para a procura vazia começar por elas. A que está
  // aberta não conta: já se está lá.
  const [recents, setRecents] = useState(() => readRecentSections(user?.id));
  useEffect(() => {
    if (active && active !== 'inicio') setRecents(pushRecentSection(user?.id, active));
  }, [active, user?.id]);

  const sidebarLayout = layout === 'sidebar';
  const showSidebar = sidebarLayout || isMobile;

  return (
    <>
      <a
        href="#conteudo-painel"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Saltar para o conteúdo
      </a>
      {showSidebar && (
        <AdminSidebarNav
          nav={nav} active={active} onNavigate={onNavigate}
          collapsible={sidebarLayout ? 'icon' : 'offcanvas'}
        />
      )}
      <SidebarInset className="min-w-0 bg-muted/30">
        <AdminTopBar
          current={current}
          layout={layout}
          showTrigger={sidebarLayout || isMobile}
          showBrand={!sidebarLayout || isMobile}
          onOpenSearch={() => setSearchOpen(true)}
          sync={sync}
          user={user} roleLabel={roleLabel}
          onLayoutChange={onLayoutChange} onProfile={onProfile} onLogout={onLogout}
        />
        {!sidebarLayout && <AdminTabsNav nav={nav} active={active} onNavigate={onNavigate} compact={isMobile} />}
        {/* Alertas da equipa (encomendas novas, segurança) em largura inteira, por baixo da
            navegação. A faixa vem colada ao topo (sticky) do desenho antigo; aqui desloca-se com
            a página, para não tapar a barra do topo. */}
        {alerts && <div className="[&>div]:static">{alerts}</div>}
        <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
          <div className="pt-2">
            <AdminSectionHeader ref={headingRef} section={current} actions={actions} />
            <div id="conteudo-painel" tabIndex={-1} className="focus:outline-none">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
      <AdminCommandPalette
        open={searchOpen} onOpenChange={setSearchOpen}
        nav={nav} onNavigate={onNavigate}
        onSearchOrders={onSearchOrders} onSearchProducts={onSearchProducts}
        recents={recents.filter((id) => id !== active)}
        findProduct={findProduct} onEditProduct={onEditProduct}
      />
    </>
  );
}
