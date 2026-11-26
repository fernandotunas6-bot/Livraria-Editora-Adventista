// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';

const kz = (c) => `${(Number(c || 0) / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Luanda' });

/**
 * O ERP financeiro central (public.kangest_financeiro; migração 20261126170000): os movimentos da tesouraria de todas as
 * lojas, que cada KanGest manda (sem a descrição livre nem o cliente), por loja e por centro de custo. Os anulados ficam
 * de fora dos totais. Só para quem lê os pagamentos.
 */
export default function KanGestFinanceiro() {
  const [de, setDe] = useState(() => `${hoje().slice(0, 8)}01`);
  const [ate, setAte] = useState(hoje);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    setErro('');
    const { data, error } = await supabase.rpc('kangest_financeiro', { p_from: de, p_to: ate });
    if (error) setErro(error.message);
    else setR(data);
  }, [de, ate]);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-2">
        <h3 className="mr-auto font-semibold">Dinheiro das lojas (tesouraria do KanGest)</h3>
        <label className="text-xs">De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="ml-1 rounded border px-2 py-1" /></label>
        <label className="text-xs">Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="ml-1 rounded border px-2 py-1" /></label>
        <Button size="sm" variant="outline" className="h-8" onClick={carregar}><RefreshCw className="mr-1 h-3.5 w-3.5" />Actualizar</Button>
      </div>
      {erro && <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Entradas', kz(r.total.entradas)],
              ['Saídas', kz(r.total.saidas)],
              ['Saldo do período', kz(r.total.entradas - r.total.saidas)],
              ['Movimentos', `${r.total.movimentos}${r.anulados ? ` (+${r.anulados} anulados)` : ''}`],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{rotulo}</p>
                <p className="text-lg font-semibold tabular-nums">{valor}</p>
              </div>
            ))}
          </div>
          {r.lojas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem movimentos neste período. Chegam com a ligação dos postos (KanGest 1.4.8 ou mais recente).</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Loja</th><th className="text-right">Entradas</th><th className="text-right">Saídas</th><th className="text-right">Saldo</th></tr></thead>
                <tbody>
                  {r.lojas.map((l) => (
                    <tr key={l.loja} className="border-t">
                      <td className="py-1.5">{l.loja}</td>
                      <td className="text-right tabular-nums">{kz(l.entradas)}</td>
                      <td className="text-right tabular-nums">{kz(l.saidas)}</td>
                      <td className="text-right font-medium tabular-nums">{kz((l.entradas || 0) - (l.saidas || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Centro de custo</th><th>Tipo</th><th className="text-right">Valor</th></tr></thead>
                <tbody>
                  {r.categorias.slice(0, 15).map((c) => (
                    <tr key={`${c.categoria}-${c.tipo}`} className="border-t">
                      <td className="py-1.5">{c.categoria}</td>
                      <td>{c.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
                      <td className="text-right tabular-nums">{kz(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Uma cópia que não se altera: uma anulação no KanGest só marca o movimento. A descrição livre e o cliente ficam no KanGest.</p>
        </>
      )}
    </section>
  );
}
