import { useCallback, useEffect, useState } from 'react';
import {
  abertaComoApp, foiInstaladaAgora, modoDeInstalacao, pedirInstalacao, subscreverInstalacao, temPedidoDeInstalacao,
} from '@/lib/pwaInstall';

function lerModo() {
  if (typeof window === 'undefined') return 'nenhuma';
  return modoDeInstalacao({
    ua: window.navigator?.userAgent || '',
    toques: window.navigator?.maxTouchPoints || 0,
    instalada: abertaComoApp(window) || foiInstaladaAgora(),
    temPedido: temPedidoDeInstalacao(),
  });
}

/**
 * Se e como se instala a app neste aparelho (lib/pwaInstall.js).
 * `instalar()` abre a janela do sistema quando o navegador a deu (`modo === 'pedido'`) e devolve
 * true; nos outros modos devolve false e quem chamou mostra os passos (InstalarAppDialog).
 */
export function useInstalarApp() {
  const [modo, setModo] = useState(lerModo);
  useEffect(() => {
    const actualizar = () => setModo(lerModo());
    actualizar();
    const off = subscreverInstalacao(actualizar);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', actualizar);
    return () => { off(); mq?.removeEventListener?.('change', actualizar); };
  }, []);

  const instalar = useCallback(async () => {
    if (!temPedidoDeInstalacao()) return false;
    await pedirInstalacao();
    return true;
  }, []);

  return { modo, instalar, visivel: modo !== 'instalada' && modo !== 'nenhuma' };
}
