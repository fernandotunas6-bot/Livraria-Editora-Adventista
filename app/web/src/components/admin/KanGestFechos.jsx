// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// os valores do KanGest vêm em cêntimos de kwanza
const kz = (c) => `${(Number(c || 0) / 100).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
const quando = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : '—');

/**
 * Os fechos de caixa (o Z) que os postos do KanGest mandaram (migração 20261125180000): o número, a loja, o posto,
 * quem fechou, o vendido, o esperado e o contado, e as vendas online à parte. Abrir um mostra o detalhe (os
 * pagamentos, os artigos e os documentos), sem os nomes dos clientes. Quem vê: quem vê os relatórios e o gerente da
 * loja (a regra está na base).
 */
export default function KanGestFechos({ lojas = [] }) {
  const [fechos, setFechos] = useState([]);
  const [loja, setLoja] = useState('');
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let q = supabase.from('kangest_fechos')
      .select('id, store_id, numero_z, posto, aberta_em, fechada_em, operador, fechado_por, total_vendido, numerario_esperado, valor_contado, online_total, online_incluidas, reconstruido, selo, resumo, recebido_em')
      .order('recebido_em', { ascending: false })
      .limit(50);
    if (loja) q = q.eq('store_id', loja);
    q.then(({ data, error }) => {
      setErro(error ? error.message : '');
      setFechos(data || []);
    });
  }, [loja]);

  const nomeDaLoja = (id) => lojas.find((l) => l.id === id)?.name || 'Sem loja';

  return (
    <section className="mt-8 rounded-2xl border border-border p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Fechos de caixa dos postos</h3>
          <p className="text-sm text-muted-foreground">
            O relatório Z de cada posto, como ficou arquivado no KanGest (sem os nomes dos clientes). Não se altera.
          </p>
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={loja} onChange={(e) => setLoja(e.target.value)} aria-label="Loja">
          <option value="">Todas as lojas</option>
          {lojas.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      {erro && <p className="mb-2 text-sm text-destructive">{erro}</p>}
      {!fechos.length && !erro && <p className="py-4 text-sm text-muted-foreground">Ainda não chegou nenhum fecho de caixa dos postos.</p>}
      <div className="space-y-2">
        {fechos.map((f) => {
          const dif = Number(f.valor_contado) - Number(f.numerario_esperado);
          const r = f.resumo || {};
          return (
            <div key={f.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">Z n.º {f.numero_z ?? '—'}</span>
                <span>{nomeDaLoja(f.store_id)} · {f.posto || 'Posto'}</span>
                <span className="text-muted-foreground">{quando(f.fechada_em)} · {f.fechado_por || f.operador}</span>
                <span className="ml-auto font-medium">{kz(f.total_vendido)}</span>
                {dif !== 0 && <Badge variant={dif < 0 ? 'destructive' : 'secondary'}>{dif < 0 ? 'Falta' : 'Sobra'} {kz(Math.abs(dif))}</Badge>}
                {f.online_incluidas && Number(f.online_total) !== 0 && <Badge variant="outline">Online {kz(f.online_total)}</Badge>}
                {f.reconstruido && <Badge variant="outline">Reconstruído</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setAberto(aberto === f.id ? null : f.id)}>{aberto === f.id ? 'Fechar' : 'Ver'}</Button>
              </div>
              {aberto === f.id && (
                <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <div className="mb-1 font-medium">Pagamentos</div>
                    {(r.por_modo || []).filter((m) => Number(m.total) !== 0).map((m) => (
                      <div key={m.codigo || m.descricao} className="flex justify-between"><span>{m.descricao}</span><span>{kz(m.total)}</span></div>
                    ))}
                    <div className="mt-1 flex justify-between border-t border-border pt-1"><span>Esperado na gaveta</span><span>{kz(f.numerario_esperado)}</span></div>
                    <div className="flex justify-between"><span>Contado</span><span>{kz(f.valor_contado)}</span></div>
                    <div className="mt-2 text-xs text-muted-foreground">Aberto a {quando(f.aberta_em)} por {f.operador || '—'} · selo {String(f.selo || '').slice(0, 16)}</div>
                  </div>
                  <div>
                    <div className="mb-1 font-medium">Artigos vendidos</div>
                    {(r.artigos || []).slice(0, 40).map((a, i) => (
                      <div key={`${a.referencia}-${i}`} className="flex justify-between gap-2"><span className="truncate">{Number(a.quantidade)} × {a.descricao}</span><span>{kz(a.total)}</span></div>
                    ))}
                    {!(r.artigos || []).length && <p className="text-muted-foreground">Sem artigos.</p>}
                    {r.online?.incluidas && (r.online?.quantidade || 0) > 0 && (
                      <div className="mt-3">
                        <div className="mb-1 font-medium">Vendas online (fora da gaveta)</div>
                        {(r.online.documentos || []).map((d) => (
                          <div key={`d${d.documento_id}`} className="flex justify-between"><span>{d.numero_doc}</span><span>{kz(d.total)}</span></div>
                        ))}
                        {(r.online.encomendas || []).map((d) => (
                          <div key={`e${d.encomenda_id}`} className="flex justify-between"><span>Encomenda {d.numero}{d.na_entrega ? ' (na entrega)' : ''}</span><span>{kz(d.total)}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
