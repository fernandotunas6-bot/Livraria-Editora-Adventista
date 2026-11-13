import { useEffect, useState } from 'react';

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'];

/**
 * `true` quando a página já não precisa da rede só para si: ao primeiro gesto da pessoa (tocar,
 * carregar numa tecla, deslizar) ou, sem gesto nenhum, `delayMs` depois do `load`, quando o
 * navegador ficar livre. Para o que não faz falta no primeiro ecrã: o assistente, o painel do
 * carrinho, os métodos de pagamento do rodapé.
 *
 * Porquê tão tarde: numa loja que desenha depois de ler os dados, a imagem maior (o LCP) chega
 * muitas vezes depois do `load`. Carregar estas peças logo a seguir ao `load` melhorava a
 * primeira pintura mas punha-as a disputar a rede com essa imagem — a auditoria visual mostrou
 * o LCP do telemóvel igual ou pior. Depois do primeiro gesto, o LCP já não conta.
 */
export function useAfterLoad({ delayMs = 6000 } = {}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    let idleId = null;
    let timer = null;
    const go = () => { if (!cancelled) setReady(true); };
    const onInteraction = () => go();
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, onInteraction, { once: true, passive: true });
    }
    const afterDelay = () => {
      timer = window.setTimeout(() => {
        if (typeof window.requestIdleCallback === 'function') {
          idleId = window.requestIdleCallback(go, { timeout: 2000 });
        } else {
          go();
        }
      }, delayMs);
    };
    if (document.readyState === 'complete') afterDelay();
    else window.addEventListener('load', afterDelay, { once: true });
    return () => {
      cancelled = true;
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, onInteraction);
      window.removeEventListener('load', afterDelay);
      if (timer !== null) window.clearTimeout(timer);
      if (idleId !== null) window.cancelIdleCallback?.(idleId);
    };
  }, [ready, delayMs]);

  return ready;
}
