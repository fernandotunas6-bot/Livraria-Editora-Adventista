// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck, CalendarDays, Clock, Gauge, Megaphone, MonitorPlay, Receipt, Rocket, ShoppingBag, Target, TrendingDown,
  TrendingUp, Trophy, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CORES_META, estadoMeta, fmtCompacto, fmtKz, horaDe, MESES, nomeCurto, variacao,
} from '@/lib/painelGestao';
import { usePainelGestao, useNumeroAnimado } from '@/components/gestao/usePainelGestao';
import { GraficoHoras, GraficoMes, GraficoMeses, Sparkline } from '@/components/gestao/GestaoGraficos';
import { corDaLoja, MARCA, MEDALHAS } from '@/components/gestao/marca';
import RodapeNoticias from '@/components/gestao/RodapeNoticias';
import GraficoAoVivo, { useConfigGrafico } from '@/components/gestao/GraficoAoVivo';

const TODAS = '__todas__';

// As cores da meta em hexadecimal (o anel e as barras são SVG/inline).
const COR_ESTADO = { atingida: '#10b981', adiantada: '#10b981', atras: '#f59e0b', critica: '#ef4444', 'sem-meta': '#94a3b8' };

/**
 * O Painel de Gestão (docs/PAINEL-GESTAO.md). `variante`: 'pagina' (gestao.livrariaadventista.ao), 'admin' (secção
 * do painel) ou 'tv' (letra maior, sem botões de edição; o logótipo fica na barra do modo TV). `extra`: o que fica no
 * canto da faixa de cima (sair, por exemplo). `aoVivo`: a configuração do gráfico ao vivo vinda do modo TV (nos
 * outros ecrãs, cada aparelho guarda a sua e muda-a na roda do próprio gráfico).
 */
export default function PainelGestao({
  alvo = '', canal = '', onFiltros, variante = 'pagina', acoes = null, extra = null, onDados, aoVivo = null,
}) {
  const { dados, erro, estado } = usePainelGestao({ alvo, canal });
  const tv = variante === 'tv';
  const [cfgLocal, mudarCfg] = useConfigGrafico('pagina');
  const cfgGrafico = aoVivo || cfgLocal;
  useEffect(() => { if (dados) onDados?.(dados); }, [dados, onDados]);

  if (!dados) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-sm text-muted-foreground">
        {!tv && <img src={MARCA.logoAzul} alt={MARCA.nome} className="h-14 w-auto animate-pulse object-contain dark:hidden" />}
        {erro ? <span className="max-w-md text-center text-destructive">{erro}</span> : 'A carregar o painel…'}
      </div>
    );
  }
  const r = dados.resumo || {};
  const titulo = alvo ? nomeCurto(alvo, dados.alvos?.find((a) => a.id === alvo)?.nome) : 'Todas as livrarias';
  const est = estadoMeta({ vendido: r.mes, meta: r.meta, ritmoIdeal: r.ritmo_ideal });
  // o gráfico ao vivo no lugar escolhido (no modo TV, só «topo» fica dentro do painel; os outros são do ModoTv)
  const grafico = (lugar) => cfgGrafico.onde === lugar && (
    <GraficoAoVivo alvo={alvo} canal={canal} cfg={cfgGrafico} onCfg={aoVivo ? null : mudarCfg} alvos={dados.alvos}
      ecra={tv ? 'tv' : 'pagina'} altura={tv ? 250 : 240} />
  );

  return (
    <div className={cn('pb-6', tv ? 'space-y-3' : 'space-y-5')}>
      <Heroi dados={dados} titulo={titulo} alvo={alvo} canal={canal} onFiltros={onFiltros} estado={estado}
        tv={tv} acoes={acoes} extra={extra} compacto={variante === 'admin'} />
      <div className={cn('relative z-10 space-y-5 px-1', tv ? '-mt-2' : '-mt-12 sm:px-4')}>
        {grafico('topo')}
        <Cartoes r={r} dados={dados} tv={tv} est={est} alvo={alvo} />
        <FaixaFecho dados={dados} />
        {grafico('depois-cartoes')}
        <Fita ultimas={dados.ultimas} alvos={dados.alvos} tv={tv} />
        <div className="grid gap-5 xl:grid-cols-3">
          <Bloco titulo={`${MESES[dados.mes - 1]} · acumulado contra o ritmo da meta`} icone={CalendarDays} className="xl:col-span-2">
            <GraficoMes dias={dados.dias} meta={r.meta} diasMes={dados.dias_mes} altura={tv ? 270 : 280} />
            <Legenda itens={[[MARCA.ciano, 'Acumulado'], ['#94a3b8', 'Ritmo da meta'], [MARCA.ouro, 'Meta'], ['#8fc3d1', 'Vendido em cada dia']]} />
          </Bloco>
          <Bloco titulo="Ranking das lojas · % da meta" icone={Trophy}>
            <Lojas lojas={dados.lojas} alvos={dados.alvos} dia={dados.dia} diasMes={dados.dias_mes} alvo={alvo}
              onEscolher={tv || !onFiltros ? null : (id) => onFiltros({ alvo: id, canal })} />
          </Bloco>
        </div>
        {grafico('antes-horas')}
        <div className="grid gap-5 xl:grid-cols-3">
          <Bloco titulo="Hoje, hora a hora · contra a média deste dia da semana" icone={Clock} className="xl:col-span-2">
            <GraficoHoras horas={dados.horas} altura={tv ? 190 : 210} />
          </Bloco>
          <Bloco titulo="Balcão e loja online no mês" icone={ShoppingBag}>
            <Canais lojas={dados.lojas} />
          </Bloco>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <MaisVendidos hoje={dados.mais_vendidos_hoje} mes={dados.mais_vendidos_mes} tv={tv} />
          <Bloco titulo="Últimas vendas" icone={Receipt}>
            <Ultimas ultimas={dados.ultimas} alvos={dados.alvos} tv={tv} />
          </Bloco>
        </div>
        {!tv && (
          <Bloco titulo="Últimos 12 meses · vendido e meta" icone={BadgeCheck}>
            <GraficoMeses meses={dados.meses} />
          </Bloco>
        )}
        {grafico('fim')}
        {!aoVivo && cfgGrafico.onde === 'nao' && (
          <button type="button" onClick={() => mudarCfg({ onde: 'depois-cartoes' })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed p-3 text-sm text-muted-foreground hover:text-foreground">
            <TrendingUp className="h-4 w-4" />Mostrar o gráfico ao vivo das vendas de hoje
          </button>
        )}
      </div>
      {/* no modo TV o rodapé é do ecrã todo (ModoTv) */}
      {!tv && <RodapeNoticias dados={dados} className="mx-1 sm:mx-4" />}
    </div>
  );
}

function Bloco({ titulo, icone: Icone, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-black/5 bg-card p-5 text-card-foreground shadow-lg shadow-slate-900/5 dark:border-white/10 dark:shadow-black/30', className)}>
      {titulo && (
        <h3 className="mb-4 flex items-center gap-2 font-serif text-base font-semibold tracking-tight text-[#1d2a3f] dark:text-foreground">
          {Icone && <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0a748f]/10 text-[#0a748f]"><Icone className="h-4 w-4" /></span>}
          {titulo}
        </h3>
      )}
      {children}
    </section>
  );
}

function Legenda({ itens }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {itens.map(([cor, nome]) => (
        <span key={nome} className="inline-flex items-center gap-1.5"><span className="h-2 w-3.5 rounded-sm" style={{ background: cor }} />{nome}</span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ faixa de cima (a marca)

/** Os arcos do logótipo, a enfeitar a faixa (só decoração). */
function Arcos() {
  return (
    <svg aria-hidden="true" viewBox="0 0 400 260" className="pointer-events-none absolute -right-10 -top-16 h-[22rem] w-auto opacity-[0.12]">
      <g fill="none" stroke="#ffffff" strokeLinecap="round">
        <path d="M60 250 C 60 110, 170 20, 330 18" strokeWidth="14" />
        <path d="M105 250 C 105 135, 190 62, 330 58" strokeWidth="10" />
        <path d="M150 250 C 150 160, 215 102, 330 98" strokeWidth="7" />
      </g>
      <g fill="#ffffff"><circle cx="338" cy="18" r="9" /><circle cx="338" cy="58" r="7" /><circle cx="338" cy="98" r="5" /></g>
    </svg>
  );
}

function Relogio({ grande }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  // a hora de Angola (WAT), qualquer que seja o relógio do aparelho
  const hm = agora.toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' });
  const s = agora.toLocaleTimeString('pt-PT', { timeZone: 'Africa/Luanda', second: '2-digit' }).padStart(2, '0');
  return (
    <span className={cn('font-mono font-semibold tabular-nums tracking-tight text-white', grande ? 'text-4xl' : 'text-2xl')}>
      {hm}<span className="text-[0.6em] text-white/50">:{s}</span>
    </span>
  );
}

function Estado({ estado, ultimo }) {
  if (estado === 'ao-vivo') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-black/25 px-3 py-1 text-xs font-bold tracking-wider text-white ring-1 ring-emerald-300/50">
        <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
        AO VIVO
      </span>
    );
  }
  if (estado === 'sem-ligacao') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white ring-1 ring-red-300/60" title="Sem ligação: os números são os últimos que chegaram">
        <WifiOff className="h-3.5 w-3.5" /> Sem ligação{ultimo ? ` · ${horaDe(ultimo)}` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/20" title="Sem tempo real: actualiza de 30 em 30 segundos">
      <Clock className="h-3.5 w-3.5" /> de 30 em 30 s
    </span>
  );
}

function Pilulas({ opcoes, valor, onEscolher, rotulo }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-white/10 p-1 ring-1 ring-white/10" role="group" aria-label={rotulo}>
      {opcoes.map(([v, rot]) => (
        <button key={rot} type="button" onClick={() => onEscolher(v)}
          className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition',
            valor === v ? 'bg-white text-[#075a70] shadow' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
          {rot}
        </button>
      ))}
    </div>
  );
}

function Heroi({ dados, titulo, alvo, canal, onFiltros, estado, tv, acoes, extra, compacto }) {
  const lojas = dados.alvos || [];
  const poucas = lojas.length <= 5;
  return (
    <header
      className={cn('relative overflow-hidden text-white', tv ? 'rounded-2xl px-5 pb-5 pt-4' : 'rounded-3xl px-5 pt-5 sm:px-8', !tv && (compacto ? 'pb-16' : 'pb-20'))}
      style={{ background: `radial-gradient(120% 140% at 0% 0%, ${MARCA.azul} 0%, ${MARCA.marinho} 45%, ${MARCA.marinhoProfundo} 100%)` }}
    >
      <Arcos />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
        {!tv && <img src={MARCA.logoBranco} alt={MARCA.nome} className="h-10 w-auto object-contain sm:h-12" />}
        {!tv && <span className="hidden h-10 w-px bg-white/20 sm:block" />}
        <div className="mr-auto min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#fcefc7]">Painel de Gestão</p>
          <h2 className={cn('truncate font-serif font-semibold tracking-tight', tv ? 'text-4xl' : 'text-3xl sm:text-4xl')}>{titulo}</h2>
          <p className="text-xs text-white/60">
            {MESES[dados.mes - 1]} de {dados.ano} · dia {dados.dia} de {dados.dias_mes}
            {canal === 'balcao' ? ' · só balcão' : canal === 'online' ? ' · só loja online' : ''}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Estado estado={estado} ultimo={dados.ultimo_dado} />
          <Relogio grande={tv} />
          {extra}
        </div>
      </div>
      {!tv && (onFiltros || acoes) && (
        <div className="relative mt-5 flex flex-wrap items-center gap-3">
          {onFiltros && lojas.length > 1 && (poucas ? (
            <Pilulas rotulo="Loja" valor={alvo || TODAS} onEscolher={(v) => onFiltros({ alvo: v === TODAS ? '' : v, canal })}
              opcoes={[...(dados.ve_tudo ? [[TODAS, 'Todas']] : []), ...lojas.map((a) => [a.id, nomeCurto(a.id, a.nome)])]} />
          ) : (
            <Select value={alvo || TODAS} onValueChange={(v) => onFiltros({ alvo: v === TODAS ? '' : v, canal })}>
              <SelectTrigger className="h-9 w-[200px] border-white/20 bg-white/10 text-white" aria-label="Loja"><SelectValue /></SelectTrigger>
              <SelectContent>
                {dados.ve_tudo && <SelectItem value={TODAS}>Todas as livrarias</SelectItem>}
                {lojas.map((a) => <SelectItem key={a.id} value={a.id}>{nomeCurto(a.id, a.nome)}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {onFiltros && dados.ve_tudo && (
            <Pilulas rotulo="Canal" valor={canal} onEscolher={(v) => onFiltros({ alvo, canal: v })}
              opcoes={[['', 'Tudo'], ['balcao', 'Balcão'], ['online', 'Online']]} />
          )}
          <div className="ml-auto">{acoes}</div>
        </div>
      )}
    </header>
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
    <div className={cn('flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3 text-sm text-white shadow-lg',
      ok ? 'bg-gradient-to-r from-emerald-600 to-teal-500' : 'bg-gradient-to-r from-amber-600 to-orange-500')}>
      {ok ? <Trophy className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
      <strong className="text-base">{MESES[fechado.mes - 1]} fechado: {fmtKz(vendido)}</strong>
      {pct != null && <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold">{pct} % da meta{ok ? ' ✓' : ''}</span>}
      <span className="text-white/85">{MESES[dados.mes - 1]} começa do zero, com a meta nova.</span>
    </div>
  );
}

// ------------------------------------------------------------------ fita (como na bolsa)

function Fita({ ultimas, alvos, tv }) {
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
  const itens = lista.map((u) => {
    const neg = Number(u.total) < 0;
    return (
      <span key={`${u.quando}-${u.numero}`} className={cn('mx-4 inline-flex items-center gap-2 whitespace-nowrap', u.anulado && 'line-through opacity-40')}>
        <span className="font-mono text-[#7fd3e6]">{horaDe(u.quando)}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: corDaLoja(u.alvo, alvos) }} />
        <span className="font-bold uppercase tracking-wide text-white">{nomeCurto(u.alvo, u.loja)}</span>
        <span className={cn('font-mono font-bold tabular-nums', neg ? 'text-red-300' : 'text-emerald-400')}>
          {neg ? '▼' : '▲'} {fmtKz(Math.abs(Number(u.total)))}
        </span>
        {u.artigo && <span className="text-white/55">{u.artigo}{Number(u.quantidade) > 1 ? ` ×${Number(u.quantidade)}` : ''}{u.artigos > 1 ? ` +${u.artigos - 1}` : ''}</span>}
        <span className="ml-3 text-white/20">◆</span>
      </span>
    );
  });
  return (
    <div className={cn('group relative flex items-stretch overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/10 transition-shadow',
      nova && 'shadow-[0_0_0_3px_rgba(16,185,129,0.55),0_10px_30px_-10px_rgba(16,185,129,0.6)]', tv ? 'text-base' : 'text-sm')}
      style={{ background: MARCA.marinhoProfundo }} aria-label="Últimas vendas, a passar">
      <style>{`@keyframes painel-fita{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .painel-fita{animation:painel-fita ${Math.max(lista.length * 4, 30)}s linear infinite}
        .group:hover .painel-fita{animation-play-state:paused}
        @media (prefers-reduced-motion: reduce){.painel-fita{animation:none}}`}</style>
      <span className="z-10 flex shrink-0 items-center gap-2 px-4 text-[11px] font-black uppercase tracking-[0.2em]" style={{ background: '#ffffff', color: MARCA.marinho }}>
        <TrendingUp className="h-4 w-4" />Vendas
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden py-2.5">
        <div className="painel-fita inline-flex">
          <span className="inline-flex">{itens}</span>
          <span className="inline-flex" aria-hidden="true">{itens}</span>
        </div>
        <span className="pointer-events-none absolute inset-y-0 left-0 w-10" style={{ background: `linear-gradient(90deg, ${MARCA.marinhoProfundo}, transparent)` }} />
        <span className="pointer-events-none absolute inset-y-0 right-0 w-10" style={{ background: `linear-gradient(270deg, ${MARCA.marinhoProfundo}, transparent)` }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ cartões

function Numero({ valor, compacto = false, className }) {
  const v = useNumeroAnimado(valor);
  return (
    <span className={cn('tabular-nums', className)} title={fmtKz(valor)}>
      {compacto ? <>{fmtCompacto(v)}<span className="ml-1 text-[0.5em] font-semibold text-muted-foreground">Kz</span></> : fmtKz(v)}
    </span>
  );
}

function Cartao({ titulo, icone: Icone, cor = MARCA.ciano, children, rodape, className }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-black/5 bg-card p-5 shadow-xl shadow-slate-900/10 dark:border-white/10 dark:shadow-black/40', className)}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${cor}, ${cor}55)` }} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{titulo}</p>
        {Icone && <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${cor}1a`, color: cor }}><Icone className="h-4 w-4" /></span>}
      </div>
      <div className="mt-2">{children}</div>
      {rodape && <div className="mt-2 text-xs text-muted-foreground">{rodape}</div>}
    </div>
  );
}

/** Anel da meta: o vendido à volta, e um traço onde devia estar hoje, ao ritmo da meta. */
function Anel({ pct, ideal, cor, tamanho = 112, espessura = 11, children }) {
  const r = (tamanho - espessura) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(Math.max(Number(pct) || 0, 0), 100);
  const ang = (Math.min(Math.max(Number(ideal) || 0, 0), 100) / 100) * 2 * Math.PI - Math.PI / 2;
  const cx = tamanho / 2;
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-0">
        <defs>
          <linearGradient id="anel-meta" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={cor} />
            <stop offset="100%" stopColor={cor} stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth={espessura} />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="url(#anel-meta)" strokeWidth={espessura} strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: 'stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)', filter: `drop-shadow(0 0 6px ${cor}66)` }} />
        {ideal != null && (
          <line x1={cx + (r - espessura) * Math.cos(ang)} y1={cx + (r - espessura) * Math.sin(ang)}
            x2={cx + (r + espessura / 2) * Math.cos(ang)} y2={cx + (r + espessura / 2) * Math.sin(ang)}
            stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Confetes quando a meta é atingida (uma vez por sessão e por mês e loja; nada com «reduzir movimento»). */
function Confetes({ chave }) {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let visto = false;
    try { visto = sessionStorage.getItem(`painel-confetes:${chave}`) === '1'; } catch { /* sem armazenamento */ }
    if (reduzir || visto) return undefined;
    try { sessionStorage.setItem(`painel-confetes:${chave}`, '1'); } catch { /* sem armazenamento */ }
    setMostrar(true);
    const t = setTimeout(() => setMostrar(false), 4200);
    return () => clearTimeout(t);
  }, [chave]);
  if (!mostrar) return null;
  const cores = [MARCA.ciano, '#10b981', '#b8892f', '#ec4899', '#8b5cf6', '#ffffff'];
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <style>{'@keyframes painel-confete{0%{transform:translate3d(0,-10vh,0) rotate(0)}100%{transform:translate3d(var(--dx),110vh,0) rotate(720deg)}}'}</style>
      {Array.from({ length: 70 }, (_, i) => (
        <span key={i} className="absolute top-0 block h-3 w-1.5 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`, background: cores[i % cores.length], '--dx': `${((i * 53) % 40) - 20}vw`,
            animation: `painel-confete ${2.4 + ((i * 7) % 15) / 10}s cubic-bezier(.2,.6,.4,1) ${(i % 10) * 0.08}s forwards`,
          }} />
      ))}
    </div>
  );
}

function Cartoes({ r, dados, tv, est, alvo }) {
  const v = variacao(r.hoje, r.semana_passada);
  const cores = CORES_META[est];
  const corEst = COR_ESTADO[est];
  const pct = Number(r.percentagem) || 0;
  const grande = tv ? 'text-4xl' : 'text-3xl';
  const diaSemana = new Date(`${dados.agora}+01:00`).toLocaleDateString('pt-PT', { weekday: 'long', timeZone: 'Africa/Luanda' });
  const projPct = Number(r.meta) > 0 ? Math.round((Number(r.projeccao) / Number(r.meta)) * 100) : null;
  const ideal = (dados.dia / dados.dias_mes) * 100;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Cartao titulo="Hoje" icone={TrendingUp}
        rodape={v
          ? <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', v.sobe ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400')}>{v.texto}<span className="font-normal text-muted-foreground">vs. {diaSemana}</span></span>
          : 'Sem base para comparar'}>
        <Numero valor={r.hoje} compacto className={cn(grande, 'font-extrabold tracking-tight')} />
      </Cartao>
      <Cartao titulo={`Mês de ${MESES[dados.mes - 1]}`} icone={CalendarDays} cor={MARCA.azul}
        rodape={<div className="space-y-1"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${ideal}%`, background: MARCA.azul }} /></div><span>{dados.dia} de {dados.dias_mes} dias</span></div>}>
        <Numero valor={r.mes} compacto className={cn(grande, 'font-extrabold tracking-tight')} />
      </Cartao>
      <Cartao titulo="Meta do mês" icone={Target} cor={corEst} className="col-span-2 lg:col-span-1 lg:row-span-1">
        {Number(r.meta) > 0 ? (
          <div className="flex items-center gap-4">
            <Anel pct={pct} ideal={ideal} cor={corEst} tamanho={tv ? 120 : 104}>
              <div>
                <p className={cn('font-extrabold tabular-nums leading-none', tv ? 'text-3xl' : 'text-2xl', cores.texto)}>{Math.round(pct)}<span className="text-sm">%</span></p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">da meta</p>
              </div>
            </Anel>
            <div className="min-w-0 space-y-1 text-xs">
              <p className="font-semibold tabular-nums">{fmtCompacto(r.meta)} Kz</p>
              {est === 'atingida'
                ? <p className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-600 dark:text-emerald-400"><Trophy className="h-3.5 w-3.5" />META ATINGIDA</p>
                : <>
                  <p className="text-muted-foreground">Falta <span className="font-semibold text-foreground">{fmtCompacto(r.falta)}</span></p>
                  <p className="text-muted-foreground"><span className="font-semibold text-foreground">{fmtCompacto(r.ritmo_necessario)}</span>/dia</p>
                  <p className={cn('font-semibold', cores.texto)}>{cores.rotulo}</p>
                </>}
            </div>
          </div>
        ) : (
          <div className="py-2">
            <p className={cn(grande, 'font-extrabold text-muted-foreground')}>—</p>
            <p className="text-xs text-muted-foreground">Defina a meta de {MESES[dados.mes - 1]} (botão Metas).</p>
          </div>
        )}
        {est === 'atingida' && <Confetes chave={`${dados.ano}-${dados.mes}-${alvo || 'todas'}`} />}
      </Cartao>
      <Cartao titulo="Projecção do mês" icone={Rocket} cor="#8b5cf6"
        rodape={projPct != null
          ? <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', projPct >= 100 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>{projPct >= 100 ? '▲' : '▼'} {projPct} % da meta</span>
          : 'Ao ritmo actual'}>
        <Numero valor={r.projeccao} compacto className={cn(grande, 'font-extrabold tracking-tight')} />
      </Cartao>
      <Cartao titulo="Vendas hoje" icone={Gauge} cor="#ec4899" rodape={<>{Number(r.hoje_itens) || 0} artigos · ticket {fmtCompacto(r.ticket_medio)} Kz</>}>
        <span className={cn(grande, 'font-extrabold tabular-nums tracking-tight')}>{r.hoje_vendas ?? 0}</span>
      </Cartao>
    </div>
  );
}

// ------------------------------------------------------------------ lojas

function Lojas({ lojas, alvos, dia, diasMes, onEscolher, alvo }) {
  if (!lojas?.length) return <p className="text-sm text-muted-foreground">Sem lojas para mostrar.</p>;
  const ideal = (dia / diasMes) * 100;
  return (
    <ol className="space-y-2.5">
      {lojas.map((l, k) => {
        const pct = Number(l.percentagem);
        const temMeta = Number(l.meta) > 0;
        const est = estadoMeta({ vendido: l.mes, meta: l.meta, ritmoIdeal: Number(l.meta) * (dia / diasMes) });
        const cor = corDaLoja(l.id, alvos);
        const medalha = temMeta && k < 3 ? MEDALHAS[k] : null;
        const conteudo = (
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black"
              style={medalha ? { background: medalha, color: '#3b2a00' } : { background: `${cor}1f`, color: cor }}>
              {medalha ? (k === 0 ? <Trophy className="h-4 w-4" /> : `${k + 1}º`) : `${k + 1}º`}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cor }} />{nomeCurto(l.id, l.nome)}
                </span>
                <span className="shrink-0 text-xs tabular-nums">
                  <span className="font-semibold">{fmtCompacto(l.mes)}</span>
                  {temMeta && <span className="ml-1.5 rounded-full px-1.5 py-0.5 font-bold text-white" style={{ background: COR_ESTADO[est] }}>{Math.round(pct)}%</span>}
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${temMeta ? Math.min(pct, 100) : 0}%`, background: `linear-gradient(90deg, ${cor}, ${COR_ESTADO[est]})` }} />
                {temMeta && <div className="absolute inset-y-0 w-0.5 bg-foreground/50" style={{ left: `${Math.min(ideal, 100)}%` }} title="Ritmo da meta hoje" />}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground">hoje {fmtCompacto(l.hoje)}</span>
                <div className="h-6 min-w-0 flex-1"><Sparkline valores={l.trinta} cor={cor} altura={24} /></div>
              </div>
            </div>
          </div>
        );
        return (
          <li key={l.id}>
            {onEscolher ? (
              <button type="button" onClick={() => onEscolher(alvo === l.id ? '' : l.id)}
                className={cn('w-full rounded-xl p-2 text-left transition hover:bg-muted/70', alvo === l.id && 'bg-muted ring-1 ring-[#0a748f]/40')}>
                {conteudo}
              </button>
            ) : <div className="p-2">{conteudo}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function Canais({ lojas }) {
  const online = (lojas || []).filter((l) => l.id === 'online').reduce((s, l) => s + (Number(l.mes) || 0), 0);
  const balcao = (lojas || []).filter((l) => l.id !== 'online').reduce((s, l) => s + (Number(l.mes) || 0), 0);
  const total = online + balcao;
  if (!total) return <p className="text-sm text-muted-foreground">Ainda sem vendas este mês.</p>;
  const pOnline = Math.round((online / total) * 100);
  return (
    <div className="flex items-center gap-5">
      <Anel pct={pOnline} cor="#10b981" tamanho={120} espessura={14}>
        <div>
          <p className="text-2xl font-extrabold tabular-nums leading-none">{pOnline}<span className="text-sm">%</span></p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">online</p>
        </div>
      </Anel>
      <div className="space-y-3 text-sm">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ background: MARCA.azul }} />Balcão</p>
          <p className="text-lg font-bold tabular-nums">{fmtCompacto(balcao)} <span className="text-xs font-medium text-muted-foreground">Kz · {100 - pOnline} %</span></p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Loja online</p>
          <p className="text-lg font-bold tabular-nums">{fmtCompacto(online)} <span className="text-xs font-medium text-muted-foreground">Kz · {pOnline} %</span></p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mais vendidos e últimas vendas

function Capa({ p, tamanho = 'h-12 w-9' }) {
  return p.capa
    ? <img src={p.capa} alt="" loading="lazy" className={cn(tamanho, 'shrink-0 rounded-md object-cover shadow-md ring-1 ring-black/10')} />
    : <span className={cn(tamanho, 'grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#0a748f] to-[#075a70] text-[10px] font-bold text-white/70')}>LIV</span>;
}

function MaisVendidos({ hoje, mes, tv }) {
  const [periodo, setPeriodo] = useState('hoje');
  const lista = (periodo === 'hoje' ? hoje : mes) || [];
  const podio = lista.slice(0, 3);
  const resto = lista.slice(3, tv ? 6 : 10);
  // 2.º, 1.º, 3.º — o primeiro ao meio e mais alto
  const ordem = podio.length === 3 ? [podio[1], podio[0], podio[2]] : podio;
  return (
    <section className="rounded-2xl border border-black/5 bg-card p-5 shadow-lg shadow-slate-900/5 dark:border-white/10 dark:shadow-black/30">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-serif text-base font-semibold tracking-tight text-[#1d2a3f] dark:text-foreground">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#b8892f]/20 text-[#7a5716]"><Trophy className="h-4 w-4" /></span>
          Mais vendidos
        </h3>
        {!tv && (
          <div className="inline-flex rounded-xl bg-muted p-1">
            {[['hoje', 'Hoje'], ['mes', 'Mês']].map(([v, rot]) => (
              <button key={v} type="button" onClick={() => setPeriodo(v)}
                className={cn('rounded-lg px-3 py-1 text-xs font-semibold transition', periodo === v ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>{rot}</button>
            ))}
          </div>
        )}
      </div>
      {!lista.length ? <p className="text-sm text-muted-foreground">Ainda sem vendas {periodo === 'hoje' ? 'hoje' : 'este mês'}.</p> : (
        <>
          <div className="mb-4 flex items-end justify-center gap-3">
            {ordem.map((p) => {
              const k = p.posicao - 1;
              return (
                <div key={p.chave} className={cn('flex w-28 flex-col items-center text-center', k === 0 && 'w-32')}>
                  <div className="relative">
                    <Capa p={p} tamanho={k === 0 ? 'h-28 w-20' : 'h-20 w-14'} />
                    <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full text-xs font-black shadow-md" style={{ background: MEDALHAS[k], color: '#3b2a00' }}>{p.posicao}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs font-semibold leading-tight">{p.titulo}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{Number(p.quantidade)} un · {fmtCompacto(p.total)}</p>
                  <div className="mt-1.5 w-full rounded-t-lg" style={{ height: k === 0 ? 28 : k === 1 ? 18 : 10, background: `linear-gradient(180deg, ${MEDALHAS[k]}, ${MEDALHAS[k]}55)` }} />
                </div>
              );
            })}
          </div>
          {resto.length > 0 && (
            <ol className="space-y-2 border-t pt-3">
              {resto.map((p) => {
                const subiu = periodo === 'hoje' && p.posicao_ontem != null ? p.posicao_ontem - p.posicao : null;
                return (
                  <li key={p.chave} className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm font-bold tabular-nums text-muted-foreground">{p.posicao}º</span>
                    <Capa p={p} tamanho="h-9 w-7" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.titulo}</span>
                    <span className="shrink-0 text-right text-xs tabular-nums"><span className="font-semibold">{Number(p.quantidade)}</span><span className="text-muted-foreground"> · {fmtCompacto(p.total)}</span></span>
                    {subiu != null && subiu !== 0 && (
                      <span className={cn('w-5 shrink-0', subiu > 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {subiu > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function Ultimas({ ultimas, alvos, tv }) {
  const lista = (ultimas || []).slice(0, tv ? 8 : 14);
  if (!lista.length) return <p className="text-sm text-muted-foreground">Ainda sem vendas.</p>;
  return (
    <ul className="space-y-1">
      <style>{'@keyframes painel-nova{0%{background:rgba(16,185,129,.22)}100%{background:transparent}}.painel-nova{animation:painel-nova 2.5s ease-out}@media (prefers-reduced-motion: reduce){.painel-nova{animation:none}}'}</style>
      {lista.map((u, k) => {
        const neg = Number(u.total) < 0;
        return (
          <li key={`${u.quando}-${u.numero}`} className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm', k === 0 && 'painel-nova', u.anulado && 'opacity-50')}>
            <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground">{horaDe(u.quando)}</span>
            <span className="flex w-28 shrink-0 items-center gap-1.5 truncate font-semibold">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: corDaLoja(u.alvo, alvos) }} />{nomeCurto(u.alvo, u.loja)}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              <span className={cn(u.anulado && 'line-through')}>{u.numero}</span>
              {u.artigo && <> · {u.artigo}{u.artigos > 1 ? ` +${u.artigos - 1}` : ''}</>}
              {u.anulado && ' · anulada'}
            </span>
            <span className={cn('shrink-0 font-mono font-bold tabular-nums', neg ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>
              {neg ? '−' : '+'}{fmtKz(Math.abs(Number(u.total)))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Os botões da faixa de cima (Metas, Publicidade, TV), em branco sobre o azul da marca. */
export function BotoesPainel({ onMetas, onPublicidade, onTv }) {
  const claro = 'border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white';
  return (
    <div className="flex flex-wrap gap-2">
      {onMetas && <Button size="sm" variant="outline" className={claro} onClick={onMetas}><Target className="mr-1.5 h-4 w-4" />Metas</Button>}
      {onPublicidade && <Button size="sm" variant="outline" className={claro} onClick={onPublicidade}><Megaphone className="mr-1.5 h-4 w-4" />Publicidade e rodapé</Button>}
      {onTv && <Button size="sm" className="bg-white font-semibold text-[#075a70] shadow hover:bg-white/90" onClick={onTv}><MonitorPlay className="mr-1.5 h-4 w-4" />Modo TV</Button>}
    </div>
  );
}
