import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { getMfaState, needsMfaChallenge } from '@/lib/mfa';

const MfaChallengeDialog = lazy(() => import('@/components/MfaChallengeDialog'));

/**
 * Pede o código da aplicação autenticadora a quem activou a verificação em dois passos e
 * entrou só com a palavra-passe (ou com a Google). Até introduzir o código, o servidor trata a
 * sessão como a de um cliente, por isso o diálogo não fecha: ou o código, ou sair da conta.
 * Contas sem verificação em dois passos nunca o vêem, nem descarregam o diálogo.
 */
export default function MfaGate() {
  const { user, logout } = useAuth();
  const [factorId, setFactorId] = useState('');
  const check = useCallback(async () => {
    if (!user?.id) {
      setFactorId('');
      return;
    }
    try {
      // Lido da sessão local, sem ida à rede: só se pergunta pelos factores quando falta o código.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!needsMfaChallenge(aal)) {
        setFactorId('');
        return;
      }
      const state = await getMfaState();
      setFactorId(state.needsChallenge ? state.verified[0]?.id || '' : '');
    } catch {
      // Sem rede ou sessão a mudar: o servidor continua a aplicar a regra; volta-se a ver na
      // próxima mudança de sessão.
    }
  }, [user?.id]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Fora do callback: o supabase-js não aceita chamadas ao cliente dentro dele.
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'MFA_CHALLENGE_VERIFIED', 'USER_UPDATED'].includes(event)) {
        setTimeout(check, 0);
      }
    });
    return () => data?.subscription?.unsubscribe();
  }, [check]);

  if (!factorId) return null;
  return (
    <Suspense fallback={null}>
      <MfaChallengeDialog
        factorId={factorId}
        onVerified={() => setFactorId('')}
        onLogout={() => { setFactorId(''); logout(); }}
      />
    </Suspense>
  );
}
