/**
 * Mensagens em português para as falhas da ligação ao Google Workspace (painel → Integrações).
 *
 * A ligação usa o Firebase Auth, e o Firebase só abre o login da Google nos domínios da sua
 * lista. `livrariaadventista.com` não estava lá (só o projecto antigo): o painel mostrava
 * "Firebase: Error (auth/unauthorized-domain)." e ninguém sabia o que fazer (auditoria, 9.7).
 */
const FIREBASE_PROJECT = 'skilful-form-c5jvd';

export function googleWorkspaceErrorMessage(err, hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  const code = String(err?.code || '');
  switch (code) {
    case 'auth/unauthorized-domain':
      return `Este endereço (${hostname || 'o actual'}) não está autorizado no Firebase. Um administrador tem de o acrescentar em Firebase → projecto ${FIREBASE_PROJECT} → Authentication → Settings → Authorized domains.`;
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela da Google. Permita janelas pop-up para este site e tente outra vez.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'A janela da Google foi fechada antes de terminar.';
    case 'auth/network-request-failed':
      return 'Sem ligação à Google. Verifique a internet e tente outra vez.';
    case 'auth/operation-not-allowed':
      return `O login com a Google está desligado no Firebase (projecto ${FIREBASE_PROJECT} → Authentication → Sign-in method).`;
    case 'auth/internal-error':
      return 'A Google não respondeu como esperado. Tente outra vez dentro de momentos.';
    default:
      return 'Não foi possível ligar a conta Google. Tente outra vez.';
  }
}
