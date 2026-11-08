import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Server } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import BrandLogo from '@/components/BrandLogo';
import { pageTitle } from '@/lib/brand';
import { withCacheBust } from '@/lib/imageUrl';
import { safeInternalPath } from '@/lib/authSession';
import AuthForm from '@/components/auth/AuthForm';
import { HAD_ACCOUNT_KEY, readHadAccount } from '@/lib/authPrompt';

const LoginPage = () => {
  const location = useLocation();
  // ?redirect= só aceita caminhos internos (evita redireccionar para outros sites).
  const redirectParam = new URLSearchParams(location.search).get('redirect');
  const redirectTo = safeInternalPath(location.state?.from || redirectParam, '');

  // ?modo=registo abre já no registo (links de campanhas, do email de boas-vindas, etc.).
  const [mode, setMode] = useState(() => (new URLSearchParams(location.search).get('modo') === 'registo' ? 'signup' : 'login'));
  const { ready, isAuthed, user } = useAuth();
  // A última conta que entrou neste navegador (para a identificar: "Bem-vindo de volta, Maria")
  // e o último email escrito nesta sessão.
  const [remembered] = useState(() => {
    try {
      return readHadAccount(localStorage.getItem(HAD_ACCOUNT_KEY));
    } catch {
      return null;
    }
  });
  const [defaultEmail] = useState(() => {
    try {
      return sessionStorage.getItem('livraria_login_email') || remembered?.email || '';
    } catch {
      return '';
    }
  });
  const { settings } = useSiteSettings();
  const navigate = useNavigate();

  const bgImage = withCacheBust(
    settings.login_bg_url || '/images/site/login-fundo.webp',
    settings.assets_version,
  );

  const afterAuthNavigate = (authRecord) => {
    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }
    const role = authRecord?.role;
    if (role === 'admin' || role === 'manager') {
      navigate('/admin', { replace: true });
      return;
    }
    navigate('/profile', { replace: true });
  };

  // Quem já tem sessão não volta a ver o formulário: segue para onde ia (ou para a sua área).
  // Antes disto, abrir `/login` com sessão válida — ou voltar da Google para cá — mostrava o
  // ecrã de entrada a quem já estava autenticado.
  useEffect(() => {
    if (!ready || !isAuthed) return;
    afterAuthNavigate(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, isAuthed]);

  return (
    <>
      <Helmet><title>{pageTitle('Entrar')}</title></Helmet>
      <div className="min-h-screen grid lg:grid-cols-2 bg-background">
        <div className="relative hidden lg:block">
          <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-[#0c4a6e]/95 via-[#0c4a6e]/50 to-[#0c4a6e]/20" />
          <div className="absolute bottom-12 left-12 right-12 text-white">
            <BrandLogo linkTo="/" variant="light" className="mb-6" />
            <h2 className="text-3xl font-bold mb-3">{settings.site_name}</h2>
            <p className="text-white/85 text-lg max-w-md leading-relaxed">{settings.tagline || 'Literatura que edifica e transforma'}</p>
            <div className="mt-8 flex flex-wrap gap-4 text-sm text-white/70">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Compra segura</span>
              <span className="flex items-center gap-1.5"><Server className="h-4 w-4" /> Encomendas em tempo real</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center p-6 sm:p-10 bg-linear-to-b from-muted/30 to-background">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <div className="mb-6 lg:hidden flex justify-center"><BrandLogo /></div>

            <div className="rounded-2xl border bg-card/80 backdrop-blur-xs shadow-xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {mode === 'login' ? 'Aceda à sua conta de cliente ou administrador.' : 'Registe-se em segundos.'}
                  </p>
                </div>
              </div>

              <AuthForm
                initialMode={mode}
                defaultEmail={defaultEmail}
                remembered={remembered}
                autoFocus
                returnPath={redirectTo || '/profile'}
                onModeChange={setMode}
                onDone={afterAuthNavigate}
              />
            </div>

            <div className="flex flex-wrap justify-center gap-4 mt-6 text-xs text-muted-foreground">
              <Link to="/track" className="block py-2 hover:text-primary">Rastrear encomenda</Link>
              <Link to="/shop" className="block py-2 hover:text-primary">Ir à loja</Link>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;
