// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Settings2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabaseClient';
import { onSignalStatus, signalStatus, subscribeSignal } from '@/lib/realtimeSignals';
import { cn } from '@/lib/utils';
import {
  COMPARACOES, COMPARACOES_CURTAS, contraComparacao, curvaAcumulada, fmtCompacto, fmtKz, horaDe, janelaDoGrafico, JANELAS,
  lerGraficoAoVivo, minutoDe, nomeCurto, ONDE_GRAFICO, valorEm, volumes,
} from '@/lib/painelGestao';
import { useNumeroAnimado } from '@/components/gestao/usePainelGestao';
import { MARCA } from '@/components/gestao/marca';

const SOBE = '#10b981';
const DESCE = '#ef4444';
const CINZA = '#94a3b8';

// ------------------------------------------------------------------ configuração guardada neste aparelho

const GUARDA = { pagina: 'painel-gestao-grafico', tv: 'painel-gestao-tv-grafico' };

/** A configuração do gráfico ao vivo neste aparelho (cada TV e cada computador tem a sua). */
export function useConfigGrafico(ecra = 'pagina') {
  const [cfg, setCfg] = useState(() => {
    try {
      return lerGraficoAoVivo(localStorage.getItem(GUARDA[ecra]), ecra);
    } catch {
      return lerGraficoAoVivo(null, ecra);
    }
  });
  const mudar = useCallback((parte) => setCfg((c) => {
    const novo = { ...c, ...parte };
    try { localStorage.setItem(GUARDA[ecra], JSON.stringify(novo)); } catch { /* sem armazenamento: só nesta sessão */ }
    return novo;
  }), [ecra]);
  return [cfg, mudar];
}

// ------------------------------------------------------------------ dados

/**
 * O acumulado de hoje e o do dia de comparação (public.painel_gestao_ao_vivo). Volta a pedir a cada venda (o sinal
 * «vendas» do canal «painel», o mesmo do painel), e de minuto a minuto por segurança (30 s sem tempo real).
 * `relogio()`: o minuto de agora em Angola, acertado pela hora do servidor.
 */
function useCurvaAoVivo({ alvo, canal, comparar }) {
  const [dados, setDados] = useState(null);
  const [falhou, setFalhou] = useState(false);
  const [ligacao, setLigacao] = useState(() => signalStatus('painel'));
  const desvio = useRef(0);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const n = ++pedido.current;
    const { data, error } = await supabase.rpc('painel_gestao_ao_vivo', { p_alvo: alvo || null, p_canal: canal || null, p_comparar: comparar });
    if (n !== pedido.current) return;
    if (error) {
      setFalhou(true);
      return;
    }
    setFalhou(false);
    // a hora de Angola que o servidor deu, menos a deste aparelho: o relógio do gráfico anda com ela
    desvio.current = minutoDe(data?.agora) * 60_000 - (Date.now() % 86_400_000);
    // de que loja e comparação são estes números (ao trocar, o gráfico muda de uma vez, sem animar a diferença)
    setDados({ ...data, __chave: `${alvo}|${canal}|${comparar}` });
  }, [alvo, canal, comparar]);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    let espera = null;
    const off = subscribeSignal('painel', 'vendas', () => {
      clearTimeout(espera);
      espera = setTimeout(() => carregarRef.current(), 600);
    });
    const offEstado = onSignalStatus('painel', setLigacao);
    return () => {
      clearTimeout(espera);
      off();
      offEstado();
    };
  }, []);
  useEffect(() => {
    const t = setInterval(carregar, ligacao === 'connected' ? 60_000 : 30_000);
    return () => clearInterval(t);
  }, [carregar, ligacao]);
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [carregar]);

  const relogio = useCallback(() => {
    const m = (((Date.now() % 86_400_000) + desvio.current) / 60_000) % 1440;
    return m < 0 ? m + 1440 : m;
  }, []);
  return { dados, falhou, aoVivo: !falhou && ligacao === 'connected', relogio };
}

/** Largura do elemento (o SVG desenha-se à medida, sem esticar as letras). */
function useLargura() {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setLargura(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

/** Altura do elemento, quando o gráfico enche o espaço que lhe dão (modo TV). */
function useAlturaSe(activo) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!activo || !el) return undefined;
    const ro = new ResizeObserver(([e]) => setH(Math.round(e.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [activo]);
  return [ref, h];
}

const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ o gráfico

/**
 * O gráfico «ao vivo» (docs/PAINEL-GESTAO.md §6.13), como os de bolsa: o acumulado de hoje sobe em degrau a cada venda
 * e segue a direito enquanto não entra nenhuma; a tracejado, o mesmo acumulado no dia de comparação. Verde à frente,
 * vermelho atrás; o valor de agora numa etiqueta à direita; barras de volume em baixo; e cada venda nova sobe a
 * partir do ponto de agora. `ecra`: 'pagina' (com a roda das definições) ou 'tv' (letra maior; definições no modo TV).
 * `encher`: ocupa a altura toda que lhe dão (o modo TV).
 */
export default function GraficoAoVivo({ alvo = '', canal = '', cfg, onCfg, alvos = [], ecra = 'pagina', altura, className, encher = false }) {
  const tv = ecra === 'tv';
  const { dados, falhou, aoVivo, relogio } = useCurvaAoVivo({ alvo, canal, comparar: cfg.comparar });
  const [agora, setAgora] = useState(() => relogio());
  const [refCaixa, largura] = useLargura();
  const [refAltura, alturaCaixa] = useAlturaSe(encher);
  const [bolhas, setBolhas] = useState([]);
  const [cursor, setCursor] = useState(null);
  const ultimaVista = useRef(null);

  // o ponto de agora anda sozinho (a linha segue a direito sem vendas)
  useEffect(() => {
    setAgora(relogio());
    const t = setInterval(() => setAgora(relogio()), 5_000);
    return () => clearInterval(t);
  }, [relogio, dados]);

  const hoje = useMemo(() => curvaAcumulada(dados?.hoje), [dados]);
  const comp = useMemo(() => curvaAcumulada(dados?.comparacao), [dados]);
  const total = hoje.length ? hoje[hoje.length - 1].v : 0;
  // só as vendas novas sobem a animar; a troca de loja (a TV roda) ou de comparação muda logo
  const chaveDados = dados?.__chave || '';
  const chaveAnterior = useRef(chaveDados);
  const trocou = chaveDados !== chaveAnterior.current;
  useEffect(() => { chaveAnterior.current = chaveDados; }, [chaveDados]);
  const mostrado = useNumeroAnimado(total, trocou ? 1 : 900);
  const compAgora = valorEm(comp, agora);
  const contra = contraComparacao(total, compAgora);
  const temComp = comp.length > 0;
  const cor = !temComp ? MARCA.petroleoClaro : contra.sobe ? SOBE : DESCE;

  // uma venda nova: a bolha «+ 12 500 Kz · Huambo» sobe do ponto de agora (não ao abrir nem ao trocar de loja)
  useEffect(() => { ultimaVista.current = null; }, [alvo, canal]);
  useEffect(() => {
    if (!dados) return;
    const u = dados.ultimas?.[0];
    const chave = u ? `${u.quando}|${u.numero}` : '';
    // a primeira leitura (ou a primeira depois de trocar de loja) só marca onde estamos
    if (ultimaVista.current === null) {
      ultimaVista.current = chave;
      return;
    }
    if (chave && chave !== ultimaVista.current) {
      const novas = [];
      for (const x of dados.ultimas) {
        if (`${x.quando}|${x.numero}` === ultimaVista.current) break;
        novas.push(x);
      }
      const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reduzir) {
        const id = Date.now();
        setBolhas((b) => [...b, ...novas.slice(0, 3).map((x, i) => ({ ...x, id: `${id}-${i}`, atraso: i * 350 }))]);
        setTimeout(() => setBolhas((b) => b.filter((x) => !String(x.id).startsWith(`${id}-`))), 3600);
      }
    }
    ultimaVista.current = chave;
  }, [dados]);

  // ---------------------------------------------------------------- geometria
  const W = Math.max(largura, 280);
  const H = encher ? Math.max(alturaCaixa, 160) : (altura || (tv ? 260 : 240));
  const esq = 10;
  const dir = tv ? 96 : 84;
  const topo = 16;
  const baixo = 24;
  const pw = W - esq - dir;
  const ph = H - topo - baixo;
  const { ini, fim } = janelaDoGrafico(cfg.janela, agora, hoje, comp);
  const visiveisHoje = hoje.filter((p) => p.m >= ini && p.m <= agora);
  const visiveisComp = comp.filter((p) => p.m >= ini && p.m <= fim);
  const v0 = valorEm(hoje, ini - 1e-6);
  const c0 = valorEm(comp, ini - 1e-6);
  const todos = [0, v0, c0, mostrado, total, ...visiveisHoje.map((p) => p.v), ...visiveisComp.map((p) => p.v)];
  let maxY = Math.max(...todos);
  let minY = Math.min(...todos);
  if (maxY === minY) maxY = minY + 1000;
  const folgaY = (maxY - minY) * 0.12;
  maxY += folgaY;
  minY = minY < 0 ? minY - folgaY : 0;
  const x = (m) => esq + ((Math.min(Math.max(m, ini), fim) - ini) / (fim - ini)) * pw;
  const y = (v) => topo + (1 - (v - minY) / (maxY - minY)) * ph;
  const agoraX = x(agora);

  // o degrau: a direito até à venda, sobe (ou desce) nela; a última subida anima-se até ao valor novo
  const caminho = (pontos, inicio, ate, animarUltimo) => {
    let d = `M${x(ini).toFixed(1)},${y(inicio).toFixed(1)}`;
    pontos.forEach((p, i) => {
      const v = animarUltimo && i === pontos.length - 1 ? mostrado : p.v;
      d += `H${x(p.m).toFixed(1)}V${y(v).toFixed(1)}`;
    });
    return `${d}H${x(ate).toFixed(1)}`;
  };
  const linhaHoje = caminho(visiveisHoje, v0, agora, true);
  const area = `${linhaHoje}V${y(Math.max(minY, 0)).toFixed(1)}H${x(ini).toFixed(1)}Z`;
  const linhaComp = temComp ? caminho(visiveisComp, c0, fim, false) : '';

  const passo = cfg.janela === '1h' ? 2 : cfg.janela === '3h' ? 5 : 15;
  const barras = cfg.volume ? volumes(hoje, ini, Math.min(fim, Math.ceil(agora / passo) * passo + passo), passo) : [];
  const maxBarra = Math.max(...barras.map((b) => Math.abs(b.total)), 1);
  const alturaBarras = ph * 0.2;

  const horas = [];
  const cada = (fim - ini) <= 60 ? 15 : (fim - ini) <= 180 ? 30 : pw < 520 ? 180 : pw < 900 ? 120 : 60;
  for (let m = Math.ceil(ini / cada) * cada; m <= fim; m += cada) horas.push(m);
  const linhasY = Array.from({ length: 4 }, (_, i) => minY + ((maxY - minY) * (i + 1)) / 5);

  const yAgora = y(mostrado);
  const yComp = y(compAgora);
  const etiquetasPerto = temComp && Math.abs(yAgora - yComp) < 22;
  const tamEtiqueta = tv ? 13 : 11;
  const estreito = W < 720;
  // as etiquetas do eixo que ficariam por baixo das de agora e da comparação não se escrevem
  const livre = (yy) => Math.abs(yy - yAgora) > 18 && (!temComp || Math.abs(yy - yComp) > 18);

  const moverCursor = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = ini + ((e.clientX - r.left - esq) / pw) * (fim - ini);
    setCursor(m >= ini && m <= fim ? m : null);
  };

  return (
    <section className={cn('relative overflow-hidden rounded-2xl border border-white/10 text-white shadow-xl shadow-slate-900/20', encher && 'flex h-full flex-col', className)}
      style={{ background: `radial-gradient(60rem 20rem at 85% 0%, ${cor}22, transparent 60%), linear-gradient(180deg, ${MARCA.marinhoProfundo}, #031f27)` }}
      aria-label="Vendas de hoje, ao vivo">
      <style>{`@keyframes gav-pulso{0%{transform:scale(1);opacity:.55}100%{transform:scale(4);opacity:0}}
        @keyframes gav-bolha{0%{transform:translate(-50%,0) scale(.85);opacity:0}12%{opacity:1;transform:translate(-50%,-6px) scale(1)}100%{transform:translate(-50%,-38px) scale(1);opacity:0}}
        @keyframes gav-luz{0%,100%{opacity:1}50%{opacity:.35}}
        .gav-pulso{transform-box:fill-box;transform-origin:center;animation:gav-pulso 1.8s ease-out infinite}.gav-luz{animation:gav-luz 1.4s ease-in-out infinite}
        .gav-bolha{animation:gav-bolha 3.2s cubic-bezier(.2,.7,.2,1) both}
        @media (prefers-reduced-motion: reduce){.gav-pulso,.gav-luz,.gav-bolha{animation:none}}`}</style>

      {/* cabeçalho: ao vivo, o total de hoje e a diferença para o dia de comparação à mesma hora */}
      <div className={cn('flex flex-wrap items-end gap-x-6 gap-y-2', tv ? 'px-5 pt-4' : 'px-4 pt-3.5 sm:px-5')}>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px]', aoVivo ? 'bg-red-500/90 text-white' : 'bg-white/15 text-white/80')}>
              <span className={cn('h-1.5 w-1.5 rounded-full bg-white', aoVivo && 'gav-luz')} />{aoVivo ? 'Ao vivo' : falhou ? 'Sem ligação' : 'A actualizar'}
            </span>
            <Activity className="h-3.5 w-3.5" />Vendas de hoje{alvo ? ` · ${nomeCurto(alvo, alvos.find((a) => a.id === alvo)?.nome)}` : ''}
          </p>
          <p className={cn('mt-1 font-mono font-extrabold tabular-nums tracking-tight', tv && !estreito ? 'text-4xl' : estreito ? 'text-2xl' : 'text-3xl')}>{fmtKz(mostrado)}</p>
        </div>
        {temComp && (
          <div className={cn('flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-sm font-bold tabular-nums', contra.sobe ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300')}>
            {contra.sobe ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {contra.pct != null ? `${contra.pct >= 0 ? '+' : '−'}${Math.abs(contra.pct).toFixed(1).replace('.', ',')} %` : ''}
            <span className="font-medium">{contra.diferenca >= 0 ? '+' : '−'}{fmtCompacto(Math.abs(contra.diferenca))} Kz</span>
            <span className="font-sans text-xs font-normal text-white/60">vs {COMPARACOES_CURTAS[cfg.comparar]}{estreito ? '' : ` às ${hhmm(agora)}`}</span>
          </div>
        )}
        <div className={cn('ml-auto flex items-center gap-4 text-xs text-white/70', estreito && encher && 'hidden')}>
          <span><b className="text-sm text-white tabular-nums">{hoje.reduce((s, p) => s + p.n, 0)}</b> vendas</span>
          {dados?.ultimas?.[0] && <span>última às <b className="text-sm text-white">{horaDe(dados.ultimas[0].quando)}</b></span>}
          {temComp && !estreito && <span className="hidden sm:inline">{COMPARACOES_CURTAS[cfg.comparar]} fechou em <b className="text-white">{fmtCompacto(dados.comparacao_total)} Kz</b></span>}
          {!tv && onCfg && <Definicoes cfg={cfg} onCfg={onCfg} />}
        </div>
      </div>

      <div ref={(el) => { refCaixa.current = el; refAltura.current = el; }} className={cn('relative', encher && 'min-h-0 flex-1')}>
        {largura > 0 && (
          <svg width={W} height={H} className={cn('select-none', encher ? 'absolute inset-0' : 'block')} onMouseMove={tv ? undefined : moverCursor} onMouseLeave={() => setCursor(null)}>
            <defs>
              <linearGradient id="gav-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity="0.38" />
                <stop offset="100%" stopColor={cor} stopOpacity="0" />
              </linearGradient>
              <filter id="gav-brilho" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* grelha */}
            {linhasY.map((v) => (
              <g key={v}>
                <line x1={esq} x2={esq + pw} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity="0.07" />
                {livre(y(v)) && <text x={esq + pw + 8} y={y(v) + 4} fontSize={tamEtiqueta - 1} fill="#fff" fillOpacity="0.45" className="tabular-nums">{fmtCompacto(v)}</text>}
              </g>
            ))}
            {horas.map((m) => (
              <g key={m}>
                <line x1={x(m)} x2={x(m)} y1={topo} y2={topo + ph} stroke="#fff" strokeOpacity="0.05" />
                <text x={Math.max(x(m), esq + 16)} y={H - 7} fontSize={tamEtiqueta - 1} fill="#fff" fillOpacity="0.5" textAnchor="middle">{hhmm(m)}</text>
              </g>
            ))}
            {minY < 0 && <line x1={esq} x2={esq + pw} y1={y(0)} y2={y(0)} stroke="#fff" strokeOpacity="0.25" strokeDasharray="2 4" />}

            {/* volume */}
            {barras.map((b) => b.total !== 0 && (
              <rect key={b.m} x={x(b.m) + 1} width={Math.max((pw * passo) / (fim - ini) - 2, 1)}
                y={topo + ph - (Math.abs(b.total) / maxBarra) * alturaBarras} height={(Math.abs(b.total) / maxBarra) * alturaBarras}
                rx="1.5" fill={b.total < 0 ? DESCE : cor} fillOpacity="0.28" />
            ))}

            {/* comparação, a tracejado, até ao fim do eixo */}
            {temComp && <path d={linhaComp} fill="none" stroke={CINZA} strokeOpacity="0.7" strokeWidth="1.6" strokeDasharray="5 5" />}

            {/* hoje: área e linha em degraus */}
            <path d={area} fill="url(#gav-area)" />
            <path d={linhaHoje} fill="none" stroke={cor} strokeWidth={tv ? 3 : 2.4} strokeLinejoin="round" filter="url(#gav-brilho)" />

            {/* linha do preço de agora e as etiquetas à direita */}
            <line x1={esq} x2={esq + pw} y1={yAgora} y2={yAgora} stroke={cor} strokeOpacity="0.55" strokeDasharray="3 4" />
            <line x1={agoraX} x2={agoraX} y1={topo} y2={topo + ph} stroke="#fff" strokeOpacity="0.12" />
            {temComp && (
              <g transform={`translate(${esq + pw + 2},${(etiquetasPerto ? yAgora + (yComp >= yAgora ? 22 : -22) : yComp) - 10})`}>
                <rect width={dir - 6} height={20} rx="4" fill="#334155" />
                <text x={(dir - 6) / 2} y={14} fontSize={tamEtiqueta} fill="#e2e8f0" textAnchor="middle" className="tabular-nums">{fmtCompacto(compAgora)}</text>
              </g>
            )}
            <g transform={`translate(${esq + pw + 2},${yAgora - 11})`}>
              <rect width={dir - 6} height={22} rx="4" fill={cor} />
              <text x={(dir - 6) / 2} y={15.5} fontSize={tamEtiqueta + 1} fontWeight="700" fill="#03161c" textAnchor="middle" className="tabular-nums">{fmtCompacto(mostrado)}</text>
            </g>

            {/* o ponto de agora, a pulsar */}
            <circle cx={agoraX} cy={yAgora} r="5" fill={cor} className="gav-pulso" />
            <circle cx={agoraX} cy={yAgora} r={tv ? 5.5 : 4.5} fill={cor} stroke="#fff" strokeWidth="2" />

            {/* cursor (computador) */}
            {cursor != null && (
              <g pointerEvents="none">
                <line x1={x(cursor)} x2={x(cursor)} y1={topo} y2={topo + ph} stroke="#fff" strokeOpacity="0.4" />
                <circle cx={x(cursor)} cy={y(cursor <= agora ? valorEm(hoje, cursor) : total)} r="3.5" fill={cor} />
                {temComp && <circle cx={x(cursor)} cy={y(valorEm(comp, cursor))} r="3" fill={CINZA} />}
              </g>
            )}
          </svg>
        )}
        {cursor != null && largura > 0 && (
          <div className="pointer-events-none absolute top-2 rounded-lg px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-white/10"
            style={{ left: Math.min(Math.max(x(cursor) - 70, 4), W - 150), background: '#031f27' }}>
            <p className="font-mono font-bold">{hhmm(cursor)}</p>
            <p className="tabular-nums"><span className="text-white/60">Hoje </span>{cursor <= agora ? fmtKz(valorEm(hoje, cursor)) : '—'}</p>
            {temComp && <p className="tabular-nums"><span className="text-white/60">{COMPARACOES_CURTAS[cfg.comparar]} </span>{fmtKz(valorEm(comp, cursor))}</p>}
          </div>
        )}
        {/* as vendas novas sobem do ponto de agora */}
        {bolhas.map((b) => {
          const neg = Number(b.total) < 0;
          return (
            <span key={b.id} className={cn('gav-bolha pointer-events-none absolute z-10 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs font-bold shadow-lg', neg ? 'bg-red-500 text-white' : 'bg-emerald-400 text-[#03161c]')}
              style={{ left: agoraX, top: Math.max(yAgora - 34, 0), animationDelay: `${b.atraso}ms`, fontSize: tv ? 15 : 12 }}>
              {neg ? '−' : '+'}{fmtKz(Math.abs(Number(b.total)))} · {nomeCurto(b.alvo, b.loja)}
            </span>
          );
        })}
        {!dados && <p className="absolute inset-0 grid place-items-center text-sm text-white/60">{falhou ? 'Sem ligação ao painel.' : 'A carregar…'}</p>}
      </div>
    </section>
  );
}

function Escolha({ opcoes, valor, onEscolher }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(opcoes).map(([id, rot]) => (
        <button key={id} type="button" onClick={() => onEscolher(id)}
          className={cn('rounded-md px-2 py-1 text-xs', valor === id ? 'bg-[#0a748f] font-semibold text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}>
          {rot}
        </button>
      ))}
    </div>
  );
}

/** As definições do gráfico (onde aparece, contra que dia, a janela de tempo, as barras de volume). */
export function DefinicoesGrafico({ cfg, onCfg, ecra = 'pagina' }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Onde mostrar</p>
        {Object.entries(ONDE_GRAFICO[ecra]).map(([id, rot]) => (
          <label key={id} className="flex cursor-pointer items-center gap-2">
            <input type="radio" name={`onde-grafico-${ecra}`} checked={cfg.onde === id} onChange={() => onCfg({ onde: id })} />
            {rot}
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Comparar com</p>
        <Escolha opcoes={COMPARACOES} valor={cfg.comparar} onEscolher={(v) => onCfg({ comparar: v })} />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Tempo no gráfico</p>
        <Escolha opcoes={JANELAS} valor={cfg.janela} onEscolher={(v) => onCfg({ janela: v })} />
      </div>
      <label className="flex items-center justify-between gap-2">
        <span>Barras de volume</span>
        <Switch checked={cfg.volume} onCheckedChange={(v) => onCfg({ volume: v })} />
      </label>
    </div>
  );
}

function Definicoes({ cfg, onCfg }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Definições do gráfico ao vivo">
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 font-semibold">Gráfico ao vivo</p>
        <DefinicoesGrafico cfg={cfg} onCfg={onCfg} />
      </PopoverContent>
    </Popover>
  );
}
