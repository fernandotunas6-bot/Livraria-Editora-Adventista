// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useLocation } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { FloatingScrollTop } from '@/components/ui/FloatingScrollTop';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { isFloatingHidden } from '@/lib/floatingButtons';
import { usePageScrollLocked } from '@/hooks/usePageScrollLocked';
import { cn } from '@/lib/utils';

/** Scroll global da página + botão flutuante ao mudar de rota */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const { settings } = useSiteSettings();
  // Com o chat em ecrã inteiro, o carrinho ou uma folha abertos, a página não se desloca: o
  // botão sai de cena em vez de ficar por cima deles.
  const locked = usePageScrollLocked();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  // O regresso ao topo ao mudar de página fica sempre; o botão segue a escolha do painel.
  if (isFloatingHidden('top', pathname, settings)) return null;
  // Na comunidade, no telemóvel, esse canto é do botão "Escrever" (a barra de temas colada ao
  // topo já faz de atalho para cima).
  const community = /^\/comunidade(\/|$)/.test(pathname);
  return <FloatingScrollTop mode="window" threshold={300} className={cn(community && 'max-md:hidden', locked && 'hidden')} />;
};

export default ScrollToTop;
