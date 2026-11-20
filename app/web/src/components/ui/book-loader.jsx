// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Indicador de carregamento da loja: três barras com a proporção de livros de pé.
 *
 * Substitui o círculo a girar nos sítios onde se espera por livros. Anima só `transform`,
 * por isso não custa mais do que o círculo, e com movimento reduzido fica quieto em alturas
 * diferentes — continua a ler-se como indicador sem nada a mexer.
 *
 * `role="status"` com `aria-label`: quem usa leitor de ecrã ouve o que se está a passar,
 * em vez de um elemento sem nome nenhum.
 */
const BookLoader = React.forwardRef(({ className, label = 'A carregar', ...props }, ref) => (
  <span
    ref={ref}
    role="status"
    aria-label={label}
    className={cn('book-loader text-primary', className)}
    {...props}
  >
    <span /><span /><span />
  </span>
));
BookLoader.displayName = 'BookLoader';

export { BookLoader };
