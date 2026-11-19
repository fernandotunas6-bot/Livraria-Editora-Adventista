import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';
import { fmtKz, MESES, nomeCurto } from '@/lib/painelGestao';

const lerValor = (txt) => {
  const s = String(txt ?? '').replace(/[\s  ]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

/**
 * As metas do mês em curso e do seguinte: uma por loja e a da loja online; a da empresa é a soma, a não ser que se
 * escreva uma própria. Grava-se por public.definir_metas (só «Editar relatórios de vendas»); um mês fechado não muda.
 */
export default function MetasDialog({ open, onOpenChange, alvos, ano, mes }) {
  const meses = useMemo(() => {
    const seguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
    return [{ ano, mes }, seguinte];
  }, [ano, mes]);
  const linhas = useMemo(() => [...(alvos || []), { id: '', nome: 'A empresa (opcional: em vez da soma)' }], [alvos]);
  const [valores, setValores] = useState({});
  const [aGravar, setAGravar] = useState(false);
  const chave = (alvo, m) => `${m.ano}-${m.mes}|${alvo}`;

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from('metas').select('alvo, ano, mes, valor')
        .in('ano', [...new Set(meses.map((m) => m.ano))]);
      if (!vivo) return;
      if (error) {
        toast.error('Não foi possível ler as metas.');
        return;
      }
      const v = {};
      for (const r of data || []) {
        const m = meses.find((x) => x.ano === r.ano && x.mes === r.mes);
        if (m) v[chave(r.alvo, m)] = String(Math.round(Number(r.valor)));
      }
      setValores(v);
    })();
    return () => { vivo = false; };
  }, [open, meses]);

  const somaLojas = (m) => linhas.filter((l) => l.id !== '').reduce((s, l) => s + (lerValor(valores[chave(l.id, m)]) || 0), 0);

  async function proposta(m) {
    const { data, error } = await supabase.rpc('metas_proposta', { p_ano: m.ano, p_mes: m.mes });
    if (error) {
      toast.error(error.message);
      return;
    }
    const v = { ...valores };
    let n = 0;
    for (const [alvo, valor] of Object.entries(data || {})) {
      if (!linhas.some((l) => l.id === alvo)) continue;
      v[chave(alvo, m)] = String(Math.round(Number(valor)));
      n++;
    }
    setValores(v);
    toast[n ? 'success' : 'info'](n ? `Proposta para ${MESES[m.mes - 1]}: a média dos últimos 3 meses + 5 %. Reveja antes de gravar.` : 'Ainda não há meses fechados para propor.');
  }

  async function gravar() {
    setAGravar(true);
    try {
      for (const m of meses) {
        const metas = {};
        for (const l of linhas) {
          const v = lerValor(valores[chave(l.id, m)]);
          if (Number.isNaN(v)) throw new Error(`Valor inválido em ${nomeCurto(l.id, l.nome)} (${MESES[m.mes - 1]}).`);
          metas[l.id] = v;
        }
        const { error } = await supabase.rpc('definir_metas', { p_ano: m.ano, p_mes: m.mes, p_metas: metas });
        if (error) throw new Error(error.message);
      }
      toast.success('Metas gravadas.');
      onOpenChange(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Metas do mês</DialogTitle>
          <DialogDescription>
            Uma meta por loja e uma para a loja online, em Kz com IVA. A da empresa é a soma; escreva-a só se quiser outra.
            No dia 1 o mês fecha e não muda mais.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Loja</th>
                {meses.map((m) => (
                  <th key={`${m.ano}-${m.mes}`} className="py-2 pr-3 font-medium">
                    <div className="flex items-center justify-between gap-2">
                      {MESES[m.mes - 1]} {m.ano}
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => proposta(m)} title="Propor a partir dos últimos meses">
                        <Wand2 className="mr-1 h-3.5 w-3.5" />Propor
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id || 'empresa'} className={l.id === '' ? 'border-t' : ''}>
                  <td className="py-1.5 pr-3 font-medium">{l.id === '' ? <span className="text-muted-foreground">{l.nome}</span> : nomeCurto(l.id, l.nome)}</td>
                  {meses.map((m) => (
                    <td key={`${m.ano}-${m.mes}`} className="py-1.5 pr-3">
                      <Input inputMode="decimal" className="h-9 tabular-nums" value={valores[chave(l.id, m)] ?? ''}
                        placeholder={l.id === '' ? `soma: ${fmtKz(somaLojas(m))}` : '—'}
                        onChange={(e) => setValores((v) => ({ ...v, [chave(l.id, m)]: e.target.value }))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={gravar} disabled={aGravar}>{aGravar ? 'A gravar…' : 'Gravar metas'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
