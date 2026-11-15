import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { REGRESSO_MS, applyUpdate, podeActualizarSozinha, takeUpdatedFrom } from '@/lib/appVersion';
import { haTrabalhoPorGravar } from '@/lib/unsavedWork';
import { hasUnseenRelease, latestPublishedRelease, markReleasesSeen, readSeenReleases } from '@/lib/appReleases';

/**
 * Avisos de versão da app, em todas as páginas:
 *
 * - há uma versão nova publicada: instala-se sozinha no próximo momento seguro — ao voltar à app
 *   ou ao mudar de página (lib/appVersion.js: podeActualizarSozinha). Até lá, o aviso "Nova
 *   versão disponível — Actualizar" deixa fazê-lo já;
 * - acabou de actualizar: "App actualizada", com "Ver novidades" se a equipa publicou novidades
 *   que a pessoa ainda não viu (painel → Versões da app).
 *
 * Os avisos (sonner) já sobem acima da barra de baixo do telemóvel e da barra de compra.
 */
export default function AppUpdateNotice() {
  const available = useAppUpdate();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const lugar = pathname + search;
  const lugarRef = useRef(lugar);
  lugarRef.current = lugar;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const availableRef = useRef(available);
  availableRef.current = available;
  // Onde se estava quando a versão nova apareceu, e quando se voltou à app pela última vez.
  const vistaEm = useRef(null);
  const regressoEm = useRef(0);
  const aActualizar = useRef(false);

  const actualizarSe = (momento) => {
    if (aActualizar.current) return true;
    if (!podeActualizarSozinha({ momento, pathname: pathRef.current, porGravar: haTrabalhoPorGravar() })) return false;
    aActualizar.current = true;
    applyUpdate();
    return true;
  };

  // Voltar à app: com uma versão nova já conhecida, instala-se já (se for seguro).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      regressoEm.current = Date.now();
      if (availableRef.current) actualizarSe('regresso');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!available) return;
    vistaEm.current = lugarRef.current;
    // Encontrada logo depois de voltar à app: instala-se já, antes de a pessoa começar.
    if (Date.now() - regressoEm.current < REGRESSO_MS && actualizarSe('regresso')) return;
    toast('Nova versão da app disponível', {
      id: 'nova-versao',
      description: 'Instala-se sozinha quando mudar de página ou voltar à app. O carrinho fica como está.',
      duration: Infinity,
      action: { label: 'Actualizar já', onClick: () => { applyUpdate(); } },
    });
  }, [available]);

  // Mudou de página depois de a versão nova aparecer: o recarregamento é a própria mudança.
  useEffect(() => {
    if (!available || vistaEm.current == null || vistaEm.current === lugar) return;
    actualizarSe('navegacao');
  }, [lugar, available]);

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
