// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTheme } from '@/hooks/useTheme';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useSignal } from '@/hooks/useSignal';
import { adminHref } from '@/lib/adminSections';
import { kwanza } from '@/lib/money';
import { cashFlowReport } from '@/lib/productionApi';
import { monthLabel, monthStart, shiftMonth, todayLuanda } from '@/lib/production';
import { cn } from '@/lib/utils';

// As duas séries — entradas e saídas — com as posições 1 e 2 da paleta categórica de referência
// (azul e laranja, não o verde e o vermelho, que são de estado). Validadas como par adjacente nas
// superfícies do painel: claro #ffffff e escuro #1f1f1f (separação para daltonismo ΔE 24.7 / 26.8).
const SERIES = {
  light: { entradas: '#2a78d6', saidas: '#eb6834', grid: '#e7e5e4', axis: '#57534e' },
  dark: { entradas: '#3987e5', saidas: '#d95926', grid: '#333333', axis: '#a8a29e' },
};

const PERIODS = {
  mes: { label: 'Este mês', range: (t) => [monthStart(t), t] },
  passado: { label: 'Mês passado', range: (t) => { const m = shiftMonth(monthStart(t), -1); return [m, lastDay(m)]; } },
  dias30: { label: 'Últimos 30 dias', range: (t) => [addDays(t, -29), t] },
  ano: { label: 'Este ano', range: (t) => [`${t.slice(0, 4)}-01-01`, t] },
};

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function lastDay(month) {
  return addDays(shiftMonth(month, 1), -1);
}
const short = (n) => {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e6) return `${(Number(n) / 1e6).toLocaleString('pt-AO', { maximumFractionDigits: 1 })} M`;
  if (v >= 1e3) return `${(Number(n) / 1e3).toLocaleString('pt-AO', { maximumFractionDigits: 0 })} mil`;
  return String(Math.round(Number(n) || 0));
};

/**
 * O dinheiro que entra (pagamentos dos clientes confirmados, menos reembolsos) e o que sai
 * (fornecedores e salários pagos), num período, e o que está por pagar hoje. Só para as finanças
 * (public.cash_flow_report, migração saidas).
 */
export default function FinanceTab() {
  const { theme } = useTheme();
  const colors = SERIES[theme === 'dark' ? 'dark' : 'light'];
  const today = todayLuanda();
  const [period, setPeriod] = useState('mes');
  const [custom, setCustom] = useState({ from: monthStart(today), to: today });
  const [from, to] = period === 'custom' ? [custom.from, custom.to] : PERIODS[period].range(today);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts) => {
    if (!opts?.quiet) setLoading(true);
    try {
      setReport(await cashFlowReport(from, to));
      setError('');
    } catch (err) {
      if (!opts?.quiet) setError(err.message);
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);
  // Em tempo real: um pagamento de cliente confirmado, a um fornecedor ou um salário pago. Sem o
  // canal ligado, volta a ler de minuto a minuto (de 5 em 5 com ele).
  const reloadQuietly = useCallback(() => load({ quiet: true }), [load]);
  const live = useSignal('painel', 'financas', reloadQuietly);
  useAutoRefresh(reloadQuietly, { intervalMs: live ? 5 * 60_000 : 60_000 });

  // Períodos longos ficam por mês (barras de um dia em 365 dias não se lêem).
  const byMonth = report && (Date.parse(to) - Date.parse(from)) / 86_400_000 > 62;
  const series = useMemo(() => {
    if (!report) return [];
    // Todos os dias (ou meses) do período, mesmo os sem movimento: o eixo é tempo, e saltar os dias
    // vazios punha lado a lado dias que não são seguidos.
    const rows = new Map();
    for (let key = byMonth ? monthStart(from) : from; key <= to; key = byMonth ? shiftMonth(key, 1) : addDays(key, 1)) {
      rows.set(key, { key, entradas: 0, saidas: 0 });
    }
    let movement = false;
    for (const d of report.by_day || []) {
      const key = byMonth ? monthStart(d.day) : d.day;
      const row = rows.get(key);
      if (!row) continue;
      row.entradas += Number(d.entradas) || 0;
      row.saidas += Number(d.saidas) || 0;
      movement = movement || !!(row.entradas || row.saidas);
    }
    if (!movement) return [];
    return [...rows.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((r) => ({
        ...r,
        saldo: r.entradas - r.saidas,
        label: byMonth ? monthLabel(r.key).replace(/ de \d+$/, '').slice(0, 3) : `${r.key.slice(8, 10)}/${r.key.slice(5, 7)}`,
        title: byMonth ? monthLabel(r.key) : new Date(`${r.key}T12:00:00Z`).toLocaleDateString('pt-AO'),
      }));
  }, [report, byMonth, from, to]);

  const saldo = Number(report?.saldo) || 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {Object.entries(PERIODS).map(([id, p]) => (
            <Button key={id} size="sm" variant={period === id ? 'default' : 'outline'} className="h-9" onClick={() => setPeriod(id)}>{p.label}</Button>
          ))}
          <Button size="sm" variant={period === 'custom' ? 'default' : 'outline'} className="h-9" onClick={() => setPeriod('custom')}>Escolher datas</Button>
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1"><Label htmlFor="cx-de" className="text-xs">De</Label><Input id="cx-de" type="date" className="h-9" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="cx-ate" className="text-xs">Até</Label><Input id="cx-ate" type="date" className="h-9" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
          </div>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => load()}><RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />Actualizar</Button>
      </div>

      {error && <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</p>}

      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Entradas" value={kwanza(report.entradas.liquido)} swatch={colors.entradas}
              hint={`Clientes ${kwanza(report.entradas.clientes)}${Number(report.entradas.reembolsos) ? ` · reembolsos ${kwanza(report.entradas.reembolsos)}` : ''}`} />
            <Tile label="Saídas" value={kwanza(report.saidas.total)} swatch={colors.saidas}
              hint={`Fornecedores ${kwanza(report.saidas.fornecedores)} · salários ${kwanza(report.saidas.salarios)}`} />
            <Tile label="Saldo do período" value={kwanza(saldo)}
              hint={saldo >= 0 ? 'Entrou mais do que saiu' : 'Saiu mais do que entrou'}
              icon={saldo >= 0 ? ArrowUpRight : ArrowDownRight} />
            <Tile label="Por pagar hoje" value={kwanza(Number(report.por_pagar.fornecedores) + Number(report.por_pagar.salarios))}
              hint={<>
                <Link className="underline-offset-2 hover:underline" to={adminHref('producao', 'contas')}>Fornecedores {kwanza(report.por_pagar.fornecedores)}</Link>
                {' · '}
                <Link className="underline-offset-2 hover:underline" to={adminHref('funcionarios', 'salarios')}>{report.por_pagar.salarios_count} {report.por_pagar.salarios_count === 1 ? 'salário' : 'salários'}</Link>
              </>} />
          </div>

          <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="cx-grafico">
            <h3 id="cx-grafico" className="text-sm font-semibold">Entradas e saídas, por {byMonth ? 'mês' : 'dia'}</h3>
            {series.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sem dinheiro a entrar nem a sair neste período.</p>
            ) : (
              <>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={{ stroke: colors.grid }} interval="preserveStartEnd" minTickGap={12} />
                      <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: colors.axis }} tickLine={false} axisLine={false} width={68} />
                      <Tooltip
                        cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
                        formatter={(v, name) => [kwanza(v), name]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.title || ''}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      {/* O texto da legenda na tinta do texto (o recharts usava a cor da série); a cor fica no ponto. */}
                      <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" formatter={(value) => <span style={{ color: colors.axis }}>{value}</span>} />
                      <Bar dataKey="entradas" name="Entradas" fill={colors.entradas} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="saidas" name="Saídas" fill={colors.saidas} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Ver em tabela</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr><th className="py-1 pr-3 font-semibold">{byMonth ? 'Mês' : 'Dia'}</th><th className="py-1 pr-3 text-right font-semibold">Entradas</th><th className="py-1 pr-3 text-right font-semibold">Saídas</th><th className="py-1 text-right font-semibold">Saldo</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border tabular-nums">
                        {series.map((r) => (
                          <tr key={r.key}>
                            <td className="py-1 pr-3">{r.title}</td>
                            <td className="py-1 pr-3 text-right">{kwanza(r.entradas)}</td>
                            <td className="py-1 pr-3 text-right">{kwanza(r.saidas)}</td>
                            <td className="py-1 text-right">{kwanza(r.saldo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>

          {report.por_fornecedor.length > 0 && (
            <section aria-labelledby="cx-fornecedores">
              <h3 id="cx-fornecedores" className="mb-2 text-sm font-semibold">Pago a cada fornecedor no período</h3>
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {report.por_fornecedor.map((f) => (
                  <li key={f.supplier_id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>{f.name} <span className="font-mono text-xs text-muted-foreground">{f.code}</span></span>
                    <span className="font-medium tabular-nums">{kwanza(f.paid)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Entradas: pagamentos dos clientes confirmados no período, menos os reembolsos (a mesma conta de Pagamentos e caixa). Saídas: pagamentos a fornecedores e salários marcados como pagos. Os dias contam pela hora de Luanda.
          </p>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint, swatch, icon: Icon }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {swatch && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: swatch }} aria-hidden="true" />}
        {label}
      </p>
      <p className="mt-1 flex items-center gap-1 text-2xl font-semibold tabular-nums">
        {Icon && <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
