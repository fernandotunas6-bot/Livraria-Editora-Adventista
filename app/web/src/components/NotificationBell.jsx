import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Headset, Loader2, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { relativeTime } from '@/lib/communityText';
import { cn } from '@/lib/utils';

/** Só caminhos do próprio site: um `href` estranho nunca vira link para fora. */
const safeHref = (href) => (typeof href === 'string' && /^\/(?!\/)/.test(href) ? href : '');

// O estado dos avisos é partilhado (um só pedido para os sinos, o perfil e a barra de baixo).
export { useNotifications };

/** Lista de avisos: usada no sino e no separador "Notificações" do perfil. */
export function NotificationList({ items, loading, onOpen, className }) {
  if (loading && items.length === 0) {
    return <div className="flex justify-center py-8" role="status" aria-label="A carregar avisos"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" /></div>;
  }
  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sem avisos por agora.</p>;
  }
  return (
    <ul className={cn('divide-y divide-border', className)}>
      {items.map((n) => {
        const Icon = n.kind === 'community' ? MessagesSquare : Headset;
        const href = safeHref(n.href);
        const content = (
          <>
            <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', n.read_at ? 'bg-muted text-muted-foreground' : 'bg-editorial-tela text-editorial-ouro-texto')}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm', n.read_at ? 'text-foreground/80' : 'font-semibold text-foreground')}>{n.title}</span>
              {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
              <span className="mt-1 block text-[11px] text-muted-foreground">{relativeTime(n.created_at)}</span>
            </span>
            {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-editorial-petroleo" aria-label="Por ler" />}
          </>
        );
        const cls = 'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none';
        return (
          <li key={n.id}>
            {href
              ? <Link to={href} className={cls} onClick={() => onOpen?.(n)}>{content}</Link>
              : <button type="button" className={cls} onClick={() => onOpen?.(n)}>{content}</button>}
          </li>
        );
      })}
    </ul>
  );
}

/** Sino do cabeçalho, só para quem tem sessão. */
export default function NotificationBell({ className }) {
  const { isAuthed } = useAuth();
  const [open, setOpen] = useState(false);
  const { items, loading, unread, refresh, markAll, markOne } = useNotifications({ enabled: isAuthed });

  if (!isAuthed) return null;
  const label = unread ? `Avisos, ${unread} por ler` : 'Avisos';

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) refresh(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative rounded-full', className)} aria-label={label}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1 text-[10px] font-bold text-white ring-2 ring-neutral-900" aria-hidden="true">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">Avisos</p>
          {unread > 0 && (
            <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs font-semibold text-editorial-petroleo hover:underline">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Marcar tudo como lido
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          <NotificationList items={items} loading={loading} onOpen={(n) => { if (!n.read_at) markOne(n.id); setOpen(false); }} />
        </div>
        <div className="border-t border-border px-4 py-2 text-center">
          <Link to="/profile?tab=notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-editorial-petroleo hover:underline">Ver todos e preferências</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
