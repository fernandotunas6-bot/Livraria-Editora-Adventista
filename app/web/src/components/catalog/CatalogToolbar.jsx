// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useId } from 'react';
import { Layers, LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SORT_OPTIONS } from '@/lib/productSort';

/**
 * Barra de ferramentas do catálogo: contagem, filtros, vista, ordenação e agrupamento.
 *
 * Uma barra só para a loja, as categorias e as colecções. Antes cada página montava a sua: a
 * loja tinha cinco critérios de ordenação, duas vistas e a contagem; a página de categoria
 * tinha três critérios, sem vista nem contagem — e os dois chamavam "Novidades" a ordens
 * opostas. Com a barra partilhada, o critério que se escolhe numa página significa o mesmo na
 * outra, e o que se acrescenta aqui aparece nas três.
 */
export default function CatalogToolbar({
  total,
  shownFrom,
  shownTo,
  shownCount,
  noun = 'produto',
  nounPlural = 'produtos',
  sortBy,
  onSortChange,
  viewMode = null,
  onViewModeChange = null,
  grouped = false,
  onGroupedChange = null,
  canGroup = false,
  filterCount = 0,
  onOpenFilters = null,
  className = '',
}) {
  // `useId` porque a loja monta a barra duas vezes (lado e telemóvel): ids repetidos fazem o
  // rótulo apontar para o campo errado.
  const sortId = useId();
  const mostraIntervalo = Number.isFinite(shownTo) && total > (shownCount ?? shownTo ?? 0);

  return (
    // No telemóvel, os controlos numa linha só — Filtros, a ordem e o tipo — e o total por baixo,
    // em letra pequena. Filtros, total, tipo e ordem lado a lado não cabiam em 360 px: partiam-se
    // em duas linhas desequilibradas, com um vazio à esquerda (revisão de estilo de 2026-11-27).
    // A ordenação estica para ocupar o que sobra. Para isso, no telemóvel o grupo da esquerda
    // desfaz-se (`contents`) e o total vai para o fim (`order-last`), a toda a largura. A troca
    // grelha/lista e o "a mostrar 1–24" ficam do `sm` para cima; no telemóvel é a grelha.
    <div className={`flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-xs sm:justify-between sm:gap-3 sm:p-4 ${className}`}>
      <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-2 sm:flex-wrap">
        {onOpenFilters && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-11 sm:h-9 lg:hidden" onClick={onOpenFilters}>
                <SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" />
                Filtros {filterCount > 0 && `(${filterCount})`}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Filtrar catálogo</TooltipContent>
          </Tooltip>
        )}
        <p className="order-last basis-full whitespace-nowrap text-xs text-muted-foreground sm:order-none sm:basis-auto sm:text-sm" aria-live="polite">
          <strong className="text-foreground">{total}</strong>
          {` ${total === 1 ? noun : nounPlural}`}
          {mostraIntervalo && <span className="hidden sm:inline">{` · a mostrar ${shownFrom}–${shownTo}`}</span>}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:ml-auto sm:flex-none sm:shrink-0 sm:flex-wrap">
        {canGroup && onGroupedChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={grouped ? 'secondary' : 'outline'}
                size="sm"
                className="order-last h-11 w-11 shrink-0 px-0 sm:order-none sm:h-9 sm:w-auto sm:px-3"
                onClick={() => onGroupedChange(!grouped)}
                aria-pressed={grouped}
                aria-label="Por tipo"
              >
                <Layers className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                {/* No telemóvel só o ícone, para a barra caber numa linha; o nome fica no aria-label. */}
                <span className="hidden sm:inline">Por tipo</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {grouped ? 'Voltar a uma lista única' : 'Separar livros, materiais e vestuário'}
            </TooltipContent>
          </Tooltip>
        )}

        {viewMode && onViewModeChange && (
          <div className="hidden overflow-hidden rounded-lg border sm:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-11 w-11 rounded-none sm:h-9 sm:w-9"
                  onClick={() => onViewModeChange('grid')}
                  aria-label="Visualização em grelha"
                  aria-pressed={viewMode === 'grid'}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Visualização em grelha</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-11 w-11 rounded-none sm:h-9 sm:w-9"
                  onClick={() => onViewModeChange('list')}
                  aria-label="Visualização em lista"
                  aria-pressed={viewMode === 'list'}
                >
                  <List className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Visualização em lista</TooltipContent>
            </Tooltip>
          </div>
        )}

        <label htmlFor={sortId} className="sr-only">Ordenar por</label>
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger id={sortId} className="h-11 w-full min-w-0 flex-1 sm:h-9 sm:w-[170px] sm:flex-none" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
