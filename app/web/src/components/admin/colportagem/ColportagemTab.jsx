import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Inbox, Link2, Percent, RefreshCw, Scale, Settings2, TrendingUp, Truck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { indexRegistry, loadRegistry } from '@/lib/churchRegistryApi';
import { loadBooksForColportage, loadColporteurAdmin, loadOperations } from '@/lib/colporteurApi';
import { Spinner } from '@/components/admin/igreja/registryUi';
import ColporteursPanel from './ColporteursPanel';
import CommissionPanel from './CommissionPanel';
import { LinksPanel, SettingsPanel } from './SettingsPanel';
import ReportsPanel from './ReportsPanel';
import GuidesPanel from './GuidesPanel';
import { AccountsPanel, ReclassPanel } from './AccountsPanel';
import SummaryPanel from './SummaryPanel';

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
  // Sem escolha: abre nas candidaturas quando há alguma por decidir, senão no resumo.
  const [tab, setTab] = useState(null);

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

  const pending = data.colporteurs.filter((c) => c.status === 'candidatura' || c.status === 'em_analise').length;
  const active = data.colporteurs.filter((c) => c.status === 'activo').length;
  const props = { data, reg, idx, run };
  const opsProps = { data, ops, books, run };
  const needsOps = (node) => (ops ? node : (
    <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{opsError || 'A carregar…'}</p>
  ));
  const toValidate = ops ? ops.reports.filter((r) => r.status === 'enviado').length : 0;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Colportagem</h2>
          <p className="text-sm text-muted-foreground">{active} colportores activos · {pending} candidaturas por decidir</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>
      <Tabs value={tab ?? (pending > 0 ? 'candidaturas' : 'resumo')} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="resumo"><BarChart3 className="mr-1.5 h-4 w-4" />Resumo</TabsTrigger>
          <TabsTrigger value="candidaturas"><Inbox className="mr-1.5 h-4 w-4" />Candidaturas{pending > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{pending}</span>}</TabsTrigger>
          <TabsTrigger value="colportores"><Users className="mr-1.5 h-4 w-4" />Colportores ({active})</TabsTrigger>
          <TabsTrigger value="relatorios"><ClipboardList className="mr-1.5 h-4 w-4" />Relatórios{toValidate > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{toValidate}</span>}</TabsTrigger>
          <TabsTrigger value="guias"><Truck className="mr-1.5 h-4 w-4" />Guias e stock</TabsTrigger>
          <TabsTrigger value="contas"><Scale className="mr-1.5 h-4 w-4" />Contas</TabsTrigger>
          <TabsTrigger value="reclassificacao"><TrendingUp className="mr-1.5 h-4 w-4" />Reclassificação</TabsTrigger>
          <TabsTrigger value="percentagens"><Percent className="mr-1.5 h-4 w-4" />Percentagens</TabsTrigger>
          <TabsTrigger value="links"><Link2 className="mr-1.5 h-4 w-4" />Links</TabsTrigger>
          <TabsTrigger value="definicoes"><Settings2 className="mr-1.5 h-4 w-4" />Definições</TabsTrigger>
        </TabsList>
        <TabsContent value="resumo">{needsOps(<SummaryPanel {...opsProps} reg={reg} idx={idx} />)}</TabsContent>
        <TabsContent value="candidaturas"><ColporteursPanel mode="candidaturas" {...props} /></TabsContent>
        <TabsContent value="colportores"><ColporteursPanel mode="colportores" {...props} /></TabsContent>
        <TabsContent value="relatorios">{needsOps(<ReportsPanel {...opsProps} />)}</TabsContent>
        <TabsContent value="guias">{needsOps(<GuidesPanel {...opsProps} />)}</TabsContent>
        <TabsContent value="contas">{needsOps(<AccountsPanel {...opsProps} />)}</TabsContent>
        <TabsContent value="reclassificacao">{needsOps(<ReclassPanel {...opsProps} />)}</TabsContent>
        <TabsContent value="percentagens"><CommissionPanel data={data} run={run} /></TabsContent>
        <TabsContent value="links"><LinksPanel reg={reg} idx={idx} /></TabsContent>
        <TabsContent value="definicoes"><SettingsPanel data={data} run={run} /></TabsContent>
      </Tabs>
    </div>
  );
}
