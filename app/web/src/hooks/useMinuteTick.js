// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useSyncExternalStore } from 'react';

// Um só relógio para a página toda: os tempos relativos ("há 3 min") avançam de minuto a minuto
// enquanto a comunidade está aberta. Antes ficavam parados no valor da primeira pintura — quem
// deixava o feed aberto via "agora" numa publicação com meia hora. Vinte cartões partilham este
// intervalo, em vez de um temporizador cada.

const listeners = new Set();
let now = Date.now();
let timer = 0;

function subscribe(listener) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = 0;
    }
  };
}

const getSnapshot = () => now;

/** A hora actual, arredondada ao minuto em que o relógio partilhado deu o último toque. */
export function useMinuteTick() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
