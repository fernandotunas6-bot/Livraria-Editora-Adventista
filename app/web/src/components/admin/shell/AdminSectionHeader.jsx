import React, { forwardRef } from 'react';

/**
 * Cabeçalho de cada secção, igual em todas: o grupo, o título, o que a secção faz e, à direita,
 * as acções da secção (quando as há). Antes cada separador desenhava o seu, em cinco tamanhos
 * diferentes, e alguns não tinham nenhum.
 *
 * O título recebe o foco ao mudar de secção (sem moldura), para quem navega pelo teclado ou com
 * leitor de ecrã saber logo onde está.
 */
const AdminSectionHeader = forwardRef(function AdminSectionHeader({ section, actions }, ref) {
  if (!section) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {section.groupLabel && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.groupLabel}</p>
        )}
        <h1 ref={ref} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-foreground focus:outline-none md:text-[1.75rem]">
          {section.title}
        </h1>
        {section.description && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{section.description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
});

export default AdminSectionHeader;
