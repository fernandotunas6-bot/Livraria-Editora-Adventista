/**
 * Fichas de movimento, em JavaScript.
 *
 * O `index.css` já define `--motion-fast`, `--motion-base`, `--motion-slow` e `--ease-out`,
 * mas o framer-motion não lê variáveis CSS: precisa dos números. Este ficheiro é a mesma
 * tabela do outro lado da fronteira — mexer num sem mexer no outro é como voltámos a ter
 * onze durações diferentes para o mesmo gesto.
 *
 * Em segundos, que é a unidade do framer-motion; o CSS usa milissegundos.
 */
export const MOTION = {
  /** 140 ms — o que responde ao dedo: realces, trocas de estado, menus. */
  fast: 0.14,
  /** 220 ms — a transição corrente: entradas, modais, painéis, conteúdo. */
  base: 0.22,
  /** 420 ms — o que atravessa o ecrã: gavetas, carrosséis, mudanças de página. */
  slow: 0.42,
  /** A curva do sistema, igual a `--ease-out` no CSS. */
  ease: [0.22, 0.8, 0.3, 1],
  /**
   * A mola única, para o que desliza (gavetas, modais, cartões). Bem amortecida de
   * propósito: a oscilação chama a atenção para a animação, e o que queremos é que ela
   * passe despercebida.
   */
  spring: { type: 'spring', stiffness: 300, damping: 30 },
};

export default MOTION;
