// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import pb from '@/lib/dataClient';
import { currentPathWithQuery, safeInternalPath } from '@/lib/authSession';
import {
  HAD_ACCOUNT_KEY, NUDGE_KEY, NUDGE_SESSION_KEY, VIEWS_SESSION_KEY,
  dismissNudge, hadAccountValue, isExcludedPath, nudgeMode, readHadAccount, readNudgeState, safeStorage, shouldNudge,
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
      // O formulário só a mostra se for a conta do email pedido (AuthForm).
      remembered,
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

  // Lembrar a conta que entrou neste navegador, para da próxima vez a identificar: o email, o
  // nome e como entrou (palavra-passe ou Google). Nada que dê acesso (lib/authPrompt.js).
  useEffect(() => {
    if (!user?.email || !local) return;
    const value = hadAccountValue(
      { email: user.email, name: user.name || '', provider: pb.authStore.method },
      local.getItem(HAD_ACCOUNT_KEY),
    );
    if (value) local.setItem(HAD_ACCOUNT_KEY, value);
  }, [user?.email, user?.name, local]);

  // A sessão terminou sem a pessoa sair (noutro aparelho, palavra-passe mudada): dizer-lhe, com
  // "Entrar" já na conta dela. Antes ficava sem sessão sem perceber porquê.
  useEffect(() => pb.authStore.onSessionEnded((shown) => {
    toast('A sua sessão terminou neste aparelho', {
      id: 'sessao-terminou',
      description: 'Entre de novo para continuar.',
      duration: 12000,
      // No perfil, no painel e na entrada a própria página já pede para entrar.
      action: isExcludedPath(window.location.pathname)
        ? undefined
        : { label: 'Entrar', onClick: () => openAuth({ mode: 'login', reason: 'session-ended', defaultEmail: shown?.email || '' }) },
    });
  }), [openAuth]);

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
