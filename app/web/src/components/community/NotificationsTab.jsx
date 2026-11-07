import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, MessagesSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { NotificationList, useNotifications } from '@/components/NotificationBell.jsx';
import { loadCommunityNotify, setCommunityNotify } from '@/lib/communityApi';

/** Separador "Notificações" do perfil: todos os avisos e o interruptor dos da comunidade. */
export default function NotificationsTab({ userId }) {
  const { items, loading, unread, markAll, markOne } = useNotifications({ enabled: !!userId, limit: 50 });
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    loadCommunityNotify(userId).then(setNotify).catch(() => {});
  }, [userId]);

  const toggle = async (on) => {
    setSaving(true); setError(''); setNotify(on);
    try { await setCommunityNotify(userId, on); } catch { setNotify(!on); setError('Não foi possível guardar. Tente de novo.'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold"><MessagesSquare className="h-5 w-5 text-primary" aria-hidden="true" /> Comunidade</h3>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <p id="notify-community-label" className="text-sm font-medium">Avisar-me de respostas e gostos</p>
            <p className="text-xs text-muted-foreground">Quando alguém responde ou gosta das suas publicações. Os gostos chegam agrupados.</p>
          </div>
          <Switch checked={notify} disabled={saving} onCheckedChange={toggle} aria-labelledby="notify-community-label" />
        </div>
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 font-bold"><Bell className="h-5 w-5 text-primary" aria-hidden="true" /> Avisos</h3>
          {unread > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={markAll}>
              <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" /> Marcar tudo como lido
            </Button>
          )}
        </div>
        <NotificationList items={items} loading={loading} onOpen={(n) => { if (!n.read_at) markOne(n.id); }} />
      </div>
    </div>
  );
}
