// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminViewNav, useSectionView } from '@/components/admin/shell/AdminViewNav';
import { adminPermissions } from '@/lib/adminSections';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { indexRegistry, loadRegistry } from '@/lib/churchRegistryApi';
import { registrySummary } from '@/lib/churchRegistrySummary';
import DistrictsPanel from './DistrictsPanel';
import ChurchesPanel from './ChurchesPanel';
import PastorsPanel from './PastorsPanel';
import FieldsPanel from './FieldsPanel';
import RegistryImport from './RegistryImport';
import { DataTable, Pill, Spinner } from './registryUi';

const EMPTY_REG = { fields: [], districts: [], churches: [], pastors: [], assignments: [], provinces: [], municipalities: [] };

/** Registo da Igreja: campos, distritos, igrejas e pastores, com províncias e municípios. */
export default function ChurchRegistryTab() {
  const { isAdmin, hasPermission } = useAuth();
  const canEdit = isAdmin || hasPermission('manage_church_registry');
  const { toast } = useToast();
  const [reg, setReg] = useState(EMPTY_REG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // As vistas vêm do registo do painel (lib/adminSections.js); "Importar" só para quem edita.
  const perms = useMemo(() => adminPermissions({ isAdmin, hasPermission }), [isAdmin, hasPermission]);
  const sv = useSectionView('igreja', { perms });
  const tab = sv.view;
  const setTab = sv.setView;

  const reload = useCallback(async () => {
    try {
      setReg(await loadRegistry());
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /** Corre uma operação, avisa do resultado e volta a ler o registo. */
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
  const summary = useMemo(() => registrySummary(reg, idx), [reg, idx]);

  if (loading) return <Spinner />;
  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">
        <p className="font-semibold">Não foi possível ler o registo da Igreja.</p>
        <p className="mt-1 text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); reload(); }}><RefreshCw className="mr-1.5 h-4 w-4" />Tentar de novo</Button>
      </div>
    );
  }

  const props = { reg, idx, canEdit, run };
  return (
    <div>
      {/* Título e descrição no cabeçalho do painel (lib/adminSections.js); aqui o acesso e as acções. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{canEdit ? 'Pode editar.' : 'Só leitura: para alterar, peça a quem gere o registo da Igreja.'}</p>
        <Button variant="ghost" size="sm" onClick={reload}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>
      <AdminViewNav
        state={sv}
        badges={{
          distritos: { count: reg.districts.length, tone: 'count' },
          igrejas: { count: reg.churches.length, tone: 'count' },
          pastores: { count: reg.pastors.length, tone: 'count' },
          campos: { count: reg.fields.length, tone: 'count' },
        }}
      />

      {tab === 'resumo' && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Distritos', summary.totals.districts], ['Igrejas', summary.totals.churches], ['Pastores activos', summary.totals.pastors], ['Províncias', summary.byProvince.length]].map(([l, n]) => (
              <div key={l} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{n}</p></div>
            ))}
          </div>
          {summary.issues.length > 0 && (
            <div className="mb-6 rounded-xl border border-border p-4">
              <h3 className="mb-2 font-semibold">Por completar</h3>
              <ul className="space-y-1.5 text-sm">
                {summary.issues.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center gap-2">
                    <Pill tone="amber">{i.count}</Pill>{i.label}
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setTab(i.tab)}>ver</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DataTable head={['Província', 'Distritos', 'Igrejas', 'Pastores', 'Municípios com igreja']} empty="Sem dados. Comece por Importar.">
            {summary.byProvince.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 tabular-nums">{r.districts}</td>
                <td className="px-3 py-2 tabular-nums">{r.churches}</td>
                <td className="px-3 py-2 tabular-nums">{r.pastors}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.municipalities.join(', ') || '—'}</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
      {tab === 'distritos' && <DistrictsPanel {...props} />}
      {tab === 'igrejas' && <ChurchesPanel {...props} />}
      {tab === 'pastores' && <PastorsPanel {...props} />}
      {tab === 'campos' && <FieldsPanel {...props} />}
      {canEdit && tab === 'importar' && <RegistryImport reg={reg} run={run} canEdit={canEdit} />}
    </div>
  );
}
