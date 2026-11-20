// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useEffect, useState } from 'react';
import {
  CHECK_INTERVAL_MS, FIRST_CHECK_MS, fetchPublishedVersion, isNewerVersion, shouldCheckNow,
} from '@/lib/appVersion';

/**
 * A versão nova publicada, quando há (lib/appVersion.js); `''` enquanto a que corre é a actual.
 *
 * Verifica ao abrir (passados uns segundos), ao voltar à app (no telemóvel é o momento em que
 * importa: a app fica dias em segundo plano), quando a rede volta, e de 30 em 30 minutos com a
 * app à vista. Nunca com a app escondida nem sem rede, e no máximo uma vez por minuto.
 */
export function useAppUpdate({ enabled = !import.meta.env.DEV, fetchVersion = fetchPublishedVersion } = {}) {
  const [available, setAvailable] = useState('');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    let last = 0;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState === 'hidden' || navigator.onLine === false) return;
      if (!shouldCheckNow(Date.now(), last)) return;
      last = Date.now();
      const published = await fetchVersion();
      if (!stopped && isNewerVersion(published)) setAvailable(published);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const first = setTimeout(check, FIRST_CHECK_MS);
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, [enabled, fetchVersion]);

  return available;
}
