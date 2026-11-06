import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, Link2, Percent, RefreshCw, Settings2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { indexRegistry, loadRegistry } from '@/lib/churchRegistryApi';
import { loadColporteurAdmin } from '@/lib/colporteurApi';
import { Spinner } from '@/components/admin/igreja/registryUi';
import ColporteursPanel from './ColporteursPanel';
import CommissionPanel from './CommissionPanel';
import { LinksPanel, SettingsPanel } from './SettingsPanel';

const EMPTY_REG = { fields: [], districts: [], churches: [], pastors: [], assignments: [], provinces: [], municipalities: [] };

/** Colportagem: candidaturas, colportores, percentagens, definições e links de candidatura. */
export default function ColportagemTab() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [reg, setReg] = useState(EMPTY_REG);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('candidaturas');

  const reload = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([loadColporteurAdmin(), loadRegistry()]);
      setData(d);
      setReg(r);
      setError('');
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
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Colportagem</h2>
          <p className="text-sm text-muted-foreground">{active} colportores activos · {pending} candidaturas por decidir</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="candidaturas"><Inbox className="mr-1.5 h-4 w-4" />Candidaturas{pending > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{pending}</span>}</TabsTrigger>
          <TabsTrigger value="colportores"><Users className="mr-1.5 h-4 w-4" />Colportores ({active})</TabsTrigger>
          <TabsTrigger value="percentagens"><Percent className="mr-1.5 h-4 w-4" />Percentagens</TabsTrigger>
          <TabsTrigger value="links"><Link2 className="mr-1.5 h-4 w-4" />Links</TabsTrigger>
          <TabsTrigger value="definicoes"><Settings2 className="mr-1.5 h-4 w-4" />Definições</TabsTrigger>
        </TabsList>
        <TabsContent value="candidaturas"><ColporteursPanel mode="candidaturas" {...props} /></TabsContent>
        <TabsContent value="colportores"><ColporteursPanel mode="colportores" {...props} /></TabsContent>
        <TabsContent value="percentagens"><CommissionPanel data={data} run={run} /></TabsContent>
        <TabsContent value="links"><LinksPanel reg={reg} idx={idx} /></TabsContent>
        <TabsContent value="definicoes"><SettingsPanel data={data} run={run} /></TabsContent>
      </Tabs>
    </div>
  );
}
