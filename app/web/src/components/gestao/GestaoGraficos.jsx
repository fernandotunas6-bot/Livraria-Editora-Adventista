import React from 'react';
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fmtCompacto, fmtKz, MESES_CURTOS } from '@/lib/painelGestao';
import { MARCA } from '@/components/gestao/marca';

// Cores com significado: verde atingida, âmbar a meta e atrás, vermelho abaixo; o azul e o ciano da marca.
const VERDE = '#10b981';
const AMBAR = MARCA.ouro;
const VERMELHO = '#ef4444';
const CINZA = '#94a3b8';
const CIANO = MARCA.ciano;
// as barras de cada dia num petróleo claro; a linha do acumulado no petróleo da marca
const AZUL = '#8fc3d1';

const eixo = { fontSize: 11, fill: 'currentColor', opacity: 0.55 };

function Dica({ active, payload, label, titulo, linhas }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl px-3.5 py-2.5 text-xs text-white shadow-xl ring-1 ring-white/10" style={{ background: MARCA.marinhoProfundo }}>
      <p className="mb-1.5 font-bold">{titulo ? titulo(p, label) : label}</p>
      {linhas(p).filter(Boolean).map(([k, v, cor]) => (
        <p key={k} className="flex justify-between gap-5 tabular-nums">
          <span className="text-white/60">{k}</span>
          <span className="font-semibold" style={cor ? { color: cor } : undefined}>{v}</span>
        </p>
      ))}
    </div>
  );
}

/** O ponto de hoje no fim da linha, a pulsar. */
function PontoDeHoje({ cx, cy, payload, diaHoje }) {
  if (cx == null || cy == null || payload?.dia !== diaHoje) return <g />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill={CIANO} opacity={0.18}>
        <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0;0.35" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={CIANO} strokeWidth={3} />
    </g>
  );
}

/**
 * Mês em curso: as vendas de cada dia (barras azuis), o acumulado (área em ciano, com o ponto de hoje), o ritmo ideal
 * até à meta (tracejado) e a meta (linha âmbar).
 */
export function GraficoMes({ dias, meta, diasMes, altura = 260 }) {
  const m = Number(meta) || 0;
  const dados = (dias || []).map((d) => ({
    ...d,
    total: d.total == null ? null : Number(d.total),
    acumulado: d.acumulado == null ? null : Number(d.acumulado),
    ideal: m > 0 ? Math.round((m * d.dia) / diasMes) : null,
  }));
  const diaHoje = [...dados].reverse().find((d) => d.acumulado != null)?.dia;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="painel-acum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CIANO} stopOpacity={0.35} />
            <stop offset="100%" stopColor={CIANO} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="painel-dia" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AZUL} stopOpacity={0.9} />
            <stop offset="100%" stopColor={AZUL} stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
        <XAxis dataKey="dia" tick={eixo} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="acum" tick={eixo} tickLine={false} axisLine={false} width={52} tickFormatter={fmtCompacto} />
        <YAxis yAxisId="dia" orientation="right" tick={eixo} tickLine={false} axisLine={false} width={44} tickFormatter={fmtCompacto} />
        <Tooltip
          cursor={{ fill: 'currentColor', opacity: 0.05 }}
          content={(
            <Dica
              titulo={(p) => `Dia ${p.dia}`}
              linhas={(p) => [
                ['Vendido no dia', p.total == null ? '—' : fmtKz(p.total)],
                ['Vendas', p.vendas ?? 0],
                ['Acumulado', p.acumulado == null ? '—' : fmtKz(p.acumulado), CIANO],
                p.ideal != null && ['Ritmo da meta', fmtKz(p.ideal), CINZA],
                p.ideal != null && p.acumulado != null && [
                  'Diferença', `${p.acumulado >= p.ideal ? '+' : '−'}${fmtKz(Math.abs(p.acumulado - p.ideal))}`, p.acumulado >= p.ideal ? VERDE : VERMELHO,
                ],
              ]}
            />
          )}
        />
        <Bar yAxisId="dia" dataKey="total" fill="url(#painel-dia)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        {m > 0 && <Line yAxisId="acum" dataKey="ideal" stroke={CINZA} strokeDasharray="6 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />}
        <Area yAxisId="acum" dataKey="acumulado" stroke={CIANO} strokeWidth={3} fill="url(#painel-acum)" connectNulls={false}
          dot={(p) => <PontoDeHoje key={`hoje-${p.index}`} {...p} diaHoje={diaHoje} />} activeDot={{ r: 5, fill: '#fff', stroke: CIANO, strokeWidth: 3 }}
          isAnimationActive={false} />
        {m > 0 && (
          <ReferenceLine yAxisId="acum" y={m} stroke={AMBAR} strokeWidth={2} strokeDasharray="4 3"
            label={{ value: `META ${fmtCompacto(m)}`, position: 'insideTopLeft', fontSize: 11, fontWeight: 700, fill: MARCA.ouroTexto }} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Hoje, hora a hora (área em ciano), e a média do mesmo dia da semana nas 8 semanas anteriores (tracejado). */
export function GraficoHoras({ horas, altura = 200 }) {
  const dados = (horas || []).map((h) => ({ ...h, hoje: h.hoje == null ? null : Number(h.hoje), media: Number(h.media) || 0 }));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="painel-hoje" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CIANO} stopOpacity={0.5} />
            <stop offset="100%" stopColor={CIANO} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
        <XAxis dataKey="hora" tick={eixo} tickLine={false} axisLine={false} tickFormatter={(h) => `${h}h`} interval={2} />
        <YAxis tick={eixo} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompacto} />
        <Tooltip
          content={(
            <Dica
              titulo={(p) => `${String(p.hora).padStart(2, '0')}:00–${String(p.hora).padStart(2, '0')}:59`}
              linhas={(p) => [['Hoje', p.hoje == null ? '—' : fmtKz(p.hoje), CIANO], ['Média deste dia da semana', fmtKz(p.media), CINZA]]}
            />
          )}
        />
        <Area dataKey="hoje" stroke={CIANO} strokeWidth={2.5} fill="url(#painel-hoje)" connectNulls={false} isAnimationActive={false} />
        <Line dataKey="media" stroke={CINZA} strokeDasharray="6 5" dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Os últimos 30 dias de uma loja, sem eixos (cabe numa linha da lista das lojas). */
export function Sparkline({ valores, cor = CIANO, altura = 28 }) {
  const dados = (valores || []).map((v, i) => ({ i, v: Number(v) || 0 }));
  if (!dados.length) return null;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <LineChart data={dados} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line dataKey="v" stroke={cor} strokeWidth={1.75} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Os últimos 12 meses: o vendido (verde se passou a meta, vermelho se não, azul o mês em curso) e a meta (traço). */
export function GraficoMeses({ meses, altura = 210 }) {
  const dados = (meses || []).map((m) => {
    const vendido = Number(m.vendido) || 0;
    const meta = m.meta == null ? null : Number(m.meta);
    return {
      ...m, vendido, meta,
      rotulo: `${MESES_CURTOS[(m.mes || 1) - 1]} ${String(m.ano).slice(2)}`,
      cor: !m.fechado ? CIANO : meta > 0 ? (vendido >= meta ? VERDE : VERMELHO) : AZUL,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
        <XAxis dataKey="rotulo" tick={eixo} tickLine={false} axisLine={false} />
        <YAxis tick={eixo} tickLine={false} axisLine={false} width={52} tickFormatter={fmtCompacto} />
        <Tooltip
          cursor={{ fill: 'currentColor', opacity: 0.05 }}
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
        <Bar dataKey="vendido" radius={[6, 6, 0, 0]} maxBarSize={42} isAnimationActive={false}>
          {dados.map((d) => <Cell key={`${d.ano}-${d.mes}`} fill={d.cor} fillOpacity={d.fechado ? 0.9 : 0.55} />)}
        </Bar>
        {/* a meta de cada mês: um traço curto sobre a barra */}
        <Line dataKey="meta" stroke={AMBAR} strokeWidth={0} isAnimationActive={false} legendType="none"
          dot={(props) => {
            const { cx, cy, payload } = props;
            if (payload.meta == null || cx == null || cy == null) return <g key={`m-${payload.ano}-${payload.mes}`} />;
            return <line key={`m-${payload.ano}-${payload.mes}`} x1={cx - 14} x2={cx + 14} y1={cy} y2={cy} stroke={AMBAR} strokeWidth={3} strokeLinecap="round" />;
          }}
          activeDot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
