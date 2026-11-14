import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminViewNav, useReportViewBadges, useSectionView } from '@/components/admin/shell/AdminViewNav';
import { useSignal } from '@/hooks/useSignal';
import { useToast } from '@/hooks/use-toast';
import { indexRegistry, loadRegistry } from '@/lib/churchRegistryApi';
import { loadBooksForColportage, loadColporteurAdmin, loadDeliveriesBoard, loadOperations } from '@/lib/colporteurApi';
import { Spinner } from '@/components/admin/igreja/registryUi';
import ColporteursPanel from './ColporteursPanel';
import CommissionPanel from './CommissionPanel';
import { LinksPanel, SettingsPanel } from './SettingsPanel';
import ReportsPanel from './ReportsPanel';
import InterestsPanel from './InterestsPanel';
import GuidesPanel from './GuidesPanel';
import { AccountsPanel, ReclassPanel } from './AccountsPanel';
import SummaryPanel from './SummaryPanel';
import DeliveriesPanel, { countToPrepare } from './DeliveriesPanel';
import ReviewsPanel from './ReviewsPanel';

const EMPTY_REG = { fields: [], districts: [], churches: [], pastors: [], assignments: [], provinces: [], municipalities: [] };

/** Colportagem: candidaturas, colportores, percentagens, definições e links de candidatura. */
export default function ColportagemTab() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [reg, setReg] = useState(EMPTY_REG);
  const [error, setError] = useState('');
  // Guias, relatórios e contas (migração 20261107102000). Se faltar, o resto funciona na mesma.
  const [ops, setOps] = useState(null);
  const [opsError, setOpsError] = useState('');
  const [books, setBooks] = useState([]);
  // As vistas (Resumo, Candidaturas, Contas…) vêm do registo do painel e a aberta do endereço
  // (/admin?tab=colportagem&vista=contas). Sem escolha: abre nas candidaturas quando há alguma
  // por decidir, senão no resumo.
  const sv = useSectionView('colportagem');

  const reload = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([loadColporteurAdmin(), loadRegistry()]);
      setData(d);
      setReg(r);
      setError('');
      try {
        const [o, b] = await Promise.all([loadOperations(), loadBooksForColportage()]);
        setOps(o);
        setBooks(b);
        setOpsError('');
      } catch (err) {
        setOpsError(err.message);
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // O número na vista Entregas: os livros por preparar na loja, que pedem acção da equipa.
  const [toPrepare, setToPrepare] = useState(0);
  const loadToPrepare = useCallback(async () => {
    try {
      setToPrepare(countToPrepare((await loadDeliveriesBoard(7)).active));
    } catch { /* o número é só uma ajuda: sem ele, a vista abre na mesma */ }
  }, []);
  useEffect(() => { loadToPrepare(); }, [loadToPrepare]);
  useSignal('painel', ['entregas'], () => { loadToPrepare(); });

  const run = useCallback(async (fn, success) => {
    try {
      const out = await fn();
      toast({ title: typeof out === 'string' ? out : (success || 'Feito.') });
      await reload();
    } catch (err) {
      toast({ title: 'Não foi possível', description: err.message, variant: 'destructive' });
    }
  }, [toast, reload]);

  const idx = useMemo(() => indexRegistry(reg), [reg]);
  const pending = (data?.colporteurs || []).filter((c) => c.status === 'candidatura' || c.status === 'em_analise').length;
  const active = (data?.colporteurs || []).filter((c) => c.status === 'activo').length;
  const toValidate = ops ? ops.reports.filter((r) => r.status === 'enviado').length : 0;
  const { explicit, view: currentView, setView } = sv;
  useEffect(() => {
    if (data && !explicit && pending > 0 && currentView === 'resumo') setView('candidaturas', { replace: true });
  }, [data, explicit, pending, currentView, setView]);
  // Os números das vistas: o que pede acção (também na barra lateral) e os colportores activos.
  const viewBadges = {
    candidaturas: { count: pending, tone: 'warning' },
    relatorios: { count: toValidate, tone: 'warning' },
    entregas: { count: toPrepare, tone: 'warning' },
    colportores: { count: active, tone: 'count' },
  };
  useReportViewBadges(sv, viewBadges);
  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <p className="font-semibold">Não foi possível abrir a colportagem.</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Tentar de novo</Button>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const props = { data, reg, idx, run };
  const opsProps = { data, ops, books, run };
  const needsOps = (node) => (ops ? node : (
    <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{opsError || 'A carregar…'}</p>
  ));
  const view = !explicit && pending > 0 && currentView === 'resumo' ? 'candidaturas' : currentView;
  return (
    <div>
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui os números e as acções. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{active}</strong> colportores activos · <strong className="font-semibold text-foreground">{pending}</strong> candidaturas por decidir</p>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>
      <AdminViewNav state={sv} badges={viewBadges} />
      {view === 'resumo' && needsOps(<SummaryPanel {...opsProps} reg={reg} idx={idx} />)}
      {view === 'candidaturas' && <ColporteursPanel mode="candidaturas" {...props} />}
      {view === 'colportores' && <ColporteursPanel mode="colportores" {...props} />}
      {view === 'relatorios' && needsOps(<ReportsPanel {...opsProps} />)}
      {view === 'interessados' && needsOps(<InterestsPanel data={data} ops={ops} idx={idx} />)}
      {view === 'entregas' && <DeliveriesPanel onCount={setToPrepare} />}
      {view === 'guias' && needsOps(<GuidesPanel {...opsProps} />)}
      {view === 'contas' && needsOps(<AccountsPanel {...opsProps} />)}
      {view === 'reclassificacao' && needsOps(<ReclassPanel {...opsProps} />)}
      {view === 'avaliacoes' && <ReviewsPanel data={data} run={run} />}
      {view === 'percentagens' && <CommissionPanel data={data} run={run} />}
      {view === 'links' && <LinksPanel reg={reg} idx={idx} />}
      {view === 'definicoes' && <SettingsPanel data={data} run={run} />}
    </div>
  );
}
