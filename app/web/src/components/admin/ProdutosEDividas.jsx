// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { relatorioDividas } from '@/api/PlatformApi';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const kz = (v) => `${Number(v || 0).toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
const qtd = (v) => Number(v || 0).toLocaleString('pt-AO', { maximumFractionDigits: 2 });
const hoje = () => new Date().toISOString().slice(0, 10);
const inicioDoMes = () => `${hoje().slice(0, 8)}01`;

const VISTAS = [
  { id: 'mais', rotulo: 'Mais vendidos' },
  { id: 'menos', rotulo: 'Menos vendidos' },
  { id: 'sem', rotulo: 'Sem vendas' },
  { id: 'dividas', rotulo: 'Dívidas' },
];

/**
 * «Produtos e dívidas», por loja e por período, com o balcão dos postos do KanGest e o site juntos (migração
 * 20261125170000): os mais vendidos, os menos vendidos (os que venderam pouco), os produtos com stock e sem vendas,
 * e as dívidas (as facturas a crédito do balcão e as encomendas entregues ou pagas em parte). Por omissão, o mês em
 * curso e todas as lojas. As dívidas, com os nomes dos clientes, só para quem vê os relatórios.
 */
export default function ProdutosEDividas() {
  const { isAdmin, hasPermission } = useAuth();
  const veTudo = isAdmin || hasPermission('view_reports') || hasPermission('edit_reports');
  const [lojas, setLojas] = useState([]);
  const [loja, setLoja] = useState('');
  const [de, setDe] = useState(inicioDoMes);
  const [ate, setAte] = useState(hoje);
  const [vista, setVista] = useState('mais');
  const [linhas, setLinhas] = useState([]);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    supabase.from('physical_stores').select('id, name, active').order('name').then(({ data }) => {
      const activas = (data || []).filter((l) => l.active);
      setLojas(activas);
      // quem não vê os relatórios de todas vê a sua loja: começa na primeira
      if (!veTudo && activas[0]) setLoja((x) => x || activas[0].id);
    });
  }, [veTudo]);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro('');
    try {
      if (vista === 'dividas') {
        const r = await relatorioDividas(loja);
        setLinhas(r?.dividas || []);
      } else {
        const fn = vista === 'sem' ? 'produtos_sem_vendas' : 'produtos_vendidos';
        const { data, error } = await supabase.rpc(fn, { p_de: de, p_ate: ate, p_loja: loja || null });
        if (error) throw error;
        setLinhas(data || []);
      }
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar.');
      setLinhas([]);
    } finally {
      setACarregar(false);
    }
  }, [vista, loja, de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = useMemo(() => {
    if (vista === 'mais') return linhas.filter((l) => Number(l.unidades) > 0).slice(0, 30);
    // os que venderam pouco (pelo menos uma unidade), do que vendeu menos para o que vendeu mais
    if (vista === 'menos') return linhas.filter((l) => Number(l.unidades) > 0).sort((a, b) => Number(a.unidades) - Number(b.unidades)).slice(0, 30);
    return linhas;
  }, [vista, linhas]);
  const nomeDaLoja = (id) => lojas.find((l) => l.id === id)?.name || (id ? id : 'Sem loja');
  const totalDividas = vista === 'dividas' ? linhas.reduce((s, l) => s + Number(l.pendente || 0), 0) : 0;
  const vistas = veTudo ? VISTAS : VISTAS.filter((v) => v.id !== 'dividas');

  return (
    <section className="mt-8 rounded-2xl border border-border p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Produtos e dívidas</h2>
        <p className="text-sm text-muted-foreground">
          O balcão das lojas (o KanGest) e o site juntos: as devoluções abatem e as vendas da loja online contam uma vez só.
        </p>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {vistas.map((v) => (
            <Button key={v.id} size="sm" variant={vista === v.id ? 'default' : 'outline'} onClick={() => setVista(v.id)}>
              {v.rotulo}
            </Button>
          ))}
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Loja</span>
          <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={loja} onChange={(e) => setLoja(e.target.value)}>
            {veTudo && <option value="">Todas</option>}
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        {vista !== 'dividas' && (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">De</span>
              <Input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} className="h-9" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">Até</span>
              <Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} className="h-9" />
            </label>
          </>
        )}
        <Button size="sm" variant="outline" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? 'A carregar…' : 'Actualizar'}
        </Button>
      </div>

      {erro && <p className="mb-3 text-sm text-destructive">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            {vista === 'dividas' ? (
              <tr><th className="py-2 pr-3">Documento</th><th className="py-2 pr-3">Cliente</th><th className="py-2 pr-3">Loja</th><th className="py-2 pr-3">Data</th><th className="py-2 pr-3">Vencimento</th><th className="py-2 pr-3 text-right">Por pagar</th></tr>
            ) : vista === 'sem' ? (
              <tr><th className="py-2 pr-3">Produto</th><th className="py-2 pr-3">Código</th><th className="py-2 pr-3 text-right">Stock</th></tr>
            ) : (
              <tr><th className="py-2 pr-3">Produto</th><th className="py-2 pr-3 text-right">Unidades</th><th className="py-2 pr-3 text-right">Balcão</th><th className="py-2 pr-3 text-right">Site</th><th className="py-2 pr-3 text-right">Valor</th></tr>
            )}
          </thead>
          <tbody>
            {lista.map((l, i) => vista === 'dividas' ? (
              <tr key={`${l.origem}-${l.numero}-${i}`} className="border-t border-border">
                <td className="py-2 pr-3">
                  {l.numero} <Badge variant="outline" className="ml-1">{l.origem === 'site' ? 'Site' : 'Balcão'}</Badge>
                </td>
                <td className="py-2 pr-3">{l.cliente || '—'}</td>
                <td className="py-2 pr-3">{nomeDaLoja(l.store_id)}</td>
                <td className="py-2 pr-3">{l.data || '—'}</td>
                <td className="py-2 pr-3">{l.vencimento || '—'}</td>
                <td className="py-2 pr-3 text-right font-medium">{kz(l.pendente)}</td>
              </tr>
            ) : vista === 'sem' ? (
              <tr key={l.book_id} className="border-t border-border">
                <td className="py-2 pr-3">{l.titulo}</td>
                <td className="py-2 pr-3 text-muted-foreground">{l.codigo || '—'}</td>
                <td className="py-2 pr-3 text-right">{qtd(l.stock)}</td>
              </tr>
            ) : (
              <tr key={l.chave} className="border-t border-border">
                <td className="py-2 pr-3">{l.titulo}</td>
                <td className="py-2 pr-3 text-right font-medium">{qtd(l.unidades)}</td>
                <td className="py-2 pr-3 text-right text-muted-foreground">{qtd(l.unidades_balcao)}</td>
                <td className="py-2 pr-3 text-right text-muted-foreground">{qtd(l.unidades_site)}</td>
                <td className="py-2 pr-3 text-right">{kz(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!aCarregar && !lista.length && !erro && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {vista === 'dividas' ? 'Não há dívidas por receber.' : vista === 'sem' ? 'Todos os produtos com stock venderam no período.' : 'Sem vendas no período.'}
          </p>
        )}
        {vista === 'dividas' && linhas.length > 0 && (
          <p className="mt-3 text-right text-sm font-semibold">Total por receber: {kz(totalDividas)}</p>
        )}
      </div>
    </section>
  );
}
