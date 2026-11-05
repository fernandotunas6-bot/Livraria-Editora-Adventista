import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Search, ShoppingCart, User } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHideOnScroll } from '@/hooks/useHideOnScroll';
import { activeTab, bottomNavVisible, requestCartOpen, requestHeaderSearch } from '@/lib/mobileNav';
import { cn } from '@/lib/utils';

const MobileCategoriesSheet = lazy(() => import('@/components/MobileCategoriesSheet'));

// Altura visível da barra (sem a área segura). Os flutuantes (chat, subir ao topo, avisos,
// instalar a app) somam-na pela variável --barra-navegacao, como já fazem com a barra de
// compra; ver index.css.
const ALTURA = 56;

/**
 * Navegação inferior do telemóvel: Início, Categorias, Pesquisar, Carrinho, Conta.
 * Só abaixo de 768 px, e fora da ficha do livro (que tem a sua barra de compra) e dos ecrãs
 * de tarefa. Não substitui nada: o cabeçalho continua igual; isto é um atalho ao alcance do
 * polegar enquanto se percorre o catálogo.
 */
export default function MobileBottomNav() {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const { cartItems } = useCart();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // A folha só é descarregada na primeira vez que se abre, e depois fica montada (para a
  // animação de fechar funcionar).
  const [sheetUsed, setSheetUsed] = useState(false);
  const visible = isMobile && bottomNavVisible(pathname);
  const tab = activeTab(pathname);
  // Desce → sai de cena e deixa o ecrã todo para os livros; sobe → volta. Com a folha das
  // categorias aberta fica sempre.
  const hidden = useHideOnScroll(visible && !categoriesOpen);
  const cartCount = cartItems.reduce((n, item) => n + (item.quantity || 0), 0);

  useEffect(() => {
    const raiz = document.documentElement;
    // --barra-navegacao: a altura que se vê (os flutuantes já somam a área segura à parte).
    // --barra-navegacao-total: com a área segura, para o fim da página e para os avisos.
    // Escondida, os flutuantes (chat, subir ao topo) descem com ela; o espaço no fim da página
    // (--barra-navegacao-total) fica, para o conteúdo não saltar.
    raiz.style.setProperty('--barra-navegacao', visible && !hidden ? `${ALTURA}px` : '0px');
    raiz.style.setProperty('--barra-navegacao-total', visible ? `calc(${ALTURA}px + env(safe-area-inset-bottom, 0px))` : '0px');
    return () => {
      raiz.style.setProperty('--barra-navegacao', '0px');
      raiz.style.setProperty('--barra-navegacao-total', '0px');
    };
  }, [visible, hidden]);

  useEffect(() => { setCategoriesOpen(false); }, [pathname]);

  if (!visible) return null;

  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-fast';
  const cor = (activo) => (activo ? 'text-primary' : 'text-muted-foreground hover:text-foreground');

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className={cn(
          'safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden',
          hidden && 'translate-y-full',
        )}
      >
        <div className="flex items-stretch" style={{ height: ALTURA }}>
          <Link to="/" className={cn(item, cor(tab === 'inicio'))} aria-current={tab === 'inicio' ? 'page' : undefined}>
            <Home className="h-5 w-5" aria-hidden="true" />
            Início
          </Link>
          <button type="button" className={cn(item, cor(tab === 'categorias' || categoriesOpen))} onClick={() => { setSheetUsed(true); setCategoriesOpen(true); }} aria-haspopup="dialog">
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            Categorias
          </button>
          <button type="button" className={cn(item, cor(false))} onClick={requestHeaderSearch}>
            <Search className="h-5 w-5" aria-hidden="true" />
            Pesquisar
          </button>
          <button
            type="button"
            className={cn(item, cor(false))}
            onClick={() => { if (!requestCartOpen()) window.location.assign('/shop'); }}
            aria-label={`Carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}
          >
            <span className="relative">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-1.5 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-[1.1rem] text-primary-foreground tabular-nums">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </span>
            Carrinho
          </button>
          <Link to="/profile" className={cn(item, cor(tab === 'conta'))} aria-current={tab === 'conta' ? 'page' : undefined}>
            <User className="h-5 w-5" aria-hidden="true" />
            Conta
          </Link>
        </div>
      </nav>
      {sheetUsed && (
        <Suspense fallback={null}>
          <MobileCategoriesSheet open={categoriesOpen} onOpenChange={setCategoriesOpen} />
        </Suspense>
      )}
    </>
  );
}
