import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { loadSupportReport } from '@/lib/opsApi';

const CATEGORY_LABELS = {
  order: 'Encomenda', payment: 'Pagamento', delivery: 'Entrega', return: 'Devolução',
  product: 'Livros', account: 'Conta', other: 'Outro',
};

export function fmtDuration(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(min / (24 * 60))} dias`;
}

const pct = (v) => (v == null ? '—' : `${v}%`);

function Card({ label, value, hint, tone = '' }) {
  return (
    <div className={`rounded-xl border p-3 ${tone}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Indicadores do atendimento e das encomendas (os mesmos do relatório semanal por email). */
export default function SupportReport() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await loadSupportReport(days));
    } catch (err) {
      setError(err?.status === 404 ? 'A Edge Function publicada ainda não tem os indicadores.' : err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!data) return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const t = data.tickets;
  const cats = Object.entries(t.by_category || {}).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Indicadores do atendimento">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> Indicadores</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-xs" aria-label="Período">
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </header>
      {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Pedidos abertos no período" value={t.opened} hint={`${t.from_assistant} vieram do assistente`} />
        <Card label="Em aberto agora" value={t.open_now} hint={t.overdue_now ? `${t.overdue_now} fora do prazo` : 'nenhum fora do prazo'} tone={t.overdue_now ? 'border-destructive/40 bg-destructive/5' : ''} />
        <Card label="Primeira resposta (mediana)" value={fmtDuration(t.first_response_minutes)} hint={`${pct(t.first_response_within_sla)} dentro do prazo`} />
        <Card label="Resolução (mediana)" value={fmtDuration(t.resolution_minutes)} hint={`${pct(t.resolution_within_sla)} dentro do prazo`} />
        <Card label="Satisfação (4–5 estrelas)" value={pct(t.csat_satisfied)} hint={t.csat_responses ? `${t.csat_responses} avaliação(ões) · média ${t.csat_average}` : 'sem avaliações'} />
        <Card label="Conversas com o assistente" value={data.assistant.conversations} hint={`${pct(data.assistant.handoff_rate)} passaram à equipa · ${data.assistant.helpful} 👍 ${data.assistant.not_helpful} 👎`} />
        <Card label="Encomendas assumidas em (mediana)" value={fmtDuration(data.orders.acknowledged_minutes)} hint={`${data.orders.created} encomendas novas`} />
        <Card
          label="Escaladas e atrasos"
          value={data.orders.escalated_unacknowledged + data.orders.overdue_now}
          hint={`${data.orders.escalated_unacknowledged} sem ninguém a assumir · ${data.orders.overdue_now} entregas fora do prazo`}
          tone={data.orders.escalated_unacknowledged + data.orders.overdue_now ? 'border-amber-500/40 bg-amber-50' : ''}
        />
      </div>
      {cats.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Assuntos: {cats.map(([k, n]) => `${CATEGORY_LABELS[k] || k} ${n}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
