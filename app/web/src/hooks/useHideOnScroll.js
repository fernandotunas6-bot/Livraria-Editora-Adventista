import { useEffect, useRef, useState } from 'react';

/** Pixels de deslocamento numa direcção antes de mudar de estado: um tremor do dedo não conta. */
export const HIDE_THRESHOLD = 12;
/** Perto do topo a barra fica sempre à vista. */
export const TOP_ZONE = 80;

/**
 * Decide se a barra deve estar escondida. Função pura, para se testar sem montar nada.
 *
 * Desce → esconde; sobe → mostra. Perto do topo, e no fim da página (onde já não há para
 * onde descer e a pessoa procura a navegação), fica à vista. `anchor` é a posição onde a
 * direcção actual começou: só muda de estado depois de andar `HIDE_THRESHOLD` a partir dela.
 */
export function nextHideState({ y, anchor, hidden, atBottom = false }) {
  if (y <= TOP_ZONE || atBottom) return { hidden: false, anchor: y };
  const delta = y - anchor;
  if (!hidden && delta > HIDE_THRESHOLD) return { hidden: true, anchor: y };
  if (hidden && delta < -HIDE_THRESHOLD) return { hidden: false, anchor: y };
  // Continua na mesma direcção: o ponto de partida acompanha, para a inversão contar dali.
  if ((hidden && delta > 0) || (!hidden && delta < 0)) return { hidden, anchor: y };
  return { hidden, anchor };
}

/**
 * `true` enquanto se desce a página, `false` ao subir. Para barras fixas que saem do caminho
 * para dar espaço ao conteúdo e voltam quando a pessoa sobe à procura delas.
 */
export function useHideOnScroll(enabled = true) {
  const [hidden, setHidden] = useState(false);
  const state = useRef({ hidden: false, anchor: 0 });

  useEffect(() => {
    if (!enabled) {
      state.current = { hidden: false, anchor: window.scrollY };
      setHidden(false);
      return undefined;
    }
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const atBottom = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
      const next = nextHideState({ y, atBottom, ...state.current });
      if (next.hidden !== state.current.hidden) setHidden(next.hidden);
      state.current = next;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    state.current = { hidden: false, anchor: window.scrollY };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return enabled && hidden;
}

export default useHideOnScroll;
