import React from 'react';
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtCompacto, fmtKz, MESES_CURTOS } from '@/lib/painelGestao';

// Cores com significado: verde sobe / atingida, âmbar atrás, vermelho desce; a marca nas barras do dia.
const VERDE = '#10b981';
const AMBAR = '#f59e0b';
const VERMELHO = '#ef4444';
const CINZA = '#94a3b8';
const MARCA = 'hsl(var(--primary))';

const eixo = { fontSize: 11, fill: 'currentColor', opacity: 0.6 };

function Dica({ active, payload, label, titulo, linhas }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-semibold">{titulo ? titulo(p, label) : label}</p>
      {linhas(p).filter(Boolean).map(([k, v, cor]) => (
        <p key={k} className="flex justify-between gap-4 tabular-nums">
          <span className="text-muted-foreground">{k}</span>
          <span style={cor ? { color: cor } : undefined}>{v}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Mês em curso: as vendas de cada dia (barras), o acumulado (linha verde), o ritmo ideal até à meta (tracejado)
 * e a meta (linha horizontal). Os dias que ainda não chegaram ficam vazios.
 */
export function GraficoMes({ dias, meta, diasMes, altura = 260 }) {
  const m = Number(meta) || 0;
  const dados = (dias || []).map((d) => ({
    ...d,
    total: d.total == null ? null : Number(d.total),
    acumulado: d.acumulado == null ? null : Number(d.acumulado),
    ideal: m > 0 ? Math.round((m * d.dia) / diasMes) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
        <XAxis dataKey="dia" tick={eixo} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="acum" tick={eixo} tickLine={false} axisLine={false} width={52} tickFormatter={fmtCompacto} />
        <YAxis yAxisId="dia" orientation="right" tick={eixo} tickLine={false} axisLine={false} width={44} tickFormatter={fmtCompacto} />
        <Tooltip
          content={(
            <Dica
              titulo={(p) => `Dia ${p.dia}`}
              linhas={(p) => [
                ['Vendido no dia', p.total == null ? '—' : fmtKz(p.total)],
                ['Vendas', p.vendas ?? 0],
                ['Acumulado', p.acumulado == null ? '—' : fmtKz(p.acumulado), VERDE],
                p.ideal != null && ['Ritmo da meta', fmtKz(p.ideal), CINZA],
                p.ideal != null && p.acumulado != null && [
                  'Diferença', `${p.acumulado >= p.ideal ? '+' : '−'}${fmtKz(Math.abs(p.acumulado - p.ideal))}`, p.acumulado >= p.ideal ? VERDE : VERMELHO,
                ],
              ]}
            />
          )}
        />
        <Bar yAxisId="dia" dataKey="total" fill={MARCA} fillOpacity={0.35} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        {m > 0 && <Line yAxisId="acum" dataKey="ideal" stroke={CINZA} strokeDasharray="5 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
        <Line yAxisId="acum" dataKey="acumulado" stroke={VERDE} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
        {m > 0 && (
          <ReferenceLine yAxisId="acum" y={m} stroke={AMBAR} strokeDasharray="2 2"
            label={{ value: `Meta ${fmtCompacto(m)}`, position: 'insideTopLeft', fontSize: 11, fill: AMBAR }} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Hoje, hora a hora (área), e a média do mesmo dia da semana nas 8 semanas anteriores (tracejado). */
export function GraficoHoras({ horas, altura = 200 }) {
  const dados = (horas || []).map((h) => ({ ...h, hoje: h.hoje == null ? null : Number(h.hoje), media: Number(h.media) || 0 }));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="painel-hoje" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VERDE} stopOpacity={0.45} />
            <stop offset="100%" stopColor={VERDE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
        <XAxis dataKey="hora" tick={eixo} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} interval={2} />
        <YAxis tick={eixo} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompacto} />
        <Tooltip
          content={(
            <Dica
              titulo={(p) => `${String(p.hora).padStart(2, '0')}:00–${String(p.hora).padStart(2, '0')}:59`}
              linhas={(p) => [['Hoje', p.hoje == null ? '—' : fmtKz(p.hoje), VERDE], ['Média deste dia da semana', fmtKz(p.media), CINZA]]}
            />
          )}
        />
        <Area dataKey="hoje" stroke={VERDE} strokeWidth={2} fill="url(#painel-hoje)" connectNulls={false} isAnimationActive={false} />
        <Line dataKey="media" stroke={CINZA} strokeDasharray="5 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Os últimos 30 dias de uma loja, sem eixos (cabe numa linha da lista das lojas). */
export function Sparkline({ valores, cor = VERDE, altura = 28 }) {
  const dados = (valores || []).map((v, i) => ({ i, v: Number(v) || 0 }));
  if (!dados.length) return null;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={dados} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line dataKey="v" stroke={cor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Os últimos 12 meses: o vendido (verde se passou a meta, vermelho se não), a meta (traço) e o mês em curso. */
export function GraficoMeses({ meses, altura = 200 }) {
  const dados = (meses || []).map((m) => {
    const vendido = Number(m.vendido) || 0;
    const meta = m.meta == null ? null : Number(m.meta);
    return {
      ...m, vendido, meta,
      rotulo: `${MESES_CURTOS[(m.mes || 1) - 1]} ${String(m.ano).slice(2)}`,
      cor: !m.fechado ? MARCA : meta > 0 ? (vendido >= meta ? VERDE : VERMELHO) : CINZA,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
        <XAxis dataKey="rotulo" tick={eixo} tickLine={false} axisLine={false} />
        <YAxis tick={eixo} tickLine={false} axisLine={false} width={52} tickFormatter={fmtCompacto} />
        <Tooltip
          content={(
            <Dica
              titulo={(p) => `${p.rotulo}${p.fechado ? '' : ' (em curso)'}`}
              linhas={(p) => [
                ['Vendido', fmtKz(p.vendido), p.cor],
                ['Meta', p.meta == null ? 'sem meta' : fmtKz(p.meta), AMBAR],
                p.meta > 0 && ['Da meta', `${Math.round((p.vendido / p.meta) * 100)} %${p.fechado ? (p.vendido >= p.meta ? ' ✓' : ' ✗') : ''}`],
              ]}
            />
          )}
        />
        <Bar dataKey="vendido" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {dados.map((d) => <Cell key={`${d.ano}-${d.mes}`} fill={d.cor} fillOpacity={d.fechado ? 0.85 : 0.45} />)}
        </Bar>
        {/* a meta de cada mês: um traço curto sobre a barra */}
        <Line dataKey="meta" stroke={AMBAR} strokeWidth={0} isAnimationActive={false} legendType="none"
          dot={(props) => {
            const { cx, cy, payload } = props;
            if (payload.meta == null || cx == null || cy == null) return <g key={`m-${payload.ano}-${payload.mes}`} />;
            return <line key={`m-${payload.ano}-${payload.mes}`} x1={cx - 12} x2={cx + 12} y1={cy} y2={cy} stroke={AMBAR} strokeWidth={2.5} />;
          }}
          activeDot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
