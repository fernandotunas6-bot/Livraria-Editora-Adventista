import { useCallback, useEffect, useState } from 'react';
import { cachedNotices, loadLiveNotices, readDismissed, rememberDismissed } from '@/lib/siteNoticesApi';
import { noticeKey, pickNotice } from '@/lib/siteNotices';

/**
 * O aviso da faixa do cabeçalho para quem está a ver, e a função para o fechar.
 * Começa pelo que já se sabe (memória ou navegador) e confirma com a base de dados.
 */
export function useSiteNotice() {
  const [notices, setNotices] = useState(() => cachedNotices());
  const [dismissed, setDismissed] = useState(() => readDismissed());

  useEffect(() => {
    let alive = true;
    loadLiveNotices().then((rows) => { if (alive) setNotices(rows); });
    return () => { alive = false; };
  }, []);

  // As datas confirmam-se aqui também: um aviso guardado no navegador pode já ter acabado.
  const notice = pickNotice(notices, { now: Date.now(), dismissed });

  const dismiss = useCallback(() => {
    if (!notice || notice.dismissible === false) return;
    setDismissed(rememberDismissed(noticeKey(notice)));
  }, [notice]);

  return { notice, dismiss };
}
