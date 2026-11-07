import { useEffect, useState } from 'react';

// A página está presa? Um painel (carrinho, filtros), uma folha de baixo ou o chat em ecrã
// inteiro bloqueiam o deslocamento da página enquanto estão abertos. O botão "Voltar ao topo"
// esconde-se aí: por cima do chat aberto no telemóvel ficava sobre as mensagens (z-50 sobre
// z-45), e numa página que não se desloca não tem nada para fazer.
//
// Lê o que cada um deixa no documento, sem precisar de saber quem abriu: os painéis do Radix e
// as folhas do vaul marcam o `body` com `data-scroll-locked`; o chat põe `overflow: hidden`.

export function isPageScrollLocked(doc = typeof document !== 'undefined' ? document : null) {
  const body = doc?.body;
  if (!body) return false;
  if (body.hasAttribute('data-scroll-locked')) return true;
  return body.style.overflow === 'hidden' || doc.documentElement.style.overflow === 'hidden';
}

export function usePageScrollLocked() {
  const [locked, setLocked] = useState(() => isPageScrollLocked());

  useEffect(() => {
    if (typeof MutationObserver !== 'function') return undefined;
    const update = () => setLocked(isPageScrollLocked());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'data-scroll-locked'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    update();
    return () => observer.disconnect();
  }, []);

  return locked;
}
