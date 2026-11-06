import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { BLOCK_CATEGORIES, addBlockedDomain, isMissingTable, loadBlockedDomains, removeBlockedDomain } from '@/lib/communityApi';

const CATEGORY_LABEL = { ...Object.fromEntries(BLOCK_CATEGORIES.map((c) => [c.value, c.label])), filtro: 'Filtro de segurança' };
const SOURCE_LABEL = { lista: 'lista de origem', equipa: 'equipa', filtro: 'filtro automático' };

/**
 * Sites que não podem aparecer nos links da comunidade. A lista vem com sites adultos,
 * encurtadores e "IP loggers"; o filtro de segurança junta os que o Cloudflare marca como
 * malware ou conteúdo adulto; a equipa junta os que encontrar. Juntar um site oculta logo as
 * publicações que o têm.
 */
export default function BlockedDomainsPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState('adulto');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadBlockedDomains());
      setMissing(false);
    } catch (e) {
      if (isMissingTable(e)) setMissing(true);
      else toast({ variant: 'destructive', title: 'Não foi possível carregar os sites bloqueados', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((d) => d.domain.includes(q)) : items;
  }, [items, filter]);

  const add = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setBusy('add');
    try {
      await addBlockedDomain(domain, category);
      toast({ title: 'Site bloqueado', description: 'As publicações que já o tinham ficaram ocultas.' });
      setDomain('');
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível bloquear', description: err.message });
    } finally {
      setBusy('');
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Voltar a permitir links para ${d.domain}? As publicações ocultas continuam ocultas até as mostrar.`)) return;
    setBusy(d.domain);
    try {
      await removeBlockedDomain(d.domain);
      await load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Não foi possível', description: err.message });
    } finally {
      setBusy('');
    }
  };

  if (missing) return null;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="sites-bloqueados">
      <div>
        <h3 id="sites-bloqueados" className="text-base font-semibold">Sites bloqueados nos links</h3>
        <p className="text-sm text-muted-foreground">
          Conteúdo adulto, encurtadores e sites perigosos não podem ser publicados. Os sites novos são verificados por um filtro de segurança; um site marcado entra nesta lista sozinho.
        </p>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="bloquear-site">Site a bloquear</Label>
          <Input id="bloquear-site" value={domain} placeholder="exemplo.com" onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bloquear-motivo">Motivo</Label>
          <select id="bloquear-motivo" className="h-10 rounded-md border bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            {BLOCK_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={busy === 'add' || !domain.trim()}>
          {busy === 'add' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Bloquear
        </Button>
      </form>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Procurar site bloqueado" className="pl-9" placeholder={`Procurar entre ${items.length} sites`} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {shown.slice(0, 200).map((d) => (
            <li key={d.domain} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono">{d.domain}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{CATEGORY_LABEL[d.category] || d.category} · {SOURCE_LABEL[d.source] || d.source}</span>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === d.domain} onClick={() => remove(d)} title="Voltar a permitir">
                <Trash2 className="h-4 w-4" /><span className="sr-only">Voltar a permitir {d.domain}</span>
              </Button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum site com esse nome.</li>}
        </ul>
      )}
    </section>
  );
}
