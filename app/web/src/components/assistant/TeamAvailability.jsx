// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useState } from 'react';
import { Headset } from 'lucide-react';
import { teamAvailability } from '@/lib/teamHours';

/** A hora actual, renovada a cada minuto: "disponível" passa a "volta amanhã" sem recarregar. */
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const Dot = ({ open }) => (
  <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${open ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
);

/**
 * Antes de passar à equipa: "A equipa está disponível (até às 18h)." ou, fora de horas, quando
 * volta e que o pedido fica guardado. Sem horário (servidor antigo) não mostra nada.
 */
export default function TeamAvailability({
  hours, className = '', closedNote = 'O pedido fica guardado e respondemos quando a equipa voltar.',
}) {
  const now = useNow();
  const a = teamAvailability(hours, now);
  if (!a) return null;
  return (
    <p className={`flex items-start gap-2 rounded-xl bg-background/80 px-3 py-2 text-xs leading-snug text-muted-foreground ${className}`}>
      <span className="mt-1"><Dot open={a.open} /></span>
      <span>
        <span className="font-medium text-foreground">{a.label}</span>
        {a.open ? ` (${a.detail}).` : `. ${a.detail}.${closedNote ? ` ${closedNote}` : ''}`}
      </span>
    </p>
  );
}

/**
 * Pedido aberto e o cliente à espera: quando a equipa responde e que pode fechar o chat, logo
 * abaixo da última mensagem (como "A equipa costuma responder…" nos mensageiros de atendimento).
 */
export function TicketWaiting({ hours, authed = false }) {
  const now = useNow();
  const a = teamAvailability(hours, now);
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-primary/30 bg-background/80 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground" role="status">
      <Headset className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-foreground">A aguardar resposta da equipa</p>
        {a && (
          <p className="flex items-start gap-1.5">
            <span className="mt-[5px]"><Dot open={a.open} /></span>
            <span>{a.open ? `${a.label} (${a.detail}).` : `${a.label}. ${a.detail}.`}</span>
          </p>
        )}
        <p>
          {authed
            ? 'Pode fechar o chat: avisamos na sua conta quando responderem.'
            : 'Pode fechar o chat: a resposta aparece aqui, neste browser.'}
        </p>
      </div>
    </div>
  );
}
