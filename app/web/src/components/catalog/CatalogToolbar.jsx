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
    // No telemóvel, os botões numa linha só (Filtros, «Por tipo» e a ordenação) e a contagem por
    // baixo: com o «Por tipo», Filtros + contagem + ordenação já não cabiam em 360 px, e a barra
    // partia-se em duas linhas tortas, com um vazio à esquerda (revisão do estilo de 27/11). O
    // grupo da esquerda é `contents` no telemóvel, para a contagem poder ir para o fim
    // (`order-last`, a toda a largura); do `sm` para cima volta a ser um grupo, como antes. A troca
    // grelha/lista e o "a mostrar 1–24" ficam do `sm` para cima. Num ecrã de 320 px, a ordenação
    // desce para outra linha.
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-xs sm:flex-wrap sm:gap-3 sm:p-4 ${className}`}>
      <div className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-2">
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
        <p className="order-last w-full whitespace-nowrap text-sm text-muted-foreground sm:order-none sm:w-auto" aria-live="polite">
          <strong className="text-foreground">{total}</strong>
          {` ${total === 1 ? noun : nounPlural}`}
          {mostraIntervalo && <span className="hidden sm:inline">{` · a mostrar ${shownFrom}–${shownTo}`}</span>}
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center justify-end gap-2 sm:flex-wrap">
        {canGroup && onGroupedChange && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={grouped ? 'secondary' : 'outline'}
                size="sm"
                className="h-11 w-11 px-0 sm:h-9 sm:w-auto sm:px-3"
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
          <SelectTrigger id={sortId} className="h-11 w-[132px] sm:h-9 sm:w-[170px]" aria-label="Ordenar por">
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
