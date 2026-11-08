import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// A disposição do painel que cada pessoa escolheu, neste aparelho:
// - 'tabs' (separadores no topo, a de sempre e a de omissão);
// - 'sidebar' (barra lateral à esquerda, que se pode recolher aos ícones).
//
// Por conta: no computador partilhado da loja, cada pessoa da equipa fica com a sua. Fica neste
// navegador (localStorage) e também na conta (metadados do utilizador): num aparelho novo, o
// painel abre com a disposição que a pessoa escolheu noutro. Com o painel aberto em dois
// separadores, mudar num muda no outro. Sem armazenamento, vale a de omissão.

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

export const ACCOUNT_LAYOUT_FIELD = 'painel_disposicao';

export function useAdminLayout(userId) {
  const [layout, setLayoutState] = useState(() => readAdminLayout(userId));
  const [sidebarOpen, setSidebarOpenState] = useState(() => readSidebarOpen(userId));

  // A conta pode chegar depois da primeira pintura (a sessão ainda a carregar): aí lê-se outra
  // vez a escolha, agora a desta pessoa.
  useEffect(() => {
    setLayoutState(readAdminLayout(userId));
    setSidebarOpenState(readSidebarOpen(userId));
  }, [userId]);

  // Outro separador com o painel mudou a disposição ou a barra: acompanha.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === layoutKey(userId) && ADMIN_LAYOUTS.includes(e.newValue)) setLayoutState(e.newValue);
      if (e.key === sidebarKey(userId) && (e.newValue === 'true' || e.newValue === 'false')) setSidebarOpenState(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  // Num aparelho onde a pessoa ainda não escolheu, vale a escolha guardada na conta.
  useEffect(() => {
    if (!userId || read(layoutKey(userId))) return undefined;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      const saved = data?.user?.user_metadata?.[ACCOUNT_LAYOUT_FIELD];
      if (alive && ADMIN_LAYOUTS.includes(saved)) {
        setLayoutState(saved);
        write(layoutKey(userId), saved);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const setLayout = useCallback((value) => {
    if (!ADMIN_LAYOUTS.includes(value)) return;
    setLayoutState(value);
    write(layoutKey(userId), value);
    // Na conta também, para os outros aparelhos (sem esperar nem avisar se falhar: fica cá).
    if (userId) supabase.auth.updateUser({ data: { [ACCOUNT_LAYOUT_FIELD]: value } }).catch(() => {});
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
