import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { withCacheBust } from '@/lib/imageUrl';
import { ENGAGE_AFTER_MS, ENGAGE_SCROLL_PX, installPromptAllowed, installPromptCoversHero, installPromptOffsets } from '@/lib/installPrompt';

export default function PwaInstallBanner() {
  const { settings } = useSiteSettings();
  const { pathname } = useLocation();
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('pwa-dismissed') === '1'; } catch { return false; }
  });
  const [isStandalone, setIsStandalone] = useState(false);
  // Só depois de a pessoa mostrar interesse: deslizar um pouco ou ficar uns segundos.
  const [engaged, setEngaged] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (engaged || !deferred) return undefined;
    const onScroll = () => { if (window.scrollY > ENGAGE_SCROLL_PX) setEngaged(true); };
    const timer = setTimeout(() => setEngaged(true), ENGAGE_AFTER_MS);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [engaged, deferred]);

  // No topo da página inicial o aviso fica à espera (ver installPromptCoversHero).
  const [overHero, setOverHero] = useState(() => installPromptCoversHero(pathname, window.scrollY));
  useEffect(() => {
    const measure = () => setOverHero(installPromptCoversHero(pathname, window.scrollY));
    measure();
    if (pathname !== '/') return undefined;
    window.addEventListener('scroll', measure, { passive: true });
    return () => window.removeEventListener('scroll', measure);
  }, [pathname]);

  const visible = !!settings.pwa_enabled && !dismissed && !isStandalone && !!deferred && engaged && !overHero
    && installPromptAllowed(pathname);

  // A altura do aviso vai para variáveis de CSS, e o chat e o botão de subir afastam-se dele
  // (ver installPromptOffsets e index.css). Antes ficavam por baixo.
  useEffect(() => {
    const raiz = document.documentElement;
    const aplicar = () => {
      const el = boxRef.current;
      const { full, right } = installPromptOffsets(visible && el ? el.offsetHeight + 12 : 0, window.innerWidth);
      raiz.style.setProperty('--aviso-instalar', full);
      raiz.style.setProperty('--aviso-instalar-direita', right);
    };
    aplicar();
    if (!visible) return undefined;
    window.addEventListener('resize', aplicar);
    return () => {
      window.removeEventListener('resize', aplicar);
      raiz.style.setProperty('--aviso-instalar', '0px');
      raiz.style.setProperty('--aviso-instalar-direita', '0px');
    };
  }, [visible]);

  if (!visible) return null;

  const logoUrl = settings.logo_url
    ? withCacheBust(settings.logo_url, settings.assets_version)
    : '';

  const install = async () => {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setDeferred(null);
  };

  const dismiss = () => {
    try { localStorage.setItem('pwa-dismissed', '1'); } catch { /* sem armazenamento: só nesta visita */ }
    setDismissed(true);
  };

  return (
    // Telemóvel: uma linha compacta (ícone, texto, Instalar, fechar). Desktop: o cartão de sempre.
    // z-40: acima do conteúdo e abaixo de painéis e janelas (z-50). Em z-50, por vir depois no
    // DOM, ficava por cima do carrinho aberto e tapava o botão de finalizar a compra.
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Instalar a aplicação"
      className="fixed safe-float-bottom [--float-gap:0.75rem] left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm z-40 bg-card border shadow-xl rounded-2xl p-3 sm:p-4 flex gap-3 items-center sm:items-start animate-in slide-in-from-bottom-4"
    >
      <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-marca/10 flex items-center justify-center shrink-0 overflow-hidden">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          <Download className="h-5 w-5 text-primary" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Instalar App</p>
        <p className="text-xs text-muted-foreground truncate sm:whitespace-normal sm:mb-2">
          Adicione {settings.site_name || settings.pwa_short_name || 'a Livraria Adventista'} ao ecrã inicial
        </p>
        <Button size="sm" className="btn-primary h-8 hidden sm:inline-flex" onClick={install}>Instalar</Button>
      </div>
      <Button size="sm" className="btn-primary h-9 shrink-0 sm:hidden" onClick={install}>Instalar</Button>
      <button
        type="button"
        onClick={dismiss}
        className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Fechar o aviso de instalação"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
