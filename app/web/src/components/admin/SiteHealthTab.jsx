// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Activity, Bug, Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { METRICS, errorWhere, formatMetric, pageName, rating, vitalsTable } from '@/lib/siteHealth';
import SaudeEcossistema from '@/components/admin/SaudeEcossistema';

const RATING_STYLE = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  needs: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  poor: 'bg-red-50 text-red-800 ring-red-600/20',
};
const RATING_LABEL = { good: 'bom', needs: 'a melhorar', poor: 'mau' };

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short' });
};

// A função ainda não existe: a migração saude_do_site não foi aplicada.
const missingFunction = (e) => e?.code === 'PGRST202' || /could not find the function/i.test(e?.message || '');

function MetricCell({ name, metric }) {
  if (!metric) return <td className="px-3 py-2 text-center text-muted-foreground">—</td>;
  const r = rating(name, metric.p75);
  return (
    <td className="px-3 py-2 text-center">
      <span
        className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${RATING_STYLE[r] || ''}`}
        title={`p75 ${formatMetric(name, metric.p75)} · mediana ${formatMetric(name, metric.median)} · ${metric.samples} medições`}
      >
        {formatMetric(name, metric.p75)}
        <span className="sr-only"> ({RATING_LABEL[r]}; mediana {formatMetric(name, metric.median)}; {metric.samples} medições)</span>
      </span>
    </td>
  );
}

/**
 * Painel → Sistema → Saúde do site (quem gere as configurações).
 *
 * As Core Web Vitals medidas nos aparelhos de quem visita (p75 por página, telemóvel e computador
 * à parte) e os erros de JavaScript agrupados pela mensagem. Os números chegam pelo
 * lib/telemetry.js e guardam-se 30 dias (migração 20261111090000_saude_do_site).
 */
export default function SiteHealthTab() {
  const [days, setDays] = useState(7);
  const [device, setDevice] = useState('mobile');
  const [vitals, setVitals] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const daysId = useId();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [v, e] = await Promise.all([
        supabase.rpc('site_health_vitals', { p_days: days }),
        supabase.rpc('site_health_errors', { p_days: days }),
      ]);
      const failed = v.error || e.error;
      if (failed) throw failed;
      setVitals(v.data || []);
      setErrors(e.data || []);
      setMissing(false);
    } catch (err) {
      if (missingFunction(err)) setMissing(true);
      else setError(err.message || 'Não foi possível carregar a saúde do site.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const table = useMemo(() => vitalsTable(vitals, device), [vitals, device]);
  const hasOther = useMemo(() => vitals.some((r) => r.device !== device), [vitals, device]);

  return (
    <div className="space-y-6">
      <SaudeEcossistema />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          <p className="flex items-start gap-2">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Medido nos telemóveis e computadores de quem visita a loja. Cada número é o <strong>p75</strong>: três em cada
              quatro visitas foram tão rápidas ou mais. Verde está bem, âmbar precisa de melhorar, vermelho está mal (os
              limites da Google). Passe o rato por cima para ver a mediana e quantas medições há.
            </span>
          </p>
          <p className="mt-1 pl-6">Sem dados pessoais; guarda-se 30 dias.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor={daysId} className="text-xs font-medium text-muted-foreground">Período</label>
            <select
              id={daysId}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={1}>Últimas 24 horas</option>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9">
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar
          </Button>
        </div>
      </div>

      {missing && (
        <p className="rounded-xl border bg-muted/40 p-4 text-sm">
          A saúde do site ainda não está activa nesta base de dados: falta aplicar a migração
          <code className="mx-1">20261111090000_saude_do_site</code>.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

      {loading && !vitals.length && !errors.length ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="A carregar" /></div>
      ) : !missing && !error && (
        <>
          <section aria-labelledby="saude-velocidade" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="saude-velocidade" className="text-base font-semibold">Velocidade por página</h3>
              <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Aparelho">
                {[['mobile', 'Telemóvel', Smartphone], ['desktop', 'Computador', Monitor]].map(([value, label, Icon]) => (
                  <Button
                    key={value}
                    variant={device === value ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-9 rounded-none"
                    aria-pressed={device === value}
                    onClick={() => setDevice(value)}
                  >
                    <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" /> {label}
                  </Button>
                ))}
              </div>
            </div>
            {table.length === 0 ? (
              <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                {hasOther
                  ? `Ainda não há medições ${device === 'mobile' ? 'no telemóvel' : 'no computador'} neste período.`
                  : 'Ainda não há medições neste período. Chegam à medida que as pessoas visitam a loja.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">p75 de cada métrica por página, {device === 'mobile' ? 'no telemóvel' : 'no computador'}</caption>
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">Página</th>
                      {METRICS.map((m) => (
                        <th key={m.name} scope="col" className="px-3 py-2 text-center font-medium" title={m.hint}>{m.label}</th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-right font-medium">Visitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((row) => (
                      <tr key={row.page} className={`border-t ${row.page === '*' ? 'bg-muted/20 font-medium' : ''}`}>
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {pageName(row.page)}
                          {row.page !== '*' && pageName(row.page) !== row.page && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{row.page}</span>
                          )}
                        </th>
                        {METRICS.map((m) => <MetricCell key={m.name} name={m.name} metric={row.metrics[m.name]} />)}
                        <td className="px-3 py-2 text-right tabular-nums">{row.visits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="saude-erros" className="space-y-3">
            <h3 id="saude-erros" className="flex items-center gap-2 text-base font-semibold">
              <Bug className="h-4 w-4 text-primary" aria-hidden="true" /> Erros no navegador
            </h3>
            {errors.length === 0 ? (
              <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum erro neste período.</p>
            ) : (
              <ul className="space-y-2">
                {errors.map((e) => {
                  const where = errorWhere(e.sample);
                  return (
                    <li key={e.message} className="rounded-xl border bg-card p-3">
                      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                        <p className="min-w-0 flex-1 wrap-break-word font-mono text-sm">{e.message}</p>
                        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                          {e.occurrences} {Number(e.occurrences) === 1 ? 'vez' : 'vezes'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Última vez {when(e.last_seen)}
                        {e.last_version ? ` · versão ${e.last_version}` : ''}
                        {e.devices?.length ? ` · ${e.devices.map((d) => (d === 'desktop' ? 'computador' : 'telemóvel')).join(' e ')}` : ''}
                        {e.pages?.length ? ` · ${e.pages.map(pageName).join(', ')}` : ''}
                      </p>
                      {(where || e.sample?.stack) && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer font-medium text-primary">Detalhe técnico</summary>
                          {where && <p className="mt-1 font-mono">{where}</p>}
                          {e.sample?.stack && (
                            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-2 font-mono">{e.sample.stack}</pre>
                          )}
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
