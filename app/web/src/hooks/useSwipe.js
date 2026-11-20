// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useRef } from 'react';

// Deslizar com o dedo nos banners e destaques, como em qualquer loja no telemóvel: antes só
// os pontos (pequenos) e as setas (escondidas no telemóvel) mudavam de slide.
//
// Só conta um gesto mais horizontal do que vertical e com pelo menos `threshold` píxeis: quem
// está a descer a página não muda de slide sem querer. Devolve os handlers de toque para pôr
// no elemento do slider.

export function swipeDirection(start, end, threshold = 40) {
  if (!start || !end) return 0;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

export function useSwipe({ onNext, onPrev, threshold = 40 } = {}) {
  const start = useRef(null);
  return {
    onTouchStart: (e) => {
      const t = e.touches?.[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e) => {
      const t = e.changedTouches?.[0];
      const dir = swipeDirection(start.current, t ? { x: t.clientX, y: t.clientY } : null, threshold);
      start.current = null;
      if (dir > 0) onNext?.();
      else if (dir < 0) onPrev?.();
    },
  };
}
