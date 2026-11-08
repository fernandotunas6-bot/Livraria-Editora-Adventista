import React from 'react';
import { ChevronRight, ExternalLink, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import BrandLogo from '@/components/BrandLogo';
import AdminUserMenu from '@/components/admin/shell/AdminUserMenu';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/**
 * Barra do topo do painel (as duas disposições): menu (barra lateral, ou a gaveta no telemóvel),
 * onde se está (grupo › secção), procurar (Ctrl+K), ver a loja e a conta.
 */
export default function AdminTopBar({
  current, layout, showTrigger, showBrand, onOpenSearch, user, roleLabel, onLayoutChange, onProfile, onLogout,
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-4 lg:px-6">
      {showTrigger && <SidebarTrigger className="h-9 w-9 shrink-0" title="Mostrar ou esconder o menu (Ctrl+B)" />}
      {showBrand && (
        <div className="flex shrink-0 items-center gap-2">
          <BrandLogo variant="icon" linkTo="/admin" className="h-8 w-8 sm:h-8 sm:w-8" />
          <span className="hidden text-sm font-semibold text-foreground sm:inline">Painel</span>
        </div>
      )}
      {showBrand && <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />}

      {/* Onde se está. No telemóvel só a secção (o grupo já está na gaveta). */}
      <nav aria-label="Localização" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1 text-sm">
          {current?.groupLabel && (
            <>
              <li className="hidden shrink-0 text-muted-foreground md:block">{current.groupLabel}</li>
              <li className="hidden shrink-0 text-muted-foreground/60 md:block" aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            </>
          )}
          <li className="min-w-0 truncate font-medium text-foreground" aria-current="page">{current?.label || 'Painel'}</li>
        </ol>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button" variant="outline" onClick={onOpenSearch}
          className="h-9 w-9 justify-center gap-2 px-0 text-muted-foreground sm:w-64 sm:justify-start sm:px-3"
          aria-label="Procurar no painel"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden truncate text-sm font-normal sm:inline">Procurar secção, encomenda…</span>
          <Kbd className="ml-auto hidden sm:inline-flex">{isMac() ? '⌘' : 'Ctrl'} K</Kbd>
        </Button>
        <Button asChild variant="ghost" size="icon" className="hidden h-9 w-9 sm:inline-flex" title="Ver a loja (abre noutro separador)">
          <a href="/" target="_blank" rel="noopener noreferrer" aria-label="Ver a loja (abre noutro separador)">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
        <AdminUserMenu
          user={user} roleLabel={roleLabel} layout={layout}
          onLayoutChange={onLayoutChange} onProfile={onProfile} onLogout={onLogout}
        />
      </div>
    </header>
  );
}
