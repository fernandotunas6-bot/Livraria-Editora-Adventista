import { useCallback, useState } from 'react';

// A disposição do painel que cada pessoa escolheu, neste aparelho:
// - 'tabs' (separadores no topo, a de sempre e a de omissão);
// - 'sidebar' (barra lateral à esquerda, que se pode recolher aos ícones).
//
// Por conta: no computador partilhado da loja, cada pessoa da equipa fica com a sua. Só neste
// navegador (localStorage); sem armazenamento, vale a de omissão e a escolha dura a visita.

export const ADMIN_LAYOUTS = ['tabs', 'sidebar'];
export const DEFAULT_ADMIN_LAYOUT = 'tabs';

const layoutKey = (userId) => `livraria:painel:disposicao${userId ? `:${userId}` : ''}`;
const sidebarKey = (userId) => `livraria:painel:barra-aberta${userId ? `:${userId}` : ''}`;

function read(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // sem armazenamento: a escolha fica só nesta visita
  }
}

export function readAdminLayout(userId) {
  const saved = read(layoutKey(userId));
  return ADMIN_LAYOUTS.includes(saved) ? saved : DEFAULT_ADMIN_LAYOUT;
}

/**
 * A barra lateral começa aberta em ecrãs largos (1024 px ou mais) e recolhida aos ícones nos
 * mais estreitos, onde 16 rem de barra roubavam metade da largura às tabelas; depois vale o que
 * a pessoa escolheu.
 */
export function readSidebarOpen(userId, width = typeof window !== 'undefined' ? window.innerWidth : 1280) {
  const saved = read(sidebarKey(userId));
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return width >= 1024;
}

export function useAdminLayout(userId) {
  const [layout, setLayoutState] = useState(() => readAdminLayout(userId));
  const [sidebarOpen, setSidebarOpenState] = useState(() => readSidebarOpen(userId));

  const setLayout = useCallback((value) => {
    if (!ADMIN_LAYOUTS.includes(value)) return;
    setLayoutState(value);
    write(layoutKey(userId), value);
  }, [userId]);

  const setSidebarOpen = useCallback((value) => {
    setSidebarOpenState((prev) => {
      const next = typeof value === 'function' ? value(prev) : !!value;
      write(sidebarKey(userId), String(next));
      return next;
    });
  }, [userId]);

  return { layout, setLayout, sidebarOpen, setSidebarOpen };
}
