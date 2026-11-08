import { useEffect, useState } from 'react';

// A ficha de colportor ligada à conta (ou null), para os menus do site mostrarem a "Área do
// colportor" só a quem a tem. Uma ida à rede por conta e por visita, partilhada por todos os
// que perguntam (menu da conta, menu do telemóvel, perfil). Sem a migração da colportagem, ou
// sem rede, vale null: o atalho simplesmente não aparece.

const cache = new Map(); // id da conta → Promise<ficha | null>

function load(userId) {
  if (!cache.has(userId)) {
    const p = import('@/lib/colporteurApi')
      .then(({ colporteurMe }) => colporteurMe())
      .then((me) => me || null)
      .catch(() => null);
    cache.set(userId, p);
  }
  return cache.get(userId);
}

/** Esquece a resposta (ao ligar a conta a uma ficha, por exemplo). */
export function forgetColporteurMe(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * `undefined` enquanto não se sabe, `null` se não é colportor, a ficha se é. Só pergunta com
 * `enabled` (por exemplo, quando o menu abre) e com uma conta.
 */
export function useColporteurMe(userId, { enabled = true } = {}) {
  const [state, setState] = useState({ userId: null, me: undefined });
  useEffect(() => {
    if (!enabled || !userId) return undefined;
    let alive = true;
    load(userId).then((me) => { if (alive) setState({ userId, me }); });
    return () => { alive = false; };
  }, [userId, enabled]);
  return state.userId === userId ? state.me : undefined;
}
