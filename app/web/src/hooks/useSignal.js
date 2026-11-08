import { useEffect, useRef, useState } from 'react';
import { onSignalStatus, signalStatus, subscribeSignal } from '@/lib/realtimeSignals';

/**
 * Ouvir um tópico em tempo real (lib/realtimeSignals.js) e correr `callback` quando chega um sinal
 * dos `events` pedidos. Uma rajada de sinais (dez encomendas mudadas de uma vez) dá uma só chamada,
 * `debounceMs` depois do último: `callback(event, payload, signals)`, com o último sinal e a lista
 * de todos os da rajada ({ event, payload }). Um ecrã que faz coisas diferentes por sinal olha
 * para a lista: uma encomenda nova manda «catalogo» (o stock desceu) e «orders» quase juntos, e
 * ficar só com o último perdia o outro.
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
    let burst = [];
    const off = subscribeSignal(topic, eventsKey === '*' ? null : eventsKey.split(','), (event, payload) => {
      burst.push({ event, payload });
      clearTimeout(timer);
      timer = setTimeout(() => {
        const signals = burst;
        burst = [];
        const last = signals[signals.length - 1];
        cb.current?.(last.event, last.payload, signals);
      }, debounceMs);
    }, { isPrivate });
    setConnected(signalStatus(topic) === 'connected');
    const offStatus = onSignalStatus(topic, (status) => setConnected(status === 'connected'));
    return () => { clearTimeout(timer); offStatus(); off(); };
  }, [topic, eventsKey, enabled, debounceMs, isPrivate]);

  return connected;
}
