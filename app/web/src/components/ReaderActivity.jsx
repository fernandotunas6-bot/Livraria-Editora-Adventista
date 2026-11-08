import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { readerTouchDaily } from '@/lib/readerApi';

/**
 * Conta um dia de actividade da conta com sessão (uma vez por dia, neste aparelho), para a entrada
 * na Comunidade de Leitores sem compra (30 dias de conta e 5 dias a usar o site, por omissão).
 * Quem já é Leitor não guarda dias. Não desenha nada.
 */
export default function ReaderActivity() {
  const { user, isAuthed } = useAuth() || {};
  const userId = isAuthed ? user?.id : null;
  useEffect(() => {
    if (!userId) return undefined;
    // Depois de a página assentar: não compete com o que se está a carregar.
    const t = setTimeout(() => { readerTouchDaily(userId).catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, [userId]);
  return null;
}
