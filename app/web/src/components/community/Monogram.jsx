// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React from 'react';
import { initials } from '@/lib/communityText';
import { monogramColor } from '@/lib/communityStyle';

const SIZES = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
};

/**
 * Monograma do leitor: as iniciais sobre uma cor fixa da paleta editorial (a mesma pessoa tem
 * sempre a mesma cor). Não há fotografia: o endereço dela tem o id da conta.
 */
export default function Monogram({ name, authorKey, size = 'md', staff = false }) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size] || SIZES.md} grid shrink-0 place-items-center rounded-full font-serif font-semibold text-white ${staff ? 'ring-2 ring-editorial-ouro ring-offset-2 ring-offset-editorial-papel' : ''}`}
      style={{ backgroundColor: monogramColor(authorKey || name) }}
    >
      {initials(name)}
    </span>
  );
}
