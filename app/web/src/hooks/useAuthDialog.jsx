import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { currentPathWithQuery, safeInternalPath } from '@/lib/authSession';
import {
  HAD_ACCOUNT_KEY, NUDGE_KEY, NUDGE_SESSION_KEY, VIEWS_SESSION_KEY,
  dismissNudge, nudgeMode, readHadAccount, readNudgeState, safeStorage, shouldNudge,
} from '@/lib/authPrompt';

// O modal só é descarregado na primeira vez que abre: quem entra para ver um livro não paga
// o formulário de entrada no carregamento da página.
const AuthDialog = lazy(() => import('@/components/auth/AuthDialog.jsx'));

const AuthDialogContext = createContext(null);

/** Quanto tempo a pessoa fica na terceira ficha antes de o convite abrir. */
const NUDGE_DELAY_MS = 4000;

const anotherPanelOpen = () => !!document.querySelector('[role="dialog"], [aria-modal="true"]');

/**
 * Entrar e criar conta num modal, sem sair da página.
 *
 * `openAuth({ mode, reason, defaultEmail, defaultName })` abre-o em qualquer sítio: o carrinho,
 * a ficha do livro, o cabeçalho. Ao terminar, a pessoa fica onde estava — com o carrinho e o
 * que já tinha escrito — em vez de ir para /login e voltar.
 *
 * Também abre sozinho, uma vez, a quem mostra interesse e não tem sessão (regras em
 * `lib/authPrompt.js`).
 */
export function AuthDialogProvider({ children }) {
  const { ready, isAuthed, user } = useAuth();
  const location = useLocation();
  const [request, setRequest] = useState(null);
  const [mounted, setMounted] = useState(false);
  const nudgeTimer = useRef(null);
  const requestRef = useRef(null);
  requestRef.current = request;
  // Lidos quando o temporizador dispara, e não quando a página mudou: o arranque da sessão
  // pode terminar nesses segundos.
  const authRef = useRef({ ready, isAuthed });
  authRef.current = { ready, isAuthed };

  const local = useMemo(() => (typeof window === 'undefined' ? null : safeStorage('local')), []);
  const session = useMemo(() => (typeof window === 'undefined' ? null : safeStorage('session')), []);

  const hadAccount = useCallback(() => readHadAccount(local?.getItem(HAD_ACCOUNT_KEY)), [local]);

  const openAuth = useCallback((opts = {}) => {
    const remembered = hadAccount();
    setMounted(true);
    setRequest({
      mode: opts.mode || nudgeMode(!!remembered),
      reason: opts.reason || '',
      defaultEmail: opts.defaultEmail || remembered?.email || '',
      defaultName: opts.defaultName || '',
      source: opts.source || 'manual',
      key: Date.now(),
    });
  }, [hadAccount]);

  const closeAuth = useCallback(() => setRequest(null), []);

  // Fechar o convite automático conta como "agora não"; fechar um que a pessoa abriu, não.
  const handleOpenChange = useCallback((open) => {
    if (open) return;
    if (requestRef.current?.source === 'nudge' && local) {
      local.setItem(NUDGE_KEY, JSON.stringify(dismissNudge(local.getItem(NUDGE_KEY))));
    }
    setRequest(null);
  }, [local]);

  // Lembrar que este navegador já teve conta, para da próxima vez dizer "Entrar" e preencher
  // o email. Só o email: nada que dê acesso.
  useEffect(() => {
    if (!user?.email || !local) return;
    local.setItem(HAD_ACCOUNT_KEY, JSON.stringify({ email: String(user.email).toLowerCase() }));
  }, [user?.email, local]);

  // Com sessão, o modal não tem razão de estar aberto (ex.: voltou da Google noutro separador).
  useEffect(() => {
    if (ready && isAuthed) setRequest(null);
  }, [ready, isAuthed]);

  // Seguir um link fecha o modal (ex.: "Esqueceu?").
  useEffect(() => {
    setRequest((r) => (r ? null : r));
  }, [location.pathname]);

  // Convite automático: conta as fichas vistas nesta sessão e decide.
  useEffect(() => {
    clearTimeout(nudgeTimer.current);
    if (!session || !location.pathname.startsWith('/product/')) return undefined;
    const views = (Number(session.getItem(VIEWS_SESSION_KEY)) || 0) + 1;
    session.setItem(VIEWS_SESSION_KEY, String(views));
    nudgeTimer.current = setTimeout(() => {
      const decide = shouldNudge({
        ...authRef.current,
        pathname: window.location.pathname,
        productViews: views,
        shownThisSession: session.getItem(NUDGE_SESSION_KEY) === '1',
        state: readNudgeState(local?.getItem(NUDGE_KEY)),
        busy: anotherPanelOpen(),
      });
      if (!decide) return;
      session.setItem(NUDGE_SESSION_KEY, '1');
      openAuth({ source: 'nudge', reason: 'nudge' });
    }, NUDGE_DELAY_MS);
    return () => clearTimeout(nudgeTimer.current);
    // Só a mudança de página conta como nova ficha vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const returnPath = safeInternalPath(currentPathWithQuery(location), '/');
  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      {mounted && (
        <Suspense fallback={null}>
          <AuthDialog
            request={request}
            returnPath={returnPath}
            onOpenChange={handleOpenChange}
            onDone={closeAuth}
          />
        </Suspense>
      )}
    </AuthDialogContext.Provider>
  );
}

/** `openAuth` fora do fornecedor (testes, páginas isoladas) cai para a página /login. */
export function useAuthDialog() {
  const ctx = useContext(AuthDialogContext);
  if (ctx) return ctx;
  return {
    openAuth: () => { window.location.assign('/login'); },
    closeAuth: () => {},
  };
}
