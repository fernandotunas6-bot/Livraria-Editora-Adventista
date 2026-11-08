import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Feather, Sparkles } from 'lucide-react';
import ReaderBadge from '@/components/community/ReaderBadge';
import { engagePath, isMember, levelInfo, nextTier } from '@/lib/readerLevels';

const dateLabel = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('pt-AO', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; }
};

function Progress({ ratio, label }) {
  return (
    <div className="mt-2">
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={label}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(4, Math.round(ratio * 100))}%` }} />
      </div>
    </div>
  );
}

/**
 * O nível de leitor no perfil: o distintivo, os livros e o que falta para o seguinte. Para uma
 * conta nova, como entrar na Comunidade de Leitores — com o primeiro livro, ou a participar.
 * `status`: o de `reader_status` (useReaderStatus); sem ele (antes da migração) não mostra nada.
 */
export default function ReaderLevelCard({ status, className = '' }) {
  if (!status) return null;
  const member = isMember(status.level);
  const tier = nextTier(status);
  const engage = engagePath(status);
  const info = levelInfo(status.level);
  const books = Number(status.books) || 0;

  return (
    <section aria-labelledby="nivel-leitor" className={`rounded-2xl border bg-card p-4 sm:p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="nivel-leitor" className="flex items-center gap-2 text-base font-semibold">
            <Feather className="h-4 w-4 text-primary" aria-hidden="true" /> O seu nível de leitor
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {member ? <ReaderBadge level={status.level} size="md" /> : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{info.label}</span>
            )}
            {status.staff && <span className="text-xs text-muted-foreground">Equipa da Livraria: publica sempre na comunidade.</span>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {member
              ? `${books} ${books === 1 ? 'livro comprado' : 'livros comprados'}${status.since ? ` · na Comunidade de Leitores desde ${dateLabel(status.since)}` : ''}${status.via === 'participacao' ? ' (pela participação)' : ''}.`
              : 'Ainda não faz parte da Comunidade de Leitores: pode ler, gostar e responder; criar publicações é para os Leitores.'}
          </p>
        </div>
        {!member && (
          <Link to="/shop" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Ver livros
          </Link>
        )}
      </div>

      {tier && (
        <div className="mt-3">
          <p className="text-sm">{tier.text}</p>
          {member && <Progress ratio={tier.ratio} label={tier.text} />}
        </div>
      )}
      {engage?.enabled && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3">
          <p className="flex items-start gap-2 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {engage.text}
          </p>
          <Progress ratio={engage.ratio} label={engage.text} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {engage.daysActive} de {engage.daysNeeded} dias a participar · conta com {Math.min(engage.accountDays, engage.minDays)} de {engage.minDays} dias
          </p>
        </div>
      )}
    </section>
  );
}
