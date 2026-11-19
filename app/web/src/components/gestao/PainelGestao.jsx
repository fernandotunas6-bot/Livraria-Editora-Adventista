import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Megaphone, MonitorPlay, Target, TrendingDown, TrendingUp, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CORES_META, estadoMeta, fmtCompacto, fmtKz, horaDe, MESES, nomeCurto, variacao,
} from '@/lib/painelGestao';
import { usePainelGestao, useNumeroAnimado } from '@/components/gestao/usePainelGestao';
import { GraficoHoras, GraficoMes, GraficoMeses, Sparkline } from '@/components/gestao/GestaoGraficos';

const TODAS = '__todas__';

/**
 * O Painel de Gestão (docs/PAINEL-GESTAO.md). `variante`: 'pagina' (gestao.livrariaadventista.ao), 'admin' (secção
 * do painel) ou 'tv' (letra maior, sem botões de edição). Os filtros são controlados por quem o usa.
 */
export default function PainelGestao({
  alvo = '', canal = '', onFiltros, variante = 'pagina', acoes = null, onDados,
}) {
  const { dados, erro, estado } = usePainelGestao({ alvo, canal });
  const tv = variante === 'tv';
  useEffect(() => { if (dados) onDados?.(dados); }, [dados, onDados]);

  if (!dados) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {erro ? <span className="max-w-md text-center text-destructive">{erro}</span> : 'A carregar o painel…'}
      </div>
    );
  }
  const r = dados.resumo || {};
  const titulo = alvo ? nomeCurto(alvo, dados.alvos?.find((a) => a.id === alvo)?.nome) : 'Todas as livrarias';

  return (
    <div className={cn('space-y-4', tv && 'space-y-3 text-[1.05rem]')}>
      <Cabecalho dados={dados} titulo={titulo} alvo={alvo} canal={canal} onFiltros={onFiltros} estado={estado} tv={tv} acoes={acoes} />
      <FaixaFecho dados={dados} />
      <Fita ultimas={dados.ultimas} tv={tv} />
      <Cartoes r={r} dados={dados} tv={tv} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Bloco titulo={`${MESES[dados.mes - 1]}: acumulado contra o ritmo da meta`} className="xl:col-span-2">
          <GraficoMes dias={dados.dias} meta={r.meta} diasMes={dados.dias_mes} altura={tv ? 280 : 260} />
          <Legenda itens={[['bg-emerald-500', 'Acumulado'], ['bg-slate-400', 'Ritmo da meta'], ['bg-amber-500', 'Meta'], ['bg-primary/40', 'Vendido em cada dia']]} />
        </Bloco>
        <Bloco titulo="Lojas · % da meta do mês">
          <Lojas lojas={dados.lojas} dia={dados.dia} diasMes={dados.dias_mes} onEscolher={tv || !onFiltros ? null : (id) => onFiltros({ alvo: id, canal })} alvo={alvo} />
        </Bloco>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Bloco titulo="Hoje, hora a hora (e a média deste dia da semana)" className="xl:col-span-2">
          <GraficoHoras horas={dados.horas} altura={tv ? 190 : 200} />
        </Bloco>
        <Bloco titulo="Online e balcão no mês">
          <Canais lojas={dados.lojas} />
        </Bloco>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MaisVendidos hoje={dados.mais_vendidos_hoje} mes={dados.mais_vendidos_mes} tv={tv} />
        <Bloco titulo="Últimas vendas">
          <Ultimas ultimas={dados.ultimas} tv={tv} />
        </Bloco>
      </div>
      {!tv && (
        <Bloco titulo="Últimos 12 meses: vendido e meta">
          <GraficoMeses meses={dados.meses} />
        </Bloco>
      )}
    </div>
  );
}

function Bloco({ titulo, children, className }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 text-card-foreground shadow-sm', className)}>
      {titulo && <h3 className="mb-3 text-sm font-semibold tracking-tight text-muted-foreground">{titulo}</h3>}
      {children}
    </section>
  );
}

function Legenda({ itens }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map(([cor, nome]) => (
        <span key={nome} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-3 rounded-sm', cor)} />{nome}</span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ barra de cima

function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  // a hora de Angola (WAT), qualquer que seja o relógio do aparelho
  const txt = agora.toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return <span className="font-mono tabular-nums">{txt}</span>;
}

function Estado({ estado, ultimo }) {
  if (estado === 'ao-vivo') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
        AO VIVO
      </span>
    );
  }
  if (estado === 'sem-ligacao') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400" title="Sem ligação: os números são os últimos que chegaram">
        <WifiOff className="h-3.5 w-3.5" /> Sem ligação{ultimo ? ` · último dado ${horaDe(ultimo)}` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground" title="Sem tempo real: actualiza de 30 em 30 segundos">
      <Clock className="h-3.5 w-3.5" /> A actualizar de 30 em 30 s
    </span>
  );
}

function Cabecalho({ dados, titulo, alvo, canal, onFiltros, estado, tv, acoes }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="mr-auto min-w-0">
        <h2 className={cn('truncate font-semibold tracking-tight', tv ? 'text-2xl' : 'text-xl')}>{titulo}</h2>
        <p className="text-xs text-muted-foreground">
          {MESES[dados.mes - 1]} de {dados.ano} · dia {dados.dia} de {dados.dias_mes}
          {canal === 'balcao' ? ' · só balcão' : canal === 'online' ? ' · só online' : ''}
        </p>
      </div>
      {onFiltros && !tv && (
        <>
          {dados.alvos?.length > 1 && (
            <Select value={alvo || TODAS} onValueChange={(v) => onFiltros({ alvo: v === TODAS ? '' : v, canal })}>
              <SelectTrigger className="h-9 w-[190px]" aria-label="Loja"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dados.ve_tudo && <SelectItem value={TODAS}>Todas as livrarias</SelectItem>}
                {dados.alvos.map((a) => <SelectItem key={a.id} value={a.id}>{nomeCurto(a.id, a.nome)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {dados.ve_tudo && (
            <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Canal">
              {[['', 'Tudo'], ['balcao', 'Balcão'], ['online', 'Online']].map(([v, rot]) => (
                <button key={rot} type="button" onClick={() => onFiltros({ alvo, canal: v })}
                  className={cn('rounded-md px-2.5 py-1 text-xs font-medium', canal === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                  {rot}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <Estado estado={estado} ultimo={dados.ultimo_dado} />
      <span className={cn('text-muted-foreground', tv ? 'text-lg' : 'text-sm')}><Relogio /></span>
      {acoes}
    </div>
  );
}

// No dia 1 e no dia 2: o resultado do mês que fechou.
function FaixaFecho({ dados }) {
  if (dados.dia > 2) return null;
  const fechado = [...(dados.meses || [])].reverse().find((m) => m.fechado);
  if (!fechado) return null;
  const vendido = Number(fechado.vendido) || 0;
  const meta = Number(fechado.meta) || 0;
  const pct = meta > 0 ? Math.round((vendido / meta) * 100) : null;
  const ok = pct != null && pct >= 100;
  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm',
      ok ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10')}>
      <CheckCircle2 className={cn('h-4 w-4', ok ? 'text-emerald-600' : 'text-amber-600')} />
      <strong>{MESES[fechado.mes - 1]} fechado:</strong> {fmtKz(vendido)}
      {pct != null && <span>· {pct} % da meta {ok ? '✓' : ''}</span>}
      <span className="text-muted-foreground">· {MESES[dados.mes - 1]} começa do zero, com a meta nova.</span>
    </div>
  );
}

// ------------------------------------------------------------------ fita (como na bolsa)

function Fita({ ultimas, tv }) {
  const lista = (ultimas || []).slice(0, 20);
  const primeira = lista[0] ? `${lista[0].quando}|${lista[0].numero}` : '';
  const anterior = useRef(primeira);
  const [nova, setNova] = useState(false);
  useEffect(() => {
    if (primeira && anterior.current && primeira !== anterior.current) {
      setNova(true);
      const t = setTimeout(() => setNova(false), 2500);
      anterior.current = primeira;
      return () => clearTimeout(t);
    }
    anterior.current = primeira;
    return undefined;
  }, [primeira]);
  if (!lista.length) return null;
  const itens = lista.map((u) => (
    <span key={`${u.quando}-${u.numero}`} className={cn('mx-5 inline-flex items-center gap-2 whitespace-nowrap', u.anulado && 'line-through opacity-50')}>
      <span className="font-mono text-muted-foreground">{horaDe(u.quando)}</span>
      <span className="font-semibold uppercase">{nomeCurto(u.alvo, u.loja)}</span>
      <span className={cn('font-semibold tabular-nums', Number(u.total) < 0 ? 'text-red-500' : 'text-emerald-500')}>
        {Number(u.total) < 0 ? '▼' : '▲'} {fmtKz(Math.abs(Number(u.total)))}
      </span>
      {u.artigo && <span className="text-muted-foreground">· {u.artigo}{Number(u.quantidade) > 1 ? ` ×${Number(u.quantidade)}` : ''}{u.artigos > 1 ? ` +${u.artigos - 1}` : ''}</span>}
    </span>
  ));
  return (
    <div className={cn('group relative overflow-hidden rounded-xl border bg-card py-2 transition-shadow', nova && 'shadow-[0_0_0_2px_rgba(16,185,129,0.6)]', tv ? 'text-base' : 'text-sm')}
      aria-label="Últimas vendas, a passar">
      <style>{`@keyframes painel-fita{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .painel-fita{animation:painel-fita ${Math.max(lista.length * 4, 30)}s linear infinite}
        .group:hover .painel-fita{animation-play-state:paused}
        @media (prefers-reduced-motion: reduce){.painel-fita{animation:none}}`}</style>
      <div className="painel-fita inline-flex">
        <span className="inline-flex">{itens}</span>
        <span className="inline-flex" aria-hidden="true">{itens}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cartões

function Numero({ valor, compacto = false, className }) {
  const v = useNumeroAnimado(valor);
  return (
    <span className={cn('tabular-nums', className)} title={fmtKz(valor)}>
      {compacto ? `${fmtCompacto(v)} Kz` : fmtKz(v)}
    </span>
  );
}

function Cartao({ titulo, children, rodape, className }) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="mt-1">{children}</div>
      {rodape && <div className="mt-1 text-xs text-muted-foreground">{rodape}</div>}
    </div>
  );
}

function Cartoes({ r, dados, tv }) {
  const v = variacao(r.hoje, r.semana_passada);
  const est = estadoMeta({ vendido: r.mes, meta: r.meta, ritmoIdeal: r.ritmo_ideal });
  const cores = CORES_META[est];
  const pct = Number(r.percentagem) || 0;
  const grande = tv ? 'text-3xl' : 'text-2xl';
  const diaSemana = new Date(`${dados.agora}+01:00`).toLocaleDateString('pt-PT', { weekday: 'long', timeZone: 'Africa/Luanda' });
  const projPct = Number(r.meta) > 0 ? Math.round((Number(r.projeccao) / Number(r.meta)) * 100) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Cartao titulo="Hoje" rodape={v ? <span className={v.sobe ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{v.texto} vs. {diaSemana} passada</span> : 'Sem base para comparar'}>
        <Numero valor={r.hoje} className={cn(grande, 'font-bold')} />
      </Cartao>
      <Cartao titulo={`Mês de ${MESES[dados.mes - 1]}`} rodape={`${dados.dia} de ${dados.dias_mes} dias`}>
        <Numero valor={r.mes} compacto={tv} className={cn(grande, 'font-bold')} />
      </Cartao>
      <Cartao titulo="Meta do mês" className="col-span-2 lg:col-span-1"
        rodape={Number(r.meta) > 0
          ? (est === 'atingida' ? <span className={cores.texto}>Passou a meta ✓</span>
            : <>Falta {fmtCompacto(r.falta)} · {fmtCompacto(r.ritmo_necessario)}/dia</>)
          : 'Defina a meta deste mês'}>
        {Number(r.meta) > 0 ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn(grande, 'font-bold tabular-nums', cores.texto)}>{Math.round(pct)} %</span>
              <span className="text-xs text-muted-foreground tabular-nums">de {fmtCompacto(r.meta)}</span>
            </div>
            <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn('h-full rounded-full transition-all duration-700', cores.barra)} style={{ width: `${Math.min(pct, 100)}%` }} />
              {/* onde devia estar hoje, ao ritmo da meta */}
              <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${Math.min((dados.dia / dados.dias_mes) * 100, 100)}%` }} title="Ritmo da meta hoje" />
            </div>
          </>
        ) : <span className={cn(grande, 'font-bold text-muted-foreground')}>—</span>}
      </Cartao>
      <Cartao titulo="Projecção do mês" rodape={projPct != null ? <span className={projPct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{projPct >= 100 ? '▲' : '▼'} {projPct} % da meta</span> : 'Ao ritmo actual'}>
        <Numero valor={r.projeccao} compacto className={cn(grande, 'font-bold')} />
      </Cartao>
      <Cartao titulo="Vendas hoje" rodape={`${Number(r.hoje_itens) || 0} artigos · ticket médio do mês ${fmtCompacto(r.ticket_medio)}`}>
        <span className={cn(grande, 'font-bold tabular-nums')}>{r.hoje_vendas ?? 0}</span>
      </Cartao>
    </div>
  );
}

// ------------------------------------------------------------------ lojas

function Lojas({ lojas, dia, diasMes, onEscolher, alvo }) {
  if (!lojas?.length) return <p className="text-sm text-muted-foreground">Sem lojas para mostrar.</p>;
  const ideal = (dia / diasMes) * 100;
  return (
    <ul className="space-y-3">
      {lojas.map((l) => {
        const pct = Number(l.percentagem);
        const est = estadoMeta({ vendido: l.mes, meta: l.meta, ritmoIdeal: Number(l.meta) * (dia / diasMes) });
        const cores = CORES_META[est];
        const conteudo = (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{nomeCurto(l.id, l.nome)}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {fmtCompacto(l.mes)}{Number(l.meta) > 0 && <> · <span className={cores.texto}>{Math.round(pct)} %</span></>}
              </span>
            </div>
            <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full transition-all duration-700', cores.barra)} style={{ width: `${Number(l.meta) > 0 ? Math.min(pct, 100) : 0}%` }} />
              {Number(l.meta) > 0 && <div className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${Math.min(ideal, 100)}%` }} />}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-muted-foreground">hoje {fmtCompacto(l.hoje)}</span>
              <div className="h-6 min-w-0 flex-1"><Sparkline valores={l.trinta} cor={est === 'critica' ? '#ef4444' : '#10b981'} altura={24} /></div>
            </div>
          </>
        );
        return (
          <li key={l.id}>
            {onEscolher ? (
              <button type="button" onClick={() => onEscolher(alvo === l.id ? '' : l.id)}
                className={cn('w-full rounded-lg p-1.5 text-left hover:bg-muted/60', alvo === l.id && 'bg-muted')}>
                {conteudo}
              </button>
            ) : <div className="p-1.5">{conteudo}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function Canais({ lojas }) {
  const online = (lojas || []).filter((l) => l.id === 'online').reduce((s, l) => s + (Number(l.mes) || 0), 0);
  const balcao = (lojas || []).filter((l) => l.id !== 'online').reduce((s, l) => s + (Number(l.mes) || 0), 0);
  const total = online + balcao;
  if (!total) return <p className="text-sm text-muted-foreground">Ainda sem vendas este mês.</p>;
  const pBalcao = Math.round((balcao / total) * 100);
  return (
    <div className="space-y-3">
      <div className="flex h-4 overflow-hidden rounded-full">
        <div className="bg-primary" style={{ width: `${pBalcao}%` }} title={`Balcão ${pBalcao} %`} />
        <div className="bg-emerald-500" style={{ width: `${100 - pBalcao}%` }} title={`Online ${100 - pBalcao} %`} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" />Balcão</p><p className="font-semibold tabular-nums">{fmtCompacto(balcao)} Kz · {pBalcao} %</p></div>
        <div><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-500" />Online</p><p className="font-semibold tabular-nums">{fmtCompacto(online)} Kz · {100 - pBalcao} %</p></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mais vendidos e últimas vendas

function MaisVendidos({ hoje, mes, tv }) {
  const [periodo, setPeriodo] = useState('hoje');
  const lista = periodo === 'hoje' ? hoje : mes;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-muted-foreground">Mais vendidos</h3>
        {!tv && (
          <div className="inline-flex rounded-lg border p-0.5">
            {[['hoje', 'Hoje'], ['mes', 'Mês']].map(([v, rot]) => (
              <button key={v} type="button" onClick={() => setPeriodo(v)}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium', periodo === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{rot}</button>
            ))}
          </div>
        )}
      </div>
      {!lista?.length ? <p className="text-sm text-muted-foreground">Ainda sem vendas {periodo === 'hoje' ? 'hoje' : 'este mês'}.</p> : (
        <ol className="space-y-2">
          {lista.slice(0, tv ? 6 : 10).map((p) => {
            const subiu = periodo === 'hoje' && p.posicao_ontem != null ? p.posicao_ontem - p.posicao : null;
            return (
              <li key={p.chave} className="flex items-center gap-3">
                <span className="w-5 text-right text-sm font-semibold tabular-nums text-muted-foreground">{p.posicao}</span>
                {p.capa
                  ? <img src={p.capa} alt="" loading="lazy" className="h-10 w-7 shrink-0 rounded object-cover shadow-sm" />
                  : <span className="h-10 w-7 shrink-0 rounded bg-muted" />}
                <span className="min-w-0 flex-1 truncate text-sm">{p.titulo}</span>
                <span className="shrink-0 text-right text-xs tabular-nums">
                  <span className="font-semibold">{Number(p.quantidade)}</span>
                  <span className="text-muted-foreground"> · {fmtCompacto(p.total)}</span>
                </span>
                {subiu != null && subiu !== 0 && (
                  <span className={cn('w-8 shrink-0 text-right text-xs', subiu > 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {subiu > 0 ? <TrendingUp className="inline h-3.5 w-3.5" /> : <TrendingDown className="inline h-3.5 w-3.5" />}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Ultimas({ ultimas, tv }) {
  const lista = (ultimas || []).slice(0, tv ? 8 : 15);
  if (!lista.length) return <p className="text-sm text-muted-foreground">Ainda sem vendas.</p>;
  return (
    <ul className="divide-y">
      {lista.map((u) => (
        <li key={`${u.quando}-${u.numero}`} className={cn('flex items-center gap-3 py-1.5 text-sm', u.anulado && 'opacity-50')}>
          <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground">{horaDe(u.quando)}</span>
          <span className="w-24 shrink-0 truncate font-medium">{nomeCurto(u.alvo, u.loja)}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            <span className={cn(u.anulado && 'line-through')}>{u.numero}</span>
            {u.artigo && <> · {u.artigo}{u.artigos > 1 ? ` +${u.artigos - 1}` : ''}</>}
            {u.anulado && ' · anulada'}
          </span>
          <span className={cn('shrink-0 font-semibold tabular-nums', Number(u.total) < 0 ? 'text-red-600' : '')}>
            {Number(u.total) < 0 ? '−' : ''}{fmtKz(Math.abs(Number(u.total)))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Os botões da barra de cima (Metas, Publicidade, TV), para quem usa o painel os pôr. */
export function BotoesPainel({ onMetas, onPublicidade, onTv }) {
  return (
    <div className="flex flex-wrap gap-2">
      {onMetas && <Button size="sm" variant="outline" onClick={onMetas}><Target className="mr-1.5 h-4 w-4" />Metas</Button>}
      {onPublicidade && <Button size="sm" variant="outline" onClick={onPublicidade}><Megaphone className="mr-1.5 h-4 w-4" />Publicidade da TV</Button>}
      {onTv && <Button size="sm" onClick={onTv}><MonitorPlay className="mr-1.5 h-4 w-4" />Modo TV</Button>}
    </div>
  );
}
