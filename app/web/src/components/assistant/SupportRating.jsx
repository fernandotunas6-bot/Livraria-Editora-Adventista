import React, { useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { rateSupportThread } from '@/lib/supportApi';

const LABELS = ['', 'Muito mau', 'Mau', 'Razoável', 'Bom', 'Excelente'];

/** Avaliação do atendimento (1 a 5), uma vez, depois de o pedido ser resolvido. */
export default function SupportRating({ threadId, onRated, compact = false }) {
  const [score, setScore] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!score || busy) return;
    setBusy(true);
    setError('');
    try {
      await rateSupportThread(threadId, score, comment);
      onRated?.(score);
    } catch (err) {
      setError(err.message || 'Não foi possível guardar a avaliação.');
    } finally {
      setBusy(false);
    }
  };

  const shown = hover || score;
  return (
    <form onSubmit={submit} className={`space-y-2 rounded-2xl border border-border bg-card text-sm ${compact ? 'p-3' : 'p-4'}`}>
      <p className="font-semibold text-foreground">Como correu o atendimento?</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Avaliação de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} — ${LABELS[n]}`}
            onClick={() => setScore(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Star className={`h-6 w-6 ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
          </button>
        ))}
        {shown > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{LABELS[shown]}</span>}
      </div>
      {score > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Quer deixar um comentário? (opcional)"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm"
          />
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enviar avaliação
          </button>
        </>
      )}
    </form>
  );
}
