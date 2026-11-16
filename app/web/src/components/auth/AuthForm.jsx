import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Mail, Lock, User, ArrowRight, Eye, EyeOff, MailCheck, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import UserAvatar from '@/components/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { HAD_ACCOUNT_KEY, rememberedFirstName, validateAuthForm } from '@/lib/authPrompt';
import { normalizeLoginEmail } from '@/lib/pbAuth';
import { eAppIos } from '@/lib/nativeApp';

const GoogleIcon = () => (
  <svg className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

// O logotipo da Apple, como o botão «Iniciar sessão com a Apple» das regras da Apple o pede.
const AppleIcon = () => (
  <svg className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
  </svg>
);

/** A pessoa fechou a folha de login da Google ou da Apple (lib/nativeAuth.js). */
const cancelado = (err) => err?.code === 'CANCELLED';

/**
 * Entrar ou criar conta: o mesmo formulário na página /login e no modal.
 *
 * Um só sítio para as regras (validação, Google, confirmação por email), em vez de duas cópias
 * a divergir. Quem usa decide o que acontece a seguir em `onDone(record)`: a página navega, o
 * modal fecha e a pessoa fica onde estava.
 *
 * Com uma conta lembrada neste aparelho (`remembered`, de `lib/authPrompt.js`), a entrada
 * identifica-a: em vez do campo de email aparece "Bem-vindo de volta, Maria" com o email, e o
 * caminho com que ela entrou da última vez — a palavra-passe (o gestor do navegador preenche-a,
 * porque o email segue num campo `username` escondido) ou a Google, já na conta certa
 * (`login_hint`). "Não é você?" esquece a conta neste aparelho e mostra o formulário de sempre.
 *
 * @param {object} p
 * @param {'login'|'signup'} [p.initialMode]
 * @param {string} [p.defaultEmail]
 * @param {string} [p.defaultName]
 * @param {{ email: string, name: string, provider: string } | null} [p.remembered]
 * @param {boolean} [p.autoFocus]  pôr o cursor no campo certo ao abrir (a página /login)
 * @param {string} p.returnPath  para onde a Google devolve a pessoa
 * @param {(record: object) => void} p.onDone
 * @param {(mode: string) => void} [p.onModeChange]
 * @param {() => void} [p.onNavigateAway]  ao seguir um link (ex.: "Esqueceu?")
 */
export default function AuthForm({
  initialMode = 'login', defaultEmail = '', defaultName = '', remembered = null, autoFocus = false,
  returnPath, onDone, onModeChange, onNavigateAway,
}) {
  const ids = useId();
  const [mode, setModeState] = useState(initialMode);
  // A conta lembrada só conta se for a do email pedido (o pós-compra pede o email da encomenda).
  const [account, setAccount] = useState(() => (
    remembered?.email && (!defaultEmail || normalizeLoginEmail(defaultEmail) === remembered.email) ? remembered : null
  ));
  const [email, setEmail] = useState(defaultEmail || account?.email || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(defaultName);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState('');
  // O registo encontrou uma conta com este email: passa-se a entrar, com o aviso.
  const [knownAccount, setKnownAccount] = useState('');
  // Conta da Google: a palavra-passe fica escondida até a pessoa a pedir.
  const [passwordOpen, setPasswordOpen] = useState(false);
  const passwordRef = useRef(null);
  const emailRef = useRef(null);
  const { login, signup, loginWithGoogle, loginWithApple } = useAuth();
  const { settings } = useSiteSettings();
  // Dentro do app iOS, «Continuar com a Apple» (a Apple obriga-o onde há login com a Google).
  const [appleNoApp] = useState(() => eAppIos());

  const usingAccount = mode === 'login' && !!account;
  const googleFirst = usingAccount && account.provider === 'google' && !!settings.google_oauth_enabled;
  const showPasswordForm = !googleFirst || passwordOpen;

  // A página /login põe o cursor onde a pessoa vai escrever: na palavra-passe, se a conta já é
  // conhecida (e o teclado do telemóvel oferece logo a palavra-passe guardada), senão no email.
  // No modal não: abre-se também sozinho, e o teclado a saltar por cima da página assusta.
  useEffect(() => {
    if (!autoFocus || googleFirst) return;
    (usingAccount ? passwordRef : emailRef).current?.focus();
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = validateAuthForm({ mode, name, email, password });
  const show = (field) => (submitted || touched[field]) && errors[field];
  const touch = (field) => () => setTouched((t) => ({ ...t, [field]: true }));

  const setMode = (next) => {
    setModeState(next);
    setPendingConfirmation('');
    setKnownAccount('');
    setSubmitted(false);
    setTouched({});
    onModeChange?.(next);
  };

  // "Não é você?": esquece a conta neste aparelho (num telemóvel partilhado, o próximo não vê o
  // nome de quem entrou antes) e volta ao formulário de sempre.
  const forgetAccount = () => {
    try { localStorage.removeItem(HAD_ACCOUNT_KEY); } catch { /* sem armazenamento */ }
    setAccount(null);
    setEmail('');
    setPassword('');
    setPasswordOpen(false);
    setTouched({});
    setSubmitted(false);
    setTimeout(() => emailRef.current?.focus(), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setLoading(true);
    setPendingConfirmation('');
    try {
      try { sessionStorage.setItem('livraria_login_email', email.trim()); } catch { /* sem armazenamento */ }
      const authData = mode === 'login' ? await login(email, password) : await signup(email, password, name);
      if (authData?.alreadyRegistered) {
        // Este email já tem conta: entrar, com o email preenchido. A palavra-passe escrita no
        // registo fica — muitas vezes é a mesma.
        setModeState('login');
        onModeChange?.('login');
        setKnownAccount(authData.email);
        setSubmitted(false);
        setTouched({});
        setTimeout(() => passwordRef.current?.focus(), 0);
        return;
      }
      if (authData?.needsConfirmation) {
        setPendingConfirmation(authData.email);
        setModeState('login');
        setPassword('');
        return;
      }
      if (mode === 'login') {
        toast.success('Sessão iniciada', { description: `Bem-vindo de volta, ${authData.record?.name || 'leitor'}!` });
      } else {
        toast.success('Conta criada', { description: `Seja bem-vindo, ${name.trim().split(/\s+/)[0]}!` });
      }
      onDone?.(authData.record);
    } catch (err) {
      // Quem criou a conta com a Google não tem palavra-passe: dizer-lhe por onde entrar.
      const wrong = /incorrect/i.test(err.message || '');
      const hint = mode === 'login' && wrong && settings.google_oauth_enabled
        ? ' Se criou a conta com a Google, use «Continuar com Google».'
        : '';
      toast.error(mode === 'login' ? 'Não foi possível entrar' : 'Não foi possível criar a conta', {
        description: `${err.message || 'Verifique o email e a palavra-passe.'}${hint}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      // Sai para a Google e volta já com a sessão, à página onde a pessoa estava. No app, o login
      // faz-se por cima da página e volta aqui com a conta, como depois da palavra-passe.
      const result = await loginWithGoogle(returnPath || '/profile', { loginHint: usingAccount ? account.email : '' });
      if (result?.record) {
        toast.success('Sessão iniciada', { description: `Bem-vindo, ${result.record.name || 'leitor'}!` });
        setLoading(false);
        onDone?.(result.record);
      }
    } catch (err) {
      if (!cancelado(err)) {
        toast.error('Google não disponível', {
          description: err?.message || 'Tente com o email e a palavra-passe.',
        });
      }
      setLoading(false);
    }
  };

  const handleApple = async () => {
    setLoading(true);
    try {
      const result = await loginWithApple();
      toast.success('Sessão iniciada', { description: `Bem-vindo, ${result.record?.name || 'leitor'}!` });
      setLoading(false);
      onDone?.(result.record);
    } catch (err) {
      if (!cancelado(err)) {
        toast.error('Não foi possível entrar com a Apple', {
          description: err?.message || 'Tente outra vez ou use o email e a palavra-passe.',
        });
      }
      setLoading(false);
    }
  };

  const field = (key) => `${ids}-${key}`;
  const errorId = (key) => `${ids}-${key}-erro`;

  const googleButton = (label) => (
    <Button
      type="button"
      variant="outline"
      className="w-full py-6 border-2 hover:bg-muted/50"
      onClick={handleGoogle}
      disabled={loading}
    >
      <GoogleIcon />
      {label}
    </Button>
  );

  // Preto, com o logotipo e do tamanho do da Google, como as regras da Apple pedem.
  const appleButton = (
    <Button
      type="button"
      className="w-full py-6 bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
      onClick={handleApple}
      disabled={loading}
      data-login-apple=""
    >
      <AppleIcon />
      Continuar com a Apple
    </Button>
  );

  return (
    <div>
      {pendingConfirmation && (
        <div className="mb-4 flex gap-2 text-xs text-sky-900 dark:text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded-lg p-3" role="status">
          <MailCheck className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Enviámos um link de confirmação para <strong>{pendingConfirmation}</strong>. Depois de confirmar, entre com o email e a
            palavra-passe.{settings.google_oauth_enabled ? ' Se o email não chegar em alguns minutos, use "Continuar com Google".' : ''}
          </p>
        </div>
      )}

      {knownAccount && (
        <div className="mb-4 flex gap-2 text-xs text-sky-900 dark:text-sky-200 bg-sky-500/10 border border-sky-500/30 rounded-lg p-3" role="status">
          <UserCheck className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <strong>{knownAccount}</strong> já tem conta. Entre com a palavra-passe
            {settings.google_oauth_enabled ? ' ou com a Google, se foi assim que a criou' : ''}. Se não se lembra, use "Esqueceu?".
          </p>
        </div>
      )}

      {usingAccount && (
        <div className="mb-5 rounded-xl border bg-muted/40 p-3" data-conta-lembrada="">
          <div className="flex items-center gap-3">
            <UserAvatar user={{ name: account.name, email: account.email }} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Bem-vindo de volta, {rememberedFirstName(account)}</p>
              <p className="truncate text-xs text-muted-foreground">{account.email}</p>
            </div>
          </div>
          {googleFirst && <div className="mt-3">{googleButton('Continuar com Google')}</div>}
          <button
            type="button"
            onClick={forgetAccount}
            className="mt-2 block py-1 text-xs font-medium text-primary hover:underline"
          >
            Não é {rememberedFirstName(account)}? Usar outra conta
          </button>
        </div>
      )}

      {(settings.google_oauth_enabled || appleNoApp) && !googleFirst && (
        <>
          {appleNoApp && appleButton}
          {appleNoApp && settings.google_oauth_enabled && <div className="h-3" />}
          {settings.google_oauth_enabled && googleButton('Continuar com Google')}
          {mode === 'signup' && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">O mais rápido: sem palavra-passe nova e sem esperar por email.</p>
          )}

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{usingAccount ? 'ou com a palavra-passe' : 'ou com email'}</span></div>
          </div>
        </>
      )}

      {googleFirst && !passwordOpen && (
        <button
          type="button"
          onClick={() => { setPasswordOpen(true); setTimeout(() => passwordRef.current?.focus(), 0); }}
          className="mb-1 block w-full py-2 text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Entrar com a palavra-passe
        </button>
      )}

      {showPasswordForm && (
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <Label htmlFor={field('nome')}>Nome</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id={field('nome')}
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={touch('name')}
                className="pl-9 h-11"
                maxLength={100}
                aria-invalid={!!show('name')}
                aria-describedby={show('name') ? errorId('name') : undefined}
              />
            </div>
            {show('name') && <p id={errorId('name')} className="text-xs text-destructive">{errors.name}</p>}
          </div>
        )}

        {usingAccount ? (
          // O email da conta lembrada segue num campo escondido: é por ele que o gestor de
          // palavras-passe do navegador sabe de que conta é a palavra-passe que vai preencher.
          <input type="email" name="email" autoComplete="username" value={account.email} readOnly hidden />
        ) : (
        <div className="space-y-1.5">
          <Label htmlFor={field('email')}>Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={emailRef}
              id={field('email')}
              name="email"
              type="email"
              inputMode="email"
              // A entrar, `username`: é o que os gestores de palavras-passe (Chrome, iCloud,
              // Samsung) procuram para saber que conta preencher. No registo, `email`, para o
              // teclado sugerir o endereço da pessoa.
              autoComplete={mode === 'login' ? 'username' : 'email'}
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={touch('email')}
              className="pl-9 h-11"
              placeholder="o.seu.email@exemplo.com"
              aria-invalid={!!show('email')}
              aria-describedby={show('email') ? errorId('email') : undefined}
            />
          </div>
          {show('email') && <p id={errorId('email')} className="text-xs text-destructive">{errors.email}</p>}
        </div>
        )}

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label htmlFor={field('senha')}>Palavra-passe</Label>
            {mode === 'login' && (
              <Link to="/forgot-password" onClick={onNavigateAway} className="-my-2 block py-2 text-xs text-primary hover:underline">Esqueceu?</Link>
            )}
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={passwordRef}
              id={field('senha')}
              name="password"
              type={showPass ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={touch('password')}
              className="pl-9 pr-11 h-11"
              aria-invalid={!!show('password')}
              aria-describedby={show('password') ? errorId('password') : (mode === 'signup' ? `${field('senha')}-dica` : undefined)}
            />
            <button
              type="button"
              // `p-1`: 24×24 em vez de 16×16 (WCAG 2.5.8; o alvo de toque maior do `.tap-target`
              // é um pseudo-elemento e não conta). `right-1` mantém o olho no mesmo sítio.
              className="tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
              aria-pressed={showPass}
            >
              {showPass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {show('password')
            ? <p id={errorId('password')} className="text-xs text-destructive">{errors.password}</p>
            : mode === 'signup' && <p id={`${field('senha')}-dica`} className="text-[11px] text-muted-foreground">Mínimo de 8 caracteres.</p>}
        </div>

        <Button type="submit" className="w-full btn-primary py-6 text-base" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="mr-2 h-4 w-4" aria-hidden="true" />}
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </Button>
        {mode === 'signup' && (
          <p className="text-center text-xs text-muted-foreground">
            Ao criar conta, aceita os{' '}
            <a href="/termos" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-2">termos e condições</a>
            , e os seus dados são tratados como explicado na{' '}
            <a href="/privacidade" target="_blank" rel="noopener" className="font-medium text-primary underline underline-offset-2">política de privacidade</a>.
          </p>
        )}
      </form>
      )}

      <p className="text-center text-sm text-muted-foreground mt-5">
        {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
        <button type="button" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-primary font-medium hover:underline">
          {mode === 'login' ? 'Criar conta' : 'Entrar'}
        </button>
      </p>
    </div>
  );
}
