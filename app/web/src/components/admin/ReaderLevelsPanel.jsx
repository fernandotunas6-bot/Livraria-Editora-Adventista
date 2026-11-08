import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import ReaderBadge from '@/components/community/ReaderBadge';
import { loadReaderRules, loadReaderSummary, saveReaderRules } from '@/lib/readerApi';

function NumberField({ id, label, hint, value, onChange, min, max }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} className="w-32" required />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Comunidade › Níveis dos leitores: quantos há em cada nível e as regras — a entrada na
 * Comunidade de Leitores sem compra (dias de conta e dias a participar) e os livros de cada
 * distintivo. O nível de cada conta calcula-o a base de dados (migração niveis_dos_leitores).
 */
export default function ReaderLevelsPanel() {
  const { toast } = useToast();
  const [rules, setRules] = useState(null);
  const [missing, setMissing] = useState(false);
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [{ rules: r, missing: m }, s] = await Promise.all([loadReaderRules(), loadReaderSummary().catch(() => null)]);
      setRules(r);
      setMissing(m);
      setSummary(s);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setRules((r) => ({ ...r, ...patch }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveReaderRules(rules);
      toast({ title: 'Regras guardadas', description: 'Valem já para as próximas visitas e compras.' });
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (!rules) {
    return error
      ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      : <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (missing) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        Os níveis dos leitores chegam com a migração <code>20261108131000_niveis_dos_leitores</code>, que ainda não está aplicada.
      </p>
    );
  }

  const counts = [
    ['novo', 'Contas novas', summary?.novo],
    ['leitor', 'Leitores', summary?.leitor],
    ['assiduo', 'Leitores assíduos', summary?.assiduo],
    ['honra', 'Leitores de honra', summary?.honra],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-sm text-muted-foreground">
          A conta começa como <strong className="text-foreground">Conta nova</strong>: lê, gosta e responde. Ao pagar o primeiro livro
          (livro, Bíblia ou lição) passa a <strong className="text-foreground">Leitor</strong> e pode criar publicações. Depois sobe pelos livros comprados.
          São distintivos: não mudam preços.
        </p>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1.5 h-4 w-4" />Actualizar</Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {counts.map(([level, label, n]) => (
            <div key={level} className="rounded-xl border p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{label} {level !== 'novo' && <ReaderBadge level={level} className="hidden sm:inline-flex" />}</p>
              <p className="text-2xl font-bold tabular-nums">{n ?? 0}</p>
            </div>
          ))}
        </div>
      )}
      {summary && (
        <p className="text-xs text-muted-foreground">
          Entraram pela compra: {summary.por_compra ?? 0} · pela participação: {summary.por_participacao ?? 0}. Só clientes (a equipa não conta).
        </p>
      )}

      <form onSubmit={save} className="space-y-5 rounded-xl border bg-card p-5">
        <fieldset className="space-y-4">
          <legend className="font-semibold">Entrar sem comprar</legend>
          <label className="flex items-center gap-3">
            <Switch checked={!!rules.engage_enabled} onCheckedChange={(v) => set({ engage_enabled: v })} aria-label="Deixar entrar quem participa sem comprar" />
            <span className="text-sm">Quem participa sem comprar também entra na Comunidade de Leitores</span>
          </label>
          {rules.engage_enabled && (
            <div className="flex flex-wrap gap-6">
              <NumberField id="leitor-dias-conta" label="Dias de conta" hint="Desde que a conta foi criada." min={1} max={730}
                value={rules.engage_min_days} onChange={(v) => set({ engage_min_days: v })} />
              <NumberField id="leitor-dias-activos" label="Dias a participar" hint="Dias diferentes em que usou o site com a conta." min={1} max={365}
                value={rules.engage_active_days} onChange={(v) => set({ engage_active_days: v })} />
            </div>
          )}
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="font-semibold">Distintivos por livros comprados</legend>
          <div className="flex flex-wrap gap-6">
            <NumberField id="leitor-assiduo" label="Leitor assíduo" hint="Livros pagos." min={2} max={1000}
              value={rules.tier_assiduo} onChange={(v) => set({ tier_assiduo: v })} />
            <NumberField id="leitor-honra" label="Leitor de honra" hint="Mais do que o assíduo." min={3} max={10000}
              value={rules.tier_honra} onChange={(v) => set({ tier_honra: v })} />
          </div>
        </fieldset>
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar regras</Button>
      </form>
    </div>
  );
}
