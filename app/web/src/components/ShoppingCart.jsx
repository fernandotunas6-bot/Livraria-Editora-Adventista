import React, { Suspense, lazy, useEffect, useState } from 'react';
import { OPEN_CART_EVENT } from '@/lib/mobileNav';
import { useAfterLoad } from '@/hooks/useAfterLoad';

// O carrinho com o checkout (morada de Angola, telefone, assinatura, pagamentos…) é o maior
// componente da loja. Ia com todas as páginas que o têm — 23 —, antes da primeira pintura:
// ~40 KB comprimidos só dele, mais o que importa (auditoria visual, A360-28). Agora:
//   - só se descarrega depois de a página carregar e de o navegador ficar livre, a tempo de
//     estar pronto quando a pessoa tocar no carrinho;
//   - se a pessoa o abrir antes disso, descarrega-se nesse momento.
const loadPanel = () => import('@/components/ShoppingCartPanel.jsx');
const ShoppingCartPanel = lazy(loadPanel);

/**
 * O mesmo componente de sempre para as páginas (`isCartOpen`, `setIsCartOpen`). Fechado e
 * nunca aberto, não desenha nada: a única coisa que faz é responder ao pedido da barra inferior
 * do telemóvel, que abre o carrinho por evento (lib/mobileNav.js).
 */
export default function ShoppingCart({ isCartOpen, setIsCartOpen }) {
  const [wanted, setWanted] = useState(Boolean(isCartOpen));
  const afterLoad = useAfterLoad({ maxWaitMs: 5000 });

  useEffect(() => {
    if (isCartOpen) setWanted(true);
  }, [isCartOpen]);

  // Descarrega o painel em segundo plano, sem o montar.
  useEffect(() => {
    if (afterLoad && !wanted) loadPanel().catch(() => {});
  }, [afterLoad, wanted]);

  // Até o painel existir, é este que responde à barra inferior; depois responde o painel.
  useEffect(() => {
    if (wanted) return undefined;
    const abrir = (e) => {
      if (e.detail) e.detail.handled = true;
      setWanted(true);
      setIsCartOpen(true);
    };
    window.addEventListener(OPEN_CART_EVENT, abrir);
    return () => window.removeEventListener(OPEN_CART_EVENT, abrir);
  }, [wanted, setIsCartOpen]);

  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <ShoppingCartPanel isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
    </Suspense>
  );
}
