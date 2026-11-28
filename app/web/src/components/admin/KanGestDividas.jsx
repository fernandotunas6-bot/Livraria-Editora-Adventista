// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { relatorioDividas } from '@/api/PlatformApi';
import { data, kz } from '@/lib/kangestRecibo';

// as dívidas vêm em kwanzas (dividas_por_loja); o formato do KanGest está em cêntimos
const kzDe = (v) => kz(Math.round(Number(v || 0) * 100));
const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * O que falta receber em cada loja: as facturas a crédito do balcão (o que o KanGest diz que falta pagar) e as
 * encomendas do site entregues ou pagas em parte (GET /admin/relatorios/dividas). Quem vê os relatórios vê todas as
 * lojas; o gerente de uma loja, só a sua, como no resto do painel. Os nomes dos clientes do balcão decifram-se no
 * servidor. As vencidas aparecem primeiro e marcadas.
 */
export default function KanGestDividas({ lojas = [] }) {
  const [loja, setLoja] = useState('');
  const [linhas, setLinhas] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    setLinhas(null);
    relatorioDividas(loja)
      .then((r) => { if (vivo) { setLinhas(r?.dividas || []); setErro(''); } })
      .catch((e) => { if (vivo) { setErro(e?.message || 'Não foi possível carregar as dívidas.'); setLinhas([]); } });
    return () => { vivo = false; };
  }, [loja]);
  const nomeDaLoja = (id) => lojas.find((l) => l.id === id)?.name || 'Sem loja';
  const ordenadas = useMemo(() => {
    const h = hoje();
    return (linhas || []).map((l) => ({ ...l, vencida: !!l.vencimento && String(l.vencimento).slice(0, 10) < h }))
      .sort((a, b) => Number(b.vencida) - Number(a.vencida) || Number(b.pendente) - Number(a.pendente));
  }, [linhas]);
  const porLoja = useMemo(() => {
    const m = new Map();
    for (const l of ordenadas) m.set(l.store_id, (m.get(l.store_id) || 0) + Number(l.pendente || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ordenadas]);
  const total = porLoja.reduce((s, [, v]) => s + v, 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          As facturas a crédito do balcão e as encomendas do site entregues ou pagas em parte. As vencidas aparecem primeiro.
        </p>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={loja} onChange={(e) => setLoja(e.target.value)} aria-label="Loja">
          <option value="">Todas as que vejo</option>
          {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      {linhas === null ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="A carregar" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Por receber</p>
              <p className="text-lg font-semibold tabular-nums">{kzDe(total)}</p>
            </div>
            {porLoja.slice(0, 3).map(([id, v]) => (
              <div key={id || 'sem'} className="rounded-lg border p-3">
                <p className="truncate text-xs text-muted-foreground">{nomeDaLoja(id)}</p>
                <p className="text-lg font-semibold tabular-nums">{kzDe(v)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Loja</th>
                  <th className="px-3 py-2 font-medium">Vencimento</th>
                  <th className="px-3 py-2 text-right font-medium">Falta</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((l, i) => (
                  <tr key={`${l.origem}-${l.numero}-${i}`} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium">{l.numero || '—'}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{l.origem === 'site' ? 'Site' : 'Balcão'} · {data(l.data)}</span>
                    </td>
                    <td className="px-3 py-2">{l.cliente || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{nomeDaLoja(l.store_id)}</td>
                    <td className="px-3 py-2">{l.vencimento ? data(l.vencimento) : '—'}{l.vencida && <Badge variant="destructive" className="ml-2">Vencida</Badge>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{kzDe(l.pendente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ordenadas.length && !erro && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Não há dívidas por receber.</p>}
          </div>
        </>
      )}
    </section>
  );
}
