import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminViewNav, useSectionView } from '@/components/admin/shell/AdminViewNav';
import { Spinner } from '@/components/admin/igreja/registryUi';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useSignal } from '@/hooks/useSignal';
import { adminPermissions } from '@/lib/adminSections';
import { keepUnchanged } from '@/lib/keepUnchanged';
import { loadStaff } from '@/lib/productionApi';
import StaffPanel from './StaffPanel';
import PayrollPanel from './PayrollPanel';

/**
 * Funcionários: a ficha de cada pessoa (com ou sem conta no painel) e os salários de cada mês.
 * Quem gere funcionários altera as fichas; as finanças vêem-nas, e só elas vêem e mexem nos
 * salários, IBAN e NIF (tabela à parte, com o seu RLS).
 */
export default function FuncionariosTab() {
  const { isAdmin, hasPermission } = useAuth();
  const perms = useMemo(() => adminPermissions({ isAdmin, hasPermission }), [isAdmin, hasPermission]);
  const { toast } = useToast();
  const sv = useSectionView('funcionarios', { perms });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setData(await loadStaff({ finance: perms.finance }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [perms.finance]);
  useEffect(() => { reload(); }, [reload]);

  const reloadQuietly = useCallback(async () => {
    try {
      const fresh = await loadStaff({ finance: perms.finance });
      setData((prev) => keepUnchanged(prev, fresh));
    } catch {
      // fica o que está à vista
    }
  }, [perms.finance]);
  // Em tempo real: as fichas («funcionarios») e, para as finanças, os salários de cada um
  // («financas»). Sem o canal ligado, volta a ler de minuto a minuto (de 5 em 5 com ele).
  const live = useSignal('painel', perms.finance ? ['funcionarios', 'financas'] : ['funcionarios'], reloadQuietly);
  useAutoRefresh(reloadQuietly, { intervalMs: live ? 5 * 60_000 : 60_000 });

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

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <p className="font-semibold">Não foi possível abrir os funcionários.</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Tentar de novo</Button>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const active = data.staff.filter((s) => s.status !== 'saiu').length;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="font-semibold text-foreground">{active}</strong> {active === 1 ? 'pessoa a trabalhar' : 'pessoas a trabalhar'}
          {data.staff.length > active && <> · {data.staff.length - active} saíram</>}
        </p>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>
      <AdminViewNav state={sv} />
      {sv.view === 'fichas' && <StaffPanel data={data} canEdit={perms.staff} canSeePay={perms.finance} run={run} />}
      {sv.view === 'salarios' && perms.finance && <PayrollPanel data={data} />}
    </div>
  );
}
