// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import pb from '@/lib/dataClient';
import { canAccessAdmin, hasPermission, getUserPermissions } from '@/lib/permissions';
import { escapeFilterValue } from '@/lib/filterValue';
import { IS_PASSWORD_RECOVERY_REDIRECT, supabase } from '@/lib/supabaseClient';
import { normalizeLoginEmail, parsePbAuthError } from '@/lib/pbAuth';
import { requestSessionNotice, requestWelcomeEmail, safeInternalPath } from '@/lib/authSession';
import { AUTH_REDIRECT_ERROR } from '@/lib/authRedirectError';
import { getUserFirstName } from '@/lib/userUtils';
import { eAppNativa } from '@/lib/nativeApp';
import {
  getSilentPasswordCredential, keepSiteDataOnDevice, markSilentSignInTried, passwordCredentialsSupported,
  preventSilentSignIn, shouldTrySilentSignIn, silentSignInState, storePasswordCredential,
} from '@/lib/savedCredentials';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // A sessão é sempre do Supabase Auth (email/palavra-passe ou Google).
  // O Firebase fica só para as ferramentas do Google Workspace, que pedem o seu próprio acesso.
  const [user, setUser] = useState(() => (pb.authStore.isValid ? pb.authStore.record : null));
  // `ready` é falso até o arranque determinar se existe sessão. Quem protege uma página tem
  // de esperar por ele: decidir antes disso expulsava para `/login` quem tinha sessão válida
  // mas ainda não lida — o caso de todas as voltas do login com a Google, que trazem a sessão
  // no endereço e não no armazenamento.
  const [ready, setReady] = useState(() => pb.authStore.isReady);

  useEffect(() => {
    const unsub = pb.authStore.onChange((_token, record) => setUser(record || null), true);
    const unsubReady = pb.authStore.onReady(() => setReady(true));
    return () => {
      unsub();
      unsubReady();
    };
  }, []);

  // Boas-vindas no primeiro acesso de cada conta. Serve tanto o registo por email como a
  // primeira entrada com a Google, que cria a conta sem passar pela nossa API.
  useEffect(() => {
    if (!ready || !user?.id) return;
    requestWelcomeEmail(pb, user.id);
    requestSessionNotice(pb, user.id);
    // Na app instalada, os dados do site (e a sessão) não se apagam quando o telemóvel fica
    // sem espaço. Sem pergunta nenhuma no Chrome e no Safari.
    keepSiteDataOnDevice();
  }, [ready, user?.id]);

  // Ao abrir a app sem sessão: entrar sozinho com a conta que o navegador guardou (Chrome,
  // Edge, Android). Uma vez por arranque, nunca depois de "Sair" (lib/savedCredentials.js).
  useEffect(() => {
    if (!ready || user) return;
    const decide = shouldTrySilentSignIn({
      ready,
      isAuthed: pb.authStore.isValid,
      pathname: window.location.pathname,
      ...silentSignInState(),
      recovery: IS_PASSWORD_RECOVERY_REDIRECT || !!AUTH_REDIRECT_ERROR,
      supported: passwordCredentialsSupported(),
    });
    if (!decide) return;
    markSilentSignInTried();
    (async () => {
      const saved = await getSilentPasswordCredential();
      // Entretanto a pessoa pode ter entrado à mão: não se mexe na sessão dela.
      if (!saved || pb.authStore.isValid) return;
      try {
        const authData = await pb.collection('users').authWithPassword(normalizeLoginEmail(saved.email), saved.password);
        setUser(authData.record);
        toast.success(`Bem-vindo de volta, ${getUserFirstName(authData.record)}`, {
          description: 'Entrou automaticamente com a conta guardada neste aparelho.',
        });
      } catch (err) {
        // Palavra-passe guardada antiga (mudou noutro sítio): o navegador deixa de a oferecer em
        // silêncio e a pessoa entra como sempre. Sem rede (status 0) tenta-se no próximo arranque.
        if (err?.status !== 0) preventSilentSignIn();
      }
    })();
  }, [ready, user]);

  const value = {
    user,
    ready,
    isAuthed: pb.authStore.isValid,
    isAdmin: user?.role === 'admin',
    canAccessAdmin: canAccessAdmin(user),
    hasPermission: (key) => hasPermission(user, key),
    permissions: getUserPermissions(user),
    login: async (email, password) => {
      const identity = normalizeLoginEmail(email);
      try {
        const authData = await pb.collection('users').authWithPassword(identity, password);
        setUser(authData.record);
        // "Guardar palavra-passe?" do navegador: da próxima vez preenche sozinho ou entra sozinho.
        storePasswordCredential({ email: identity, password, name: authData.record?.name });
        return authData;
      } catch (err) {
        throw new Error(parsePbAuthError(err));
      }
    },
    signup: async (email, password, name) => {
      const identity = normalizeLoginEmail(email);
      try {
        const created = await pb.collection('users').create({
          email: identity,
          password,
          passwordConfirm: password,
          name: name.trim(),
        });
        if (created?.alreadyRegistered) return { alreadyRegistered: true, email: identity };
        if (created?.needsConfirmation) return { needsConfirmation: true, email: identity };
        setUser(created);
        storePasswordCredential({ email: identity, password, name: created?.name || name.trim() });
        return { record: created };
      } catch (err) {
        throw new Error(parsePbAuthError(err));
      }
    },
    logout: async () => {
      pb.authStore.clear();
      setUser(null);
      // Sair é sair: o navegador não volta a entrar sozinho na próxima vez que a app abrir.
      preventSilentSignIn();
      // Termina também a ligação ao Google Workspace, se existir. O Firebase só serve as
      // ferramentas Workspace do painel: é carregado aqui, e não no arranque da loja, para
      // não pôr 154 KB gzip no caminho crítico de quem só vem comprar um livro.
      // Com o armazenamento bloqueado, o sessionStorage lança: a sessão já saiu, e "Sair" não
      // pode acabar num erro por causa disso.
      let tinhaGoogle = false;
      try {
        tinhaGoogle = !!sessionStorage.getItem('google_access_token');
        sessionStorage.removeItem('google_access_token');
      } catch {
        // sem sessionStorage: não havia token do Google guardado
      }
      if (tinhaGoogle) {
        await import('@/lib/firebaseClient')
          .then((m) => m.logoutFirebase())
          .catch(() => {});
      }
    },
    /**
     * Termina a sessão em todos os aparelhos (`scope: 'global'`): o Supabase invalida todos
     * os refresh tokens da conta. Os outros aparelhos saem quando o token de acesso que têm
     * expirar (até uma hora). Este sai já.
     */
    logoutEverywhere: async () => {
      // Antes do `signOut`: o `SIGNED_OUT` que ele provoca é da pessoa, não do servidor.
      pb.authStore.noteUserSignOut();
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw new Error(error.message || 'Não foi possível terminar as sessões.');
      pb.authStore.clear();
      setUser(null);
      preventSilentSignIn();
    },
    // Redirecciona para a Google; ao voltar, o Supabase cria a sessão e o perfil.
    // O destino é validado aqui também, e não só em quem chama: é o que acaba em
    // `redirectTo`, e um caminho não verificado levava o utilizador para fora da loja
    // logo a seguir a autenticar-se.
    loginWithGoogle: async (redirectPath = '/profile', { loginHint = '' } = {}) => {
      const target = safeInternalPath(redirectPath, '/profile');
      // Com o email da conta lembrada neste aparelho, a Google abre já nessa conta (em vez da
      // lista de contas do telemóvel). Só um email com ar de email segue.
      const hint = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(loginHint || '').trim()) ? String(loginHint).trim() : '';
      // Dentro do app a Google recusa o WebView: o login faz-se no navegador do sistema e a pessoa
      // fica onde estava, já com a conta (lib/nativeAuth.js). Quem chamou decide a seguir, como
      // depois da palavra-passe.
      if (eAppNativa()) {
        const { entrarComGoogleNoApp } = await import('@/lib/nativeAuth');
        const result = await entrarComGoogleNoApp({ queryParams: hint ? { login_hint: hint } : undefined });
        setUser(result.record);
        return { ...result, target };
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${target}`,
          ...(hint ? { queryParams: { login_hint: hint } } : {}),
        },
      });
      if (error) throw error;
    },
    /** «Iniciar sessão com a Apple»: só dentro do app iOS (lib/nativeAuth.js). */
    loginWithApple: async () => {
      const { entrarComApple } = await import('@/lib/nativeAuth');
      const result = await entrarComApple();
      setUser(result.record);
      return result;
    },
    requestPasswordReset: (email) =>
      pb.collection('users').requestPasswordReset(
        normalizeLoginEmail(email),
        `${window.location.origin}/reset-password`,
      ),
    confirmPasswordReset: async (token, password) => {
      const done = await pb.collection('users').confirmPasswordReset(token, password, password);
      // O navegador fica com a palavra-passe nova (a antiga já não serve para entrar sozinho).
      const email = pb.authStore.record?.email;
      if (email) storePasswordCredential({ email, password, name: pb.authStore.record?.name });
      return done;
    },
    updateProfile: async ({ name, email, phone }) => {
      const id = pb.authStore.record?.id;
      if (!id) throw new Error('Não autenticado');
      const data = {};
      if (name !== undefined) data.name = name;
      if (email !== undefined) data.email = normalizeLoginEmail(email);
      if (phone !== undefined) data.phone = phone;
      const previousEmail = pb.authStore.record?.email || '';
      const updated = await pb.collection('users').update(id, data);
      setUser(updated);
      // Mudança de email pedida: o endereço actual recebe o aviso. O servidor lê o endereço
      // pendente da própria conta, por isso não se manda nada no pedido.
      if (data.email && data.email !== normalizeLoginEmail(previousEmail)) {
        pb.send('/account/email-change-notice', { method: 'POST', body: {} }).catch(() => {});
      }
      return updated;
    },
    updateAvatar: async (file) => {
      const id = pb.authStore.record?.id;
      if (!id) throw new Error('Não autenticado');
      const formData = new FormData();
      formData.append('avatar', file);
      const updated = await pb.collection('users').update(id, formData);
      setUser(updated);
      return updated;
    },
    changePassword: async (oldPassword, newPassword) => {
      const email = pb.authStore.record?.email;
      if (!email) throw new Error('Não autenticado');
      try {
        await pb.collection('users').authWithPassword(email, oldPassword);
      } catch {
        throw new Error('A palavra-passe actual está incorrecta. Se entrou com a Google e nunca definiu uma, use "Esqueceu?" no ecrã de entrada.');
      }
      await pb.collection('users').update(pb.authStore.record.id, {
        oldPassword,
        password: newPassword,
        passwordConfirm: newPassword,
      });
      storePasswordCredential({ email, password: newPassword, name: pb.authStore.record?.name });
      // O aviso é um extra: a palavra-passe já está mudada, e uma falha aqui não a desfaz.
      pb.send('/account/password-changed-notice', { method: 'POST', body: {} }).catch(() => {});
    },
    // Encomendas do cliente; as regras (RLS) só devolvem as do email da sessão.
    fetchUserOrders: async (email) => {
      try {
        return await pb.collection('orders').getFullList({
          filter: `customer_email = "${escapeFilterValue(email)}"`,
          sort: '-created',
        });
      } catch (err) {
        console.warn('Failed to fetch orders:', err);
        return [];
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
