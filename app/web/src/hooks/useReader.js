import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { cachedReaderStatus, loadReaderStatus, onReaderLevels, onReaderStatus, readerLevelOf } from '@/lib/readerApi';

/**
 * O nível de leitor da conta com sessão (`reader_status`): `undefined` enquanto chega, `null` sem
 * sessão (ou antes da migração), ou `{ level, books, since, via, staff, tiers, engage }`.
 * `refreshKey`: mudar o valor volta a pedir (por exemplo, quando chega um sinal da conta).
 */
export function useReaderStatus({ refreshKey = 0 } = {}) {
  const { user, isAuthed } = useAuth() || {};
  const userId = isAuthed ? user?.id : null;
  const [status, setStatus] = useState(() => (userId ? cachedReaderStatus(userId) : null));

  useEffect(() => onReaderStatus((c) => { if (c.userId === userId) setStatus(c.status); }), [userId]);

  useEffect(() => {
    if (!userId) { setStatus(null); return undefined; }
    let alive = true;
    loadReaderStatus(userId).then((s) => { if (alive) setStatus(s); }).catch(() => { if (alive) setStatus(null); });
    return () => { alive = false; };
  }, [userId, refreshKey]);

  return status;
}

/** O distintivo de um autor da comunidade, pela chave pública (pedidos agrupados em lote). */
export function useReaderLevel(key) {
  const [level, setLevel] = useState(() => readerLevelOf(key));
  useEffect(() => {
    setLevel(readerLevelOf(key));
    return onReaderLevels(() => setLevel(readerLevelOf(key)));
  }, [key]);
  return level;
}
