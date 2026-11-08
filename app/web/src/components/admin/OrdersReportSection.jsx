import React, { Suspense, lazy, useState } from 'react';
import { BarChart3, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SalesReportsPanel = lazy(() => import('@/components/admin/SalesReportsPanel'));
const KEY = 'livraria_admin_relatorio_encomendas';

const readOpen = () => {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

/**
 * Os relatórios de vendas (gráficos, totais por mês e por estado, exportação para Excel), por
 * baixo da lista de encomendas e fechados por omissão.
 *
 * Estavam no topo do separador: quem abria "Encomendas" para tratar a fila tinha de passar por
 * filtros, oito cartões de totais, dois gráficos e duas tabelas — a primeira encomenda aparecia a
 * mais de 1 800 px. Quem os usa abre-os uma vez: o navegador lembra-se. Fechados, nem se carregam
 * (os gráficos são a parte mais pesada do painel).
 */
export default function OrdersReportSection({ orders }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* sem armazenamento */ }
      return !v;
    });
  };

  return (
    <section className="mt-8 rounded-xl border bg-card" aria-labelledby="relatorio-encomendas">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="relatorio-encomendas-corpo"
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BarChart3 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span id="relatorio-encomendas" className="block font-semibold text-foreground">Relatórios de vendas</span>
          <span className="block text-xs text-muted-foreground">Gráficos, totais por mês e por estado, e exportação para Excel</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id="relatorio-encomendas-corpo" className="border-t p-4">
          <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="A carregar os relatórios" /></div>}>
            <SalesReportsPanel orders={orders} />
          </Suspense>
        </div>
      )}
    </section>
  );
}
