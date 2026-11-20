// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useCallback, useEffect, useState } from 'react';
import { Maximize, Minimize, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FONTES_MONTRA, LAYOUTS_TV, lerTv, MONTRA_A_CADA, MONTRA_DURACOES, nomeCurto, rodaDeLojas, TRANSICOES } from '@/lib/painelGestao';
import PainelGestao from '@/components/gestao/PainelGestao';
import { useMidiaTv } from '@/components/gestao/PublicidadeTv';
import { PublicidadeComMontra, useConfigMontra } from '@/components/gestao/MontraLivros';
import RodapeNoticias from '@/components/gestao/RodapeNoticias';
import { MARCA } from '@/components/gestao/marca';
import GraficoAoVivo, { DefinicoesGrafico, useConfigGrafico } from '@/components/gestao/GraficoAoVivo';

const GUARDA = 'painel-gestao-tv';

function lerGuardado() {
  try {
    return lerTv(localStorage.getItem(GUARDA));
  } catch {
    return lerTv(null);
  }
}

/**
 * Modo TV (a televisão da sede): ecrã inteiro e escuro, o painel de um lado e a publicidade do outro (ou só o
 * painel), a rodar entre a empresa e cada loja. A configuração fica nesta televisão. Mantém o ecrã ligado e
 * recarrega à meia-noite, para o dia novo.
 */
export default function ModoTv({ canal = '', alvoInicial = '', onSair, logo, nome }) {
  const [cfg, setCfg] = useState(lerGuardado);
  const [cfgGrafico, mudarGrafico] = useConfigGrafico('tv');
  const [cfgMontra, mudarMontra] = useConfigMontra();
  const [montraJa, setMontraJa] = useState(0);
  const [alvos, setAlvos] = useState([]);
  const [dados, setDados] = useState(null);
  const [indice, setIndice] = useState(0);
  const [ecraInteiro, setEcraInteiro] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  const { midia } = useMidiaTv();
  const roda = cfg.rodarLojas ? rodaDeLojas(alvos) : [alvoInicial];
  const alvo = roda[indice % Math.max(roda.length, 1)] ?? alvoInicial;

  const mudar = (parte) => {
    const novo = { ...cfg, ...parte };
    setCfg(novo);
    try { localStorage.setItem(GUARDA, JSON.stringify(novo)); } catch { /* sem armazenamento: só nesta sessão */ }
  };

  // roda entre «Todas» e cada loja
  useEffect(() => {
    if (!cfg.rodarLojas || roda.length < 2) return undefined;
    const t = setInterval(() => setIndice((i) => (i + 1) % roda.length), cfg.segundosPorLoja * 1000);
    return () => clearInterval(t);
  }, [cfg.rodarLojas, cfg.segundosPorLoja, roda.length]);

  // o ecrã não se apaga (onde o browser deixa) e volta a pedir o bloqueio ao regressar ao separador
  useEffect(() => {
    let bloqueio = null;
    const pedir = async () => {
      try { bloqueio = await navigator.wakeLock?.request('screen'); } catch { /* sem permissão: a TV decide */ }
    };
    pedir();
    const f = () => document.visibilityState === 'visible' && pedir();
    document.addEventListener('visibilitychange', f);
    return () => {
      document.removeEventListener('visibilitychange', f);
      try { bloqueio?.release(); } catch { /* já libertado */ }
    };
  }, []);

  // recarrega à meia-noite e cinco (hora de Angola): o dia novo, o código novo
  useEffect(() => {
    const agora = new Date();
    const luanda = new Date(agora.toLocaleString('en-US', { timeZone: 'Africa/Luanda' }));
    const meiaNoite = new Date(luanda);
    meiaNoite.setHours(24, 5, 0, 0);
    // sem internet, recarregar deixava a TV numa página de erro: espera que a rede volte (a montra segue entretanto)
    let t2 = null;
    const recarregar = () => {
      if (navigator.onLine === false) t2 = setTimeout(recarregar, 5 * 60_000);
      else window.location.reload();
    };
    const t = setTimeout(recarregar, meiaNoite - luanda);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    const f = () => setEcraInteiro(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const alternarEcra = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* o browser não deixa */ }
  };

  const guardarAlvos = useCallback((d) => {
    setAlvos(d?.alvos || []);
    setDados(d);
  }, []);
  const pub = LAYOUTS_TV[cfg.layout]?.publicidade ?? 0;
  // o gráfico ao vivo: «automático» fica por baixo da publicidade (ou no topo do painel, sem publicidade)
  const ondeGrafico = cfgGrafico.onde === 'auto' ? (pub > 0 ? 'lado' : 'topo') : (cfgGrafico.onde === 'lado' && !pub ? 'topo' : cfgGrafico.onde);
  const graficoTv = (props) => (
    <GraficoAoVivo alvo={alvo} canal={canal} cfg={cfgGrafico} alvos={alvos} ecra="tv" {...props} />
  );
  const painel = (
    <div className="h-full overflow-y-auto p-4">
      <PainelGestao alvo={alvo} canal={canal} variante="tv" onDados={guardarAlvos} aoVivo={{ ...cfgGrafico, onde: ondeGrafico === 'topo' ? 'topo' : 'fora' }} />
    </div>
  );

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col text-foreground"
      style={{ background: `radial-gradient(90rem 50rem at 0% 0%, ${MARCA.azul}55, transparent 60%), ${MARCA.marinhoProfundo}` }}>
      <div className="flex items-center gap-4 border-b border-white/10 px-5 py-2.5" style={{ background: `linear-gradient(90deg, ${MARCA.marinho}, ${MARCA.marinhoProfundo})` }}>
        <img src={MARCA.logoBranco} alt={MARCA.nome || nome} className="h-10 w-auto object-contain" />
        <span className="h-8 w-px bg-white/20" />
        <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#fcefc7]">Painel de Gestão</span>
        {cfg.rodarLojas && roda.length > 1 && (
          <span className="flex gap-1">
            {roda.map((a, k) => (
              <span key={a || 'todas'} className={cn('rounded-full px-2 py-0.5 text-[11px]', k === indice % roda.length ? 'bg-white font-semibold text-[#075a70]' : 'bg-white/10 text-white/75')}>
                {a ? nomeCurto(a, alvos.find((x) => x.id === a)?.nome) : 'Todas'}
              </span>
            ))}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {pub > 0 && (
            <Button size="icon" variant="ghost" onClick={() => mudar({ som: !cfg.som })} aria-label={cfg.som ? 'Sem som' : 'Com som'} title={cfg.som ? 'Tirar o som da publicidade' : 'Pôr som na publicidade'}>
              {cfg.som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Definições da TV"><Settings2 className="h-4 w-4" /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="dark max-h-[80vh] w-80 space-y-3 overflow-y-auto text-sm">
              <p className="font-semibold">Este ecrã</p>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Divisão</p>
                {Object.entries(LAYOUTS_TV).map(([id, l]) => (
                  <label key={id} className="flex cursor-pointer items-center gap-2">
                    <input type="radio" name="layout-tv" checked={cfg.layout === id} onChange={() => mudar({ layout: id })} />
                    {l.rotulo}
                  </label>
                ))}
              </div>
              {pub > 0 && (
                <div className="flex items-center justify-between">
                  <span>Publicidade à {cfg.lado}</span>
                  <Button size="sm" variant="outline" onClick={() => mudar({ lado: cfg.lado === 'esquerda' ? 'direita' : 'esquerda' })}>Trocar</Button>
                </div>
              )}
              {pub > 0 && (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Transição da publicidade</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(TRANSICOES).map(([id, rot]) => (
                        <button key={id} type="button" onClick={() => mudar({ transicao: id })}
                          className={cn('rounded-md px-2 py-1 text-xs', cfg.transicao === id ? 'bg-white font-semibold text-[#075a70]' : 'bg-white/10 text-white/80 hover:bg-white/20')}>
                          {rot}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center justify-between gap-2">
                    <span>Vinhetas entre os anúncios</span>
                    <Switch checked={cfg.vinhetas} onCheckedChange={(v) => mudar({ vinhetas: v })} />
                  </label>
                </>
              )}
              {pub > 0 && (
                <details className="rounded-lg bg-white/5 p-2">
                  <summary className="cursor-pointer font-semibold">Montra de livros</summary>
                  <div className="mt-2 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Livros</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(FONTES_MONTRA).map(([id, rot]) => (
                          <button key={id} type="button" onClick={() => mudarMontra({ fonte: id })}
                            className={cn('rounded-md px-2 py-1 text-xs', cfgMontra.fonte === id ? 'bg-white font-semibold text-[#075a70]' : 'bg-white/10 text-white/80 hover:bg-white/20')}>{rot}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Entre a publicidade, com a internet estável</p>
                      <div className="flex flex-wrap gap-1">
                        {MONTRA_A_CADA.map((m) => (
                          <button key={m} type="button" onClick={() => mudarMontra({ aCada: m })}
                            className={cn('rounded-md px-2 py-1 text-xs', cfgMontra.aCada === m ? 'bg-white font-semibold text-[#075a70]' : 'bg-white/10 text-white/80 hover:bg-white/20')}>{m ? `de ${m} em ${m} min` : 'nunca'}</button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Quanto tempo de cada vez</p>
                      <div className="flex flex-wrap gap-1">
                        {MONTRA_DURACOES.map((d) => (
                          <button key={d} type="button" onClick={() => mudarMontra({ duracao: d })}
                            className={cn('rounded-md px-2 py-1 text-xs', cfgMontra.duracao === d ? 'bg-white font-semibold text-[#075a70]' : 'bg-white/10 text-white/80 hover:bg-white/20')}>{d < 60 ? `${d} s` : d % 60 ? `${Math.floor(d / 60)} min ${d % 60} s` : `${d / 60} min`}</button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center justify-between gap-2"><span>Sempre que a internet falhar</span><Switch checked={cfgMontra.semInternet} onCheckedChange={(v) => mudarMontra({ semInternet: v })} /></label>
                    <label className="flex items-center justify-between gap-2"><span>Quando não há publicidade</span><Switch checked={cfgMontra.semPublicidade} onCheckedChange={(v) => mudarMontra({ semPublicidade: v })} /></label>
                    <label className="flex items-center justify-between gap-2"><span>Mostrar os preços</span><Switch checked={cfgMontra.precos} onCheckedChange={(v) => mudarMontra({ precos: v })} /></label>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setMontraJa(Date.now())}>Mostrar a montra já</Button>
                  </div>
                </details>
              )}
              <details className="rounded-lg bg-white/5 p-2">
                <summary className="cursor-pointer font-semibold">Gráfico ao vivo</summary>
                <div className="mt-2"><DefinicoesGrafico cfg={cfgGrafico} onCfg={mudarGrafico} ecra="tv" /></div>
              </details>
              <label className="flex items-center justify-between gap-2">
                <span>Rodar entre a empresa e cada loja</span>
                <Switch checked={cfg.rodarLojas} onCheckedChange={(v) => mudar({ rodarLojas: v })} />
              </label>
              {cfg.rodarLojas && (
                <label className="flex items-center justify-between gap-2">
                  <span>Segundos em cada uma</span>
                  <input type="number" min={10} max={600} value={cfg.segundosPorLoja}
                    onChange={(e) => mudar({ segundosPorLoja: Math.min(Math.max(Number(e.target.value) || 30, 10), 600) })}
                    className="w-20 rounded-md border bg-background px-2 py-1 text-right" />
                </label>
              )}
            </PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" onClick={alternarEcra} aria-label={ecraInteiro ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'}>
            {ecraInteiro ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          {onSair && <Button size="icon" variant="ghost" onClick={onSair} aria-label="Sair do modo TV"><X className="h-4 w-4" /></Button>}
        </div>
      </div>
      <div className={cn('flex min-h-0 flex-1', cfg.lado === 'direita' && 'flex-row-reverse')}>
        {pub > 0 && (
          <div className="flex h-full shrink-0 flex-col gap-3 p-3" style={{ width: `${pub}%` }}>
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
              <PublicidadeComMontra midia={midia} som={cfg.som} logo={MARCA.logoBranco || logo} nome={nome} transicao={cfg.transicao} vinhetas={cfg.vinhetas}
                montra={cfgMontra} agora={montraJa} />
            </div>
            {ondeGrafico === 'lado' && <div className="h-[40%] shrink-0">{graficoTv({ encher: true, className: 'h-full' })}</div>}
          </div>
        )}
        <div className="min-w-0 flex-1">{painel}</div>
      </div>
      {ondeGrafico === 'faixa' && <div className="h-[30vh] shrink-0 px-3 pb-2">{graficoTv({ encher: true, className: 'h-full' })}</div>}
      {/* o rodapé de noticiário, a toda a largura */}
      {dados && <RodapeNoticias dados={dados} tv />}
    </div>
  );
}
