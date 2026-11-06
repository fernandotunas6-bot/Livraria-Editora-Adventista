import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Check, Loader2, Siren, Volume2, X } from 'lucide-react';
import { acknowledgeOrder, dismissAlert, listActionAlerts } from '@/lib/opsApi';

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

  useEffect(() => {
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

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

  return (
    <div
      role="region"
      aria-label="Alertas da operação"
      className={`sticky top-0 z-30 border-b ${critical ? 'border-destructive/40 bg-destructive/10' : alerts.length ? 'border-amber-500/40 bg-amber-50' : 'border-border bg-muted/40'}`}
    >
      <div className="container-custom space-y-2 py-2">
        {!soundOn && (
          <button
            type="button"
            onClick={enableSound}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <Volume2 className="h-4 w-4" /> Activar som e notificações de encomendas novas neste aparelho
          </button>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {alerts.slice(0, 4).map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-sm shadow-sm">
            {a.severity === 'critical' ? <Siren className="h-4 w-4 shrink-0 text-destructive" /> : <BellRing className="h-4 w-4 shrink-0 text-amber-600" />}
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{a.title}</span>
              <span className="ml-2 text-muted-foreground">{a.body}</span>
            </span>
            {a.kind === 'new_order' && a.order_id ? (
              <button
                type="button"
                onClick={() => take(a)}
                disabled={busy === a.id}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Assumir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpen?.(a)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Ver
              </button>
            )}
            {a.kind !== 'new_order' && (
              <button type="button" aria-label="Marcar como visto" onClick={() => take(a)} disabled={busy === a.id} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {alerts.length > 4 && <p className="text-xs text-muted-foreground">E mais {alerts.length - 4} — veja o Acompanhamento.</p>}
      </div>
    </div>
  );
}
