import React from 'react';

/**
 * Leva o foco para o conteúdo principal da página (o primeiro `<main>`). Devolve `false` se a
 * página não tiver nenhum — aí o link segue o comportamento normal da âncora.
 *
 * O `tabindex="-1"` deixa o `<main>` receber o foco por código sem entrar na ordem do Tab.
 */
export function focusMainContent(doc = typeof document !== 'undefined' ? document : null) {
  const main = doc?.querySelector('main');
  if (!main) return false;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
  main.scrollIntoView?.({ block: 'start' });
  return true;
}

/**
 * "Saltar para o conteúdo" (WCAG 2.4.1, nível A). Quem navega pelo teclado ou por um leitor
 * de ecrã passava, em cada página, pela faixa de aviso, o logótipo, a pesquisa, o menu, a
 * conta e o carrinho antes de chegar ao livro. É o primeiro elemento focável da loja e só se
 * vê quando recebe o foco. O painel tem o seu (AdminShell).
 *
 * Foca o `<main>` em vez de mudar o endereço para `#conteudo`: assim serve a todas as páginas
 * sem um id em cada uma, e o histórico do navegador não ganha uma entrada a mais.
 */
export default function SkipToContent() {
  return (
    <a
      href="#conteudo"
      onClick={(e) => {
        if (focusMainContent()) e.preventDefault();
      }}
      className="sr-only z-60 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
    >
      Saltar para o conteúdo
    </a>
  );
}
