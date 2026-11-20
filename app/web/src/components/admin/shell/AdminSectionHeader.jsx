// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { forwardRef } from 'react';

/**
 * Cabeçalho de cada secção, igual em todas: o grupo, o título, o que a secção faz e, à direita,
 * as acções da secção (quando as há). Antes cada separador desenhava o seu, em cinco tamanhos
 * diferentes, e alguns não tinham nenhum.
 *
 * O título recebe o foco ao mudar de secção (sem moldura), para quem navega pelo teclado ou com
 * leitor de ecrã saber logo onde está.
 *
 * Numa vista (Colportagem › Contas), o título é o da vista e por cima fica "Grupo › Secção":
 * com a barra lateral aberta, a linha das vistas não aparece, e é o título que diz onde se está.
 */
const AdminSectionHeader = forwardRef(function AdminSectionHeader({ section, view = null, actions }, ref) {
  if (!section) return null;
  const eyebrow = view ? [section.groupLabel, section.label].filter(Boolean).join(' › ') : section.groupLabel;
  const title = view ? view.title || view.label : section.title;
  const description = view?.description || section.description;
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
        )}
        <h1 ref={ref} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-foreground focus:outline-hidden md:text-[1.75rem]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
});

export default AdminSectionHeader;
