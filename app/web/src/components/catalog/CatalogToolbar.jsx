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
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
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
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <strong className="text-foreground">{total}</strong>
          {` ${total === 1 ? noun : nounPlural}`}
          {mostraIntervalo && ` · a mostrar ${shownFrom}–${shownTo}`}
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {canGroup && onGroupedChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={grouped ? 'secondary' : 'outline'}
                size="sm"
                className="h-11 sm:h-9"
                onClick={() => onGroupedChange(!grouped)}
                aria-pressed={grouped}
              >
                <Layers className="mr-1 h-4 w-4" aria-hidden="true" />
                Por tipo
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {grouped ? 'Voltar a uma lista única' : 'Separar livros, materiais e vestuário'}
            </TooltipContent>
          </Tooltip>
        )}

        {viewMode && onViewModeChange && (
          <div className="flex overflow-hidden rounded-lg border">
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
          <SelectTrigger id={sortId} className="h-11 w-[170px] sm:h-9" aria-label="Ordenar por">
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
