import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Check, ChevronDown, ChevronUp, Loader2, Siren, Volume2, X } from 'lucide-react';
import { acknowledgeOrder, dismissAlert, listActionAlerts } from '@/lib/opsApi';
import { useSignal } from '@/hooks/useSignal';
import { cn } from '@/lib/utils';

/** "3 avisos por tratar · 2 encomendas por assumir · 1 crítico" */
export function alertSummary(alerts) {
  const list = Array.isArray(alerts) ? alerts : [];
  const claims = list.filter((a) => a.kind === 'new_order').length;
  const critical = list.filter((a) => a.severity === 'critical').length;
  return [
    `${list.length} ${list.length === 1 ? 'aviso por tratar' : 'avisos por tratar'}`,
    claims ? `${claims} ${claims === 1 ? 'encomenda por assumir' : 'encomendas por assumir'}` : '',
    critical ? `${critical} ${critical === 1 ? 'crítico' : 'críticos'}` : '',
  ].filter(Boolean).join(' · ');
}

const POLL_MS = 20000;
const SOUND_KEY = 'livraria_alertas_som';

/** Dois toques curtos (Web Audio): sem ficheiro de som para carregar. Crítico: três, mais agudos. */
function ring(critical) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beeps = critical ? [0, 0.25, 0.5] : [0, 0.3];
    for (const at of beeps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = critical ? 1046 : 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    }
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    /* sem som: fica o alerta no ecrã */
  }
}

function systemNotify(alert) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(alert.title, { body: alert.body, tag: `alerta-${alert.id}`, requireInteraction: alert.severity === 'critical' });
    n.onclick = () => window.focus();
  } catch {
    /* alguns browsers só deixam notificar pelo service worker */
  }
}

/**
 * Alertas da operação no painel, para quem está na loja: cada encomenda nova e cada alerta
 * alto ou crítico aparece numa barra fixa, com som e notificação do sistema, até alguém o
 * assumir. Pensado para o computador ou tablet da loja, que fica com o painel aberto.
 */
export default function StaffAlertBar({ onOpen }) {
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Fechada, mostra dois avisos (um no telemóvel); "Ver todos" abre o resto numa lista com scroll.
  // Aberta com quatro avisos de três linhas, a barra fixa tapava o ecrã inteiro do telemóvel em
  // todas as páginas do painel.
  const [expanded, setExpanded] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
  });
  const seen = useRef(new Set());
  const first = useRef(true);

  const poll = useCallback(async () => {
    try {
      const list = await listActionAlerts();
      setAlerts(list);
      setError('');
      const fresh = list.filter((a) => !seen.current.has(a.id));
      for (const a of list) seen.current.add(a.id);
      // Na primeira leitura não toca (eram avisos de antes de abrir o painel).
      if (!first.current && fresh.length) {
        if (soundOn) ring(fresh.some((a) => a.severity === 'critical'));
        if (document.hidden) fresh.slice(0, 3).forEach(systemNotify);
      }
      first.current = false;
    } catch (err) {
      setError(err.message || 'Sem ligação aos avisos.');
    }
  }, [soundOn]);

  // Tempo real: um alerta novo, uma encomenda nova ou uma mensagem chegam na hora; a consulta
  // fica de reserva, de 2 em 2 minutos com o canal ligado (de 20 em 20 segundos sem ele).
  const live = useSignal('painel', ['alertas', 'orders', 'atendimento'], () => poll());

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, live ? 120_000 : POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll, live]);

  const enableSound = async () => {
    // O som e as notificações precisam de um clique (regra dos browsers).
    ring(false);
    try { localStorage.setItem(SOUND_KEY, '1'); } catch { /* sem armazenamento */ }
    setSoundOn(true);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
    } catch { /* recusado */ }
  };

  const take = async (alert) => {
    setBusy(alert.id);
    try {
      let note = '';
      if (alert.kind === 'new_order' && alert.order_id) {
        const r = await acknowledgeOrder(alert.order_id);
        if (r?.already && r.by_name) note = `Esta encomenda já foi assumida por ${r.by_name}.`;
      } else {
        await dismissAlert(alert.id);
      }
      await poll();
      // Depois de actualizar: a leitura limpa os erros, e esta nota tem de ficar à vista.
      if (note) setError(note);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  if (!alerts.length && soundOn && !error) return null;
  const critical = alerts.some((a) => a.severity === 'critical');

  const shown = alerts.slice(0, expanded ? 12 : 2);
  const more = alerts.length - 2;

  return (
    <div
      role="region"
      aria-label="Alertas da operação"
      className={`sticky top-0 z-30 border-b ${critical ? 'border-destructive/40 bg-destructive/10' : alerts.length ? 'border-amber-500/40 bg-amber-50' : 'border-border bg-muted/40'}`}
    >
      <div className="container-custom py-2">
        {(alerts.length > 0 || !soundOn) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {alerts.length > 0 && (
              <p className={cn('text-xs font-semibold', critical ? 'text-destructive' : 'text-amber-900')} aria-live="polite">
                {alertSummary(alerts)}
              </p>
            )}
            <div className="ml-auto flex items-center gap-2">
              {!soundOn && (
                <button
                  type="button"
                  onClick={enableSound}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
                  title="Som e notificação do sistema a cada encomenda nova, neste aparelho"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Activar som
                </button>
              )}
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  aria-expanded={expanded}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold hover:bg-muted"
                >
                  {expanded ? <>Mostrar menos <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></> : <>Ver todos ({alerts.length}) <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>}
                </button>
              )}
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-1.5 text-xs text-destructive">{error}</p>}
        {shown.length > 0 && (
          <div className={cn('mt-2 space-y-1.5', expanded && 'max-h-[55vh] overflow-y-auto pr-1')}>
            {shown.map((a, i) => (
              <div
                key={a.id}
                className={cn('flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm shadow-xs', !expanded && i > 0 && 'max-sm:hidden')}
              >
                {a.severity === 'critical' ? <Siren className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /> : <BellRing className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold max-sm:block max-sm:truncate">{a.title}</span>
                  {/* No telemóvel, uma linha do texto, por baixo do título (que já diz o essencial). */}
                  <span className="ml-2 text-muted-foreground max-sm:ml-0 max-sm:block max-sm:truncate max-sm:text-xs">{a.body}</span>
                </span>
                {a.kind === 'new_order' && a.order_id ? (
                  <button
                    type="button"
                    onClick={() => take(a)}
                    disabled={busy === a.id}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />} Assumir
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen?.(a)}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Ver
                  </button>
                )}
                {a.kind !== 'new_order' && (
                  <button type="button" aria-label="Marcar como visto" onClick={() => take(a)} disabled={busy === a.id} className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
