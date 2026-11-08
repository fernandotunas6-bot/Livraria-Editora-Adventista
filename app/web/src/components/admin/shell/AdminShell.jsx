import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SidebarInset, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import AdminTopBar from '@/components/admin/shell/AdminTopBar';
import AdminTabsNav from '@/components/admin/shell/AdminTabsNav';
import AdminSidebarNav from '@/components/admin/shell/AdminSidebarNav';
import AdminSectionHeader from '@/components/admin/shell/AdminSectionHeader';
import AdminCommandPalette from '@/components/admin/shell/AdminCommandPalette';
import { AdminViewContext } from '@/components/admin/shell/AdminViewNav';
import { findSection, findView, withViewBadges } from '@/lib/adminSections';
import { parseRecent, pushRecentSection, readRecentSections } from '@/lib/adminSearch';

/**
 * A estrutura do painel, nas duas disposições (ver docs/PAINEL_ADMIN.md):
 *
 *   "tabs"    — barra do topo · grupos · secções do grupo · conteúdo (com a linha das vistas)
 *   "sidebar" — barra lateral (recolhível, com as vistas da secção aberta por baixo dela) |
 *               barra do topo · conteúdo
 *
 * No telemóvel (abaixo de 768 px) as duas usam a gaveta que abre do botão de menu, e os
 * separadores mostram só a linha das secções do grupo. O conteúdo de cada secção é o mesmo nas
 * duas: a disposição muda a navegação, não o que se faz em cada secção.
 *
 * Navegação por contexto: a secção aberta e a vista dela estão no endereço
 * (`?tab=colportagem&vista=contas`), no caminho do topo (Igreja › Colportagem › Contas), no
 * título da página e na navegação — e a navegação só mostra o que a pessoa pode abrir.
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
  nav: baseNav, active, view = null, viewExplicit = false, onNavigate, layout, onLayoutChange, user, roleLabel,
  onProfile, onLogout, alerts, actions, onSearchOrders, onSearchProducts, sync, findProduct, onEditProduct, children,
}) {
  const { isMobile, state: sidebarState } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);

  // Os números das vistas da secção aberta (candidaturas por decidir…), que só ela conhece.
  const [viewBadges, setViewBadges] = useState({});
  const reportBadges = useCallback((sectionId, badges) => {
    setViewBadges((prev) => {
      if (!badges) {
        if (!(sectionId in prev)) return prev;
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }
      if (JSON.stringify(prev[sectionId]) === JSON.stringify(badges)) return prev;
      return { ...prev, [sectionId]: badges };
    });
  }, []);
  const nav = useMemo(() => withViewBadges(baseNav, viewBadges), [baseNav, viewBadges]);

  const current = findSection(nav, active);
  const currentView = findView(current, view);
  const headingRef = useRef(null);
  const firstRender = useRef(true);
  const focusNext = useRef(false);

  // Navegar a partir da barra lateral, do caminho ou da procura leva o foco ao título; mudar de
  // vista na linha das vistas deixa-o onde está (para continuar com o teclado na linha).
  const go = useCallback((id, opts = {}) => {
    focusNext.current = opts.focus !== false;
    onNavigate(id, opts);
  }, [onNavigate]);

  // Ao mudar de secção: volta ao topo e o foco passa para o título da secção (não na primeira
  // pintura, para não roubar o foco a quem acabou de entrar). Ao mudar só de vista, o mesmo,
  // excepto quando a mudança veio da própria linha das vistas.
  const lastActive = useRef(active);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const sectionChanged = lastActive.current !== active;
    lastActive.current = active;
    if (sectionChanged || focusNext.current) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      headingRef.current?.focus({ preventScroll: true });
    }
    focusNext.current = false;
  }, [active, view]);

  // As secções abertas há pouco (por pessoa), para a procura vazia começar por elas. A que está
  // aberta não conta: já se está lá.
  const [recents, setRecents] = useState(() => readRecentSections(user?.id));
  const currentViewId = currentView?.id || null;
  useEffect(() => {
    if (active && active !== 'inicio') setRecents(pushRecentSection(user?.id, currentViewId ? `${active}:${currentViewId}` : active));
  }, [active, currentViewId, user?.id]);

  const sidebarLayout = layout === 'sidebar';
  const showSidebar = sidebarLayout || isMobile;
  // A linha das vistas dentro da secção: sempre, menos quando a barra lateral aberta já as mostra.
  const localNav = !(sidebarLayout && !isMobile && sidebarState === 'expanded');

  const viewState = useMemo(() => (current ? {
    sectionId: current.id,
    sectionLabel: current.label,
    views: current.views,
    view: currentView?.id || null,
    explicit: !!viewExplicit && !!currentView,
    setView: (id, opts = {}) => go(current.id, { focus: false, ...opts, view: id }),
    reportBadges,
    localNav,
  } : null), [current, currentView, viewExplicit, go, reportBadges, localNav]);

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
          nav={nav} active={active} view={currentView?.id || null} onNavigate={go}
          collapsible={sidebarLayout ? 'icon' : 'offcanvas'}
        />
      )}
      <SidebarInset className="min-w-0 bg-muted/30">
        <AdminTopBar
          current={current}
          currentView={currentView}
          onNavigate={go}
          layout={layout}
          showTrigger={sidebarLayout || isMobile}
          showBrand={!sidebarLayout || isMobile}
          onOpenSearch={() => setSearchOpen(true)}
          sync={sync}
          user={user} roleLabel={roleLabel}
          onLayoutChange={onLayoutChange} onProfile={onProfile} onLogout={onLogout}
        />
        {!sidebarLayout && <AdminTabsNav nav={nav} active={active} onNavigate={go} compact={isMobile} />}
        {/* Alertas da equipa (encomendas novas, segurança) em largura inteira, por baixo da
            navegação. A faixa vem colada ao topo (sticky) do desenho antigo; aqui desloca-se com
            a página, para não tapar a barra do topo. */}
        {alerts && <div className="[&>div]:static">{alerts}</div>}
        <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
          <div className="pt-2">
            <AdminSectionHeader ref={headingRef} section={current} view={currentView} actions={actions} />
            <div id="conteudo-painel" tabIndex={-1} className="focus:outline-hidden">
              <AdminViewContext.Provider value={viewState}>
                {children}
              </AdminViewContext.Provider>
            </div>
          </div>
        </div>
      </SidebarInset>
      <AdminCommandPalette
        open={searchOpen} onOpenChange={setSearchOpen}
        nav={nav} onNavigate={go}
        onSearchOrders={onSearchOrders} onSearchProducts={onSearchProducts}
        recents={recents.filter((id) => parseRecent(id).section !== active)}
        findProduct={findProduct} onEditProduct={onEditProduct}
      />
    </>
  );
}
