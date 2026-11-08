import React, { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink, RefreshCw, Search, WifiOff } from 'lucide-react';
import { sinceLabel } from '@/hooks/useAutoRefresh';
import { cn } from '@/lib/utils';
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
/**
 * Estado da sincronização: "Actualizado há 2 min" (carregar actualiza já), a rodar enquanto
 * actualiza, e "Sem ligação" quando a rede cai — aí o que se gravar pode não chegar.
 */
function SyncStatus({ sync }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!sync) return null;
  if (!sync.online) {
    return (
      <span role="status" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-amber-500/15 px-3 text-xs font-medium text-amber-800 dark:text-amber-300">
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">Sem ligação</span><span className="sr-only sm:hidden">Sem ligação</span>
      </span>
    );
  }
  const label = sync.syncing ? 'A actualizar…' : sync.lastSync ? `Actualizado ${sinceLabel(sync.lastSync, now)}` : 'Actualizar';
  return (
    <Button
      type="button" variant="ghost" onClick={sync.refreshNow} disabled={sync.syncing}
      className="h-9 shrink-0 gap-1.5 px-2 text-xs font-normal text-muted-foreground"
      title="Actualizar agora (os dados actualizam-se sozinhos de minuto a minuto)"
      aria-label={`${label}. Actualizar agora`}
    >
      <RefreshCw className={cn('h-4 w-4', sync.syncing && 'animate-spin')} aria-hidden="true" />
      <span className="hidden xl:inline">{label}</span>
    </Button>
  );
}

export default function AdminTopBar({
  current, layout, showTrigger, showBrand, onOpenSearch, user, roleLabel, onLayoutChange, onProfile, onLogout, sync,
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
        <SyncStatus sync={sync} />
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
