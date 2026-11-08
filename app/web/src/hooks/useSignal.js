import { useEffect, useRef, useState } from 'react';
import { onSignalStatus, signalStatus, subscribeSignal } from '@/lib/realtimeSignals';

/**
 * Ouvir um tópico em tempo real (lib/realtimeSignals.js) e correr `callback` quando chega um sinal
 * dos `events` pedidos. Uma rajada de sinais (dez encomendas mudadas de uma vez) dá uma só chamada,
 * `debounceMs` depois do último.
 *
 * Devolve `true` com o canal ligado: os ecrãs usam-no para consultar menos vezes (de minuto a
 * minuto passa a de 5 em 5), porque já sabem na hora quando muda alguma coisa.
 */
export function useSignal(topic, events, callback, { enabled = true, debounceMs = 300, isPrivate = true } = {}) {
  const cb = useRef(callback);
  cb.current = callback;
  const eventsKey = events == null ? '*' : [].concat(events).join(',');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !topic) { setConnected(false); return undefined; }
    let timer = null;
    const off = subscribeSignal(topic, eventsKey === '*' ? null : eventsKey.split(','), (event, payload) => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current?.(event, payload), debounceMs);
    }, { isPrivate });
    setConnected(signalStatus(topic) === 'connected');
    const offStatus = onSignalStatus(topic, (status) => setConnected(status === 'connected'));
    return () => { clearTimeout(timer); offStatus(); off(); };
  }, [topic, eventsKey, enabled, debounceMs, isPrivate]);

  return connected;
}
