// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useCallback, useEffect, useRef, useState } from 'react';

// Manter os dados de um ecrã em dia sozinhos, sem recarregar a página: de `intervalMs` em
// `intervalMs` com a página à vista, ao voltar ao separador (se passaram mais de 15 s) e quando a
// rede volta. Sem rede, não tenta (e diz que não há rede, para o ecrã o mostrar).
//
// Um pedido de cada vez: se o anterior ainda não acabou, o seguinte não sai.

const STALE_ON_RETURN_MS = 15_000;

export function useAutoRefresh(refresh, { intervalMs = 60_000, enabled = true } = {}) {
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const busy = useRef(false);
  const last = useRef(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      await refreshRef.current();
      last.current = Date.now();
      setLastSync(last.current);
    } catch {
      // fica a hora da última que correu bem; a próxima volta tenta outra vez
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, []);

  // A primeira carga é de quem chama; daqui conta-se a partir de agora.
  const markSynced = useCallback(() => {
    last.current = Date.now();
    setLastSync(last.current);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const visible = () => document.visibilityState === 'visible';
    const tick = () => { if (visible() && navigator.onLine !== false) run(); };
    const onReturn = () => {
      if (visible() && navigator.onLine !== false && Date.now() - last.current > STALE_ON_RETURN_MS) run();
    };
    const onOnline = () => { setOnline(true); run(); };
    const onOffline = () => setOnline(false);
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, intervalMs, run]);

  return { lastSync, syncing, online, refreshNow: run, markSynced };
}

/** "agora", "há 3 min", "há 2 h": quanto tempo passou desde `ts`. */
export function sinceLabel(ts, now = Date.now()) {
  if (ts == null) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'agora';
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  return `há ${Math.round(min / 60)} h`;
}
