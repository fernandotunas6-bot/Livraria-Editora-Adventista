import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminViewNav, useReportViewBadges, useSectionView } from '@/components/admin/shell/AdminViewNav';
import { Spinner } from '@/components/admin/igreja/registryUi';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useSignal } from '@/hooks/useSignal';
import { adminPermissions } from '@/lib/adminSections';
import { keepUnchanged } from '@/lib/keepUnchanged';
import { loadProduction } from '@/lib/productionApi';
import { orderOverdue, pendingStages, supplierBalances, todayLuanda } from '@/lib/production';
import { kwanza } from '@/lib/money';
import OrdersPanel from './OrdersPanel';
import StagesPanel from './StagesPanel';
import SuppliersPanel from './SuppliersPanel';
import SupplierAccountsPanel from './SupplierAccountsPanel';

/**
 * Produção da Editora: ordens de produção (etapas, responsáveis, prazos, custos; concluir põe a
 * tiragem no stock), as etapas de todas as ordens por prazo, os fornecedores e o que se lhes deve.
 * Quem gere a produção altera; as finanças lêem e registam os pagamentos aos fornecedores.
 */
export default function ProducaoTab() {
  const { isAdmin, hasPermission } = useAuth();
  const perms = useMemo(() => adminPermissions({ isAdmin, hasPermission }), [isAdmin, hasPermission]);
  const canEdit = perms.production;
  const canPay = perms.finance;
  const { toast } = useToast();
  const sv = useSectionView('producao', { perms });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setData(await loadProduction());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // Em tempo real: o que um colega muda (uma etapa feita, um custo, um pagamento, um responsável
  // novo, um produto) aparece logo, sem apagar o que está a ser escrito — as partes iguais ficam
  // com o mesmo objecto. Sem o canal ligado, volta a ler de minuto a minuto (de 5 em 5 com ele).
  const reloadQuietly = useCallback(async () => {
    try {
      const fresh = await loadProduction();
      setData((prev) => keepUnchanged(prev, fresh));
    } catch {
      // fica o que está à vista
    }
  }, []);
  const live = useSignal('painel', ['producao', 'funcionarios', 'catalogo'], reloadQuietly);
  useAutoRefresh(reloadQuietly, { intervalMs: live ? 5 * 60_000 : 60_000 });

  /** Corre uma operação, avisa do resultado e volta a ler. `quiet`: sem aviso quando corre bem. */
  const run = useCallback(async (fn, success, { quiet = false } = {}) => {
    try {
      const out = await fn();
      if (!quiet) toast({ title: typeof out === 'string' ? out : (success || 'Feito.') });
      await reload();
      return true;
    } catch (err) {
      toast({ title: 'Não foi possível', description: err.message, variant: 'destructive' });
      return false;
    }
  }, [toast, reload]);

  const today = todayLuanda();
  const summary = useMemo(() => {
    if (!data) return null;
    const open = data.orders.filter((o) => o.status === 'planeada' || o.status === 'em_curso');
    const pending = pendingStages({ orders: data.orders, stages: data.stages, staff: data.staff, today });
    const owed = supplierBalances(data.suppliers, data.costs, data.payments).reduce((t, r) => t + Math.max(r.balance, 0), 0);
    return {
      open: open.length,
      lateOrders: open.filter((o) => orderOverdue(o, today)).length,
      lateStages: pending.filter((p) => p.overdue).length,
      owed,
    };
  }, [data, today]);

  const viewBadges = summary ? {
    ordens: { count: summary.lateOrders, tone: 'warning' },
    etapas: { count: summary.lateStages, tone: 'warning' },
  } : {};
  useReportViewBadges(sv, viewBadges);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <p className="font-semibold">Não foi possível abrir a produção.</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Tentar de novo</Button>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const props = { data, canEdit, canPay, run, today };
  return (
    <div>
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui os números e as acções. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{summary.open}</strong> {summary.open === 1 ? 'ordem aberta' : 'ordens abertas'}
          {summary.lateStages > 0 && <> · <strong className="font-semibold text-amber-700 dark:text-amber-400">{summary.lateStages}</strong> {summary.lateStages === 1 ? 'etapa atrasada' : 'etapas atrasadas'}</>}
          {summary.owed > 0 && <> · <strong className="font-semibold text-foreground">{kwanza(summary.owed)}</strong> por pagar a fornecedores</>}
        </p>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>
      <AdminViewNav state={sv} badges={viewBadges} />
      {sv.view === 'ordens' && <OrdersPanel {...props} />}
      {sv.view === 'etapas' && <StagesPanel {...props} />}
      {sv.view === 'fornecedores' && <SuppliersPanel {...props} />}
      {sv.view === 'contas' && <SupplierAccountsPanel {...props} />}
    </div>
  );
}
