import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { kangestRepetir } from '@/api/PlatformApi';
import { cn } from '@/lib/utils';

const NOMES = { ne: 'Nota de encomenda', fr: 'Factura/Recibo', anular: 'Anulação da NE', nc: 'Nota de crédito' };
const ESTADOS = {
  feito: ['Feito', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'],
  pendente: ['Na fila', 'bg-amber-500/10 text-amber-700 dark:text-amber-400'],
  erro: ['Erro', 'bg-red-500/10 text-red-700 dark:text-red-400'],
  ignorado: ['Não vai', 'bg-muted text-muted-foreground'],
};

/**
 * Os documentos do KanGest de uma encomenda (public.kangest_da_encomenda): a NE, a FR, a anulação e a nota de
 * crédito, com o número e o estado; um documento com erro repete-se daqui (docs/KANGEST.md).
 */
export default function OrderKanGest({ orderId, podeRepetir = false }) {
  const [docs, setDocs] = useState(null);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('kangest_da_encomenda', { p_order_id: orderId });
    if (!error) setDocs(data || {});
  }, [orderId]);
  useEffect(() => { carregar(); }, [carregar]);
  const ordem = ['ne', 'fr', 'anular', 'nc'].filter((k) => docs?.[k]);
  if (!ordem.length) return null;
  async function repetir(id) {
    try {
      await kangestRepetir(id);
      toast.success('Volta a ir para o KanGest no próximo ciclo (até 5 minutos).');
      carregar();
    } catch (e) {
      toast.error(e?.message || 'Não foi possível repetir.');
    }
  }
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <p className="mb-2 font-semibold">KanGest</p>
      <ul className="space-y-1.5">
        {ordem.map((k) => {
          const d = docs[k];
          const [rot, cor] = ESTADOS[d.estado] || ESTADOS.pendente;
          return (
            <li key={k} className="flex flex-wrap items-center gap-2">
              <span className="w-32 text-muted-foreground">{NOMES[k]}</span>
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', cor)}>{rot}</span>
              {d.resultado?.numero && <span className="font-mono font-semibold">{d.resultado.numero}</span>}
              {d.resultado?.fe?.url_consulta && (
                <a href={d.resultado.fe.url_consulta} target="_blank" rel="noopener noreferrer" className="text-[#0a748f] hover:underline">AGT</a>
              )}
              {d.estado === 'erro' && <span className="w-full text-red-700 dark:text-red-400">{d.erro}</span>}
              {d.estado === 'erro' && podeRepetir && d.id && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => repetir(d.id)}><RotateCcw className="mr-1 h-3 w-3" />Repetir</Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
