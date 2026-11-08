import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { applyUpdate, takeUpdatedFrom } from '@/lib/appVersion';
import { hasUnseenRelease, latestPublishedRelease, markReleasesSeen, readSeenReleases } from '@/lib/appReleases';

/**
 * Avisos de versão da app, em todas as páginas:
 *
 * - há uma versão nova publicada: "Nova versão disponível — Actualizar" (fica até a pessoa
 *   escolher; fechar o aviso adia para a próxima vez que a app abrir);
 * - acabou de actualizar: "App actualizada", com "Ver novidades" se a equipa publicou novidades
 *   que a pessoa ainda não viu (painel → Versões da app).
 *
 * Os avisos (sonner) já sobem acima da barra de baixo do telemóvel e da barra de compra.
 */
export default function AppUpdateNotice() {
  const available = useAppUpdate();
  const navigate = useNavigate();

  useEffect(() => {
    if (!available) return;
    toast('Nova versão da app disponível', {
      id: 'nova-versao',
      description: 'Actualize para ter as últimas melhorias. O carrinho fica como está.',
      duration: Infinity,
      action: { label: 'Actualizar', onClick: () => { applyUpdate(); } },
    });
  }, [available]);

  useEffect(() => {
    const updated = !!takeUpdatedFrom();
    const seen = readSeenReleases();
    // Nada a dizer (não actualizou agora e já se sabe o que a pessoa viu): nem se pergunta.
    if (!updated && seen) return undefined;
    let stopped = false;
    (async () => {
      const latest = await latestPublishedRelease();
      if (stopped) return;
      // Primeira visita: o que já estava publicado não é novidade para ninguém.
      if (!seen) markReleasesSeen(latest?.published_at || new Date(0).toISOString());
      if (!updated) return;
      const fresh = !!seen && hasUnseenRelease(latest, seen);
      toast.success('App actualizada', {
        id: 'app-actualizada',
        description: fresh ? latest.title : 'Já tem a versão mais recente.',
        duration: fresh ? 10000 : 4000,
        action: fresh ? { label: 'Ver novidades', onClick: () => navigate('/novidades') } : undefined,
      });
    })();
    return () => { stopped = true; };
    // Só ao abrir a app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
