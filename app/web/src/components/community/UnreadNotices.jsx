// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { NotificationList, useNotifications } from '@/components/NotificationBell.jsx';

const SHOWN = 3;

/**
 * No topo do feed, as respostas e gostos por ler (os mesmos avisos do sino, sem outro pedido).
 * O número na barra de baixo traz aqui; tocar num abre a conversa e marca-o como lido.
 */
export default function UnreadNotices() {
  const isAuthed = !!useAuth()?.isAuthed;
  const { items, markOne } = useNotifications({ enabled: isAuthed });
  const unread = items.filter((n) => !n.read_at && n.kind === 'community');
  if (!unread.length) return null;

  return (
    <section aria-labelledby="comunidade-por-ler" className="overflow-hidden rounded-2xl border border-editorial-filete bg-editorial-papel">
      <div className="flex items-center justify-between gap-2 border-b border-editorial-filete px-4 py-2.5">
        <h2 id="comunidade-por-ler" className="flex items-center gap-2 text-sm font-semibold text-editorial-tinta">
          <Bell className="h-4 w-4 text-editorial-ouro" aria-hidden="true" />
          {unread.length === 1 ? 'Uma novidade nas suas conversas' : `${unread.length} novidades nas suas conversas`}
        </h2>
        <Link to="/profile?tab=notifications" className="inline-flex min-h-10 items-center text-xs font-semibold text-editorial-petroleo hover:underline">
          Ver todos
        </Link>
      </div>
      <NotificationList items={unread.slice(0, SHOWN)} loading={false} onOpen={(n) => markOne(n.id)} />
    </section>
  );
}
