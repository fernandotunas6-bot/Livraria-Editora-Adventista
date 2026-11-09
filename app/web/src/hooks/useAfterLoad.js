import { useEffect, useState } from 'react';

/**
 * `true` depois de a página acabar de carregar e de o navegador ficar livre — ou, no máximo,
 * `maxWaitMs` depois do `load`. Para o que não faz falta no primeiro ecrã (o assistente):
 * num telemóvel em rede lenta, cada pedido e cada script que entra antes da primeira pintura
 * atrasa-a (auditoria visual: LCP de 4,3 a 6,1 s no perfil de telemóvel).
 */
export function useAfterLoad({ maxWaitMs = 3000 } = {}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    let idleId = null;
    let timer = null;
    const go = () => { if (!cancelled) setReady(true); };
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(go, { timeout: maxWaitMs });
      } else {
        timer = window.setTimeout(go, 200);
      }
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', schedule);
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [ready, maxWaitMs]);

  return ready;
}
