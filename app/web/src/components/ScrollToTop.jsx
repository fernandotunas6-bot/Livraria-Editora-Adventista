import { useLocation } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { FloatingScrollTop } from '@/components/ui/FloatingScrollTop';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { isFloatingHidden } from '@/lib/floatingButtons';

/** Scroll global da página + botão flutuante ao mudar de rota */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const { settings } = useSiteSettings();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  // O regresso ao topo ao mudar de página fica sempre; o botão segue a escolha do painel.
  if (isFloatingHidden('top', pathname, settings)) return null;
  // Na comunidade, no telemóvel, esse canto é do botão "Escrever" (a barra de temas colada ao
  // topo já faz de atalho para cima).
  const community = /^\/comunidade(\/|$)/.test(pathname);
  return <FloatingScrollTop mode="window" threshold={300} className={community ? 'max-md:hidden' : undefined} />;
};

export default ScrollToTop;
