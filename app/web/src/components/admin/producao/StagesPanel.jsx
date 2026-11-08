import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, Pill, Toolbar } from '@/components/admin/igreja/registryUi';
import { useAuth } from '@/hooks/useAuth';
import { STAGE_STATUS, pendingStages } from '@/lib/production';
import { saveStage } from '@/lib/productionApi';
import { cn } from '@/lib/utils';

const fmtDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-AO') : '');

/**
 * O que falta fazer em todas as ordens abertas: cada etapa com a ordem, o responsável e o prazo,
 * as atrasadas primeiro. "As minhas" mostra as da pessoa com sessão (pela ficha ligada à conta).
 */
export default function StagesPanel({ data, canEdit, run, today }) {
  const { user } = useAuth() || {};
  const mine = data.staff.find((s) => s.profile_id && s.profile_id === user?.id) || null;
  const [who, setWho] = useState(mine ? mine.id : 'todos');
  const [onlyLate, setOnlyLate] = useState(false);

  const all = useMemo(() => pendingStages({ orders: data.orders, stages: data.stages, staff: data.staff, today }), [data, today]);
  const list = all.filter((x) => {
    if (onlyLate && !x.overdue) return false;
    if (who === 'todos') return true;
    if (who === 'ninguem') return !x.stage.responsible_id;
    return x.stage.responsible_id === who;
  });
  const people = data.staff.filter((s) => all.some((x) => x.stage.responsible_id === s.id));
  const late = all.filter((x) => x.overdue).length;

  const set = (stage, status) => run(() => saveStage({ id: stage.id, status }), null, { quiet: true });

  return (
    <div>
      <Toolbar>
        <NativeSelect value={who} onChange={setWho} className="w-auto sm:w-64" aria-label="De quem">
          <option value="todos">Todos os responsáveis</option>
          {mine && <option value={mine.id}>As minhas ({mine.full_name})</option>}
          <option value="ninguem">Sem responsável</option>
          {people.filter((p) => p.id !== mine?.id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </NativeSelect>
        <Button size="sm" variant={onlyLate ? 'default' : 'outline'} className="h-9" onClick={() => setOnlyLate(!onlyLate)} aria-pressed={onlyLate}>
          <AlertTriangle className="mr-1.5 h-4 w-4" />Atrasadas <span className="ml-1 tabular-nums opacity-70">{late}</span>
        </Button>
        <p className="ml-auto text-sm text-muted-foreground">{list.length} {list.length === 1 ? 'etapa por fazer' : 'etapas por fazer'}</p>
      </Toolbar>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {all.length === 0 ? 'Nenhuma etapa por fazer nas ordens abertas.' : 'Nada com este filtro.'}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {list.map(({ stage, order, responsible, overdue }) => (
            <li key={stage.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 p-3', overdue && 'bg-amber-500/5')}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{stage.name}</p>
                <p className="truncate text-xs text-muted-foreground"><span className="font-mono">{order.code}</span> · {order.title}</p>
              </div>
              <div className="w-40 text-sm">{responsible ? responsible.full_name : <span className="text-muted-foreground">Sem responsável</span>}</div>
              <div className={cn('w-32 text-sm tabular-nums', overdue ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                {stage.due_date ? <>{overdue && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" />}{fmtDate(stage.due_date)}</> : 'Sem prazo'}
              </div>
              <Pill tone={STAGE_STATUS[stage.status].tone}>{STAGE_STATUS[stage.status].label}</Pill>
              {canEdit && (
                <div className="flex gap-1">
                  {stage.status === 'por_fazer' && (
                    <Button size="sm" variant="outline" onClick={() => set(stage, 'em_curso')}><Play className="mr-1 h-3.5 w-3.5" />Começar</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => set(stage, 'concluida')}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Feita</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
