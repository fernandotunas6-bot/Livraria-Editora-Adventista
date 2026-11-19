import React, { useCallback, useEffect, useState } from 'react';
import { Maximize, Minimize, Settings2, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { LAYOUTS_TV, lerTv, nomeCurto, rodaDeLojas } from '@/lib/painelGestao';
import PainelGestao from '@/components/gestao/PainelGestao';
import { LeitorPublicidade, useMidiaTv } from '@/components/gestao/PublicidadeTv';

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
  const [alvos, setAlvos] = useState([]);
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
    const t = setTimeout(() => window.location.reload(), meiaNoite - luanda);
    return () => clearTimeout(t);
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

  const guardarAlvos = useCallback((d) => setAlvos(d?.alvos || []), []);
  const pub = LAYOUTS_TV[cfg.layout]?.publicidade ?? 0;
  const painel = (
    <div className="h-full overflow-y-auto p-4">
      <PainelGestao alvo={alvo} canal={canal} variante="tv" onDados={guardarAlvos} />
    </div>
  );

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        {logo && <img src={logo} alt="" className="h-7 w-auto object-contain" />}
        <span className="text-sm font-semibold">{nome} · Painel de Gestão</span>
        {cfg.rodarLojas && roda.length > 1 && (
          <span className="flex gap-1">
            {roda.map((a, k) => (
              <span key={a || 'todas'} className={cn('rounded-full px-2 py-0.5 text-[11px]', k === indice % roda.length ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
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
            <PopoverContent align="end" className="dark w-80 space-y-3 text-sm">
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
          <div className="h-full shrink-0" style={{ width: `${pub}%` }}>
            <LeitorPublicidade midia={midia} som={cfg.som} logo={logo} nome={nome} />
          </div>
        )}
        <div className="min-w-0 flex-1">{painel}</div>
      </div>
    </div>
  );
}
