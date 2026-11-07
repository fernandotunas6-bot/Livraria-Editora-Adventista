import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, PackageCheck, Truck, XCircle } from 'lucide-react';

/**
 * A encomenda no chat: número e estado, os passos (recebida → paga → preparação → expedida →
 * entregue) e o essencial — pagamento, rastreio, previsão, loja. Os dados vêm do servidor
 * (chatEngine.orderCard), com o mesmo critério do texto: só o que a pessoa já pode ver.
 */
export default function OrderStatusCard({ card, authed = false }) {
  const [copied, setCopied] = useState(false);
  if (!card) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.tracking);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sem acesso à área de transferência: o código continua visível */
    }
  };
  const rows = [
    card.payment && ['Pagamento', `${card.payment.charAt(0).toUpperCase()}${card.payment.slice(1)}${card.payment_method ? ` · ${card.payment_method}` : ''}`],
    card.pickup_store && ['Levantamento', card.pickup_store],
    card.eta && ['Previsão', card.eta],
    card.items && ['Livros', card.items],
    card.total && ['Total', card.total],
  ].filter(Boolean);

  return (
    <section
      aria-label={`Encomenda ${card.number}: ${card.stage_label}`}
      className="max-w-[92%] overflow-hidden rounded-2xl border border-border/70 bg-card text-sm shadow-sm"
    >
      <header className="flex items-start justify-between gap-2 border-b border-border/60 bg-muted/30 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-primary">{card.number}</p>
          {card.made && <p className="text-[11px] text-muted-foreground">Feita a {card.made}</p>}
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            card.cancelled ? 'bg-destructive/10 text-destructive'
              : card.stage === 'delivered' ? 'bg-emerald-100 text-emerald-800'
                : 'bg-marca/10 text-primary'
          }`}
        >
          {card.cancelled ? <XCircle className="h-3 w-3" /> : card.stage === 'delivered' ? <PackageCheck className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
          {card.stage_label}
        </span>
      </header>

      {!card.cancelled && (
        <ol className="flex items-start px-3 pb-1 pt-3" aria-label="Passos da encomenda">
          {card.steps.map((s, i) => (
            <li key={s.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={s.current ? 'step' : undefined}>
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 top-2.5 h-0.5 w-full -translate-y-1/2 ${s.done || s.current ? 'bg-primary' : 'bg-border'}`}
                />
              )}
              <span
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                  s.done ? 'border-primary bg-primary text-primary-foreground'
                    : s.current ? 'border-primary bg-background ring-4 ring-primary/15'
                      : 'border-border bg-background'
                }`}
              >
                {s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : s.current ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
              </span>
              <span className={`mt-1 px-0.5 text-[10px] leading-tight ${s.current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      <dl className="space-y-1 px-3.5 py-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2 text-xs">
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 flex-1 break-words text-foreground">{value}</dd>
          </div>
        ))}
        {card.tracking && (
          <div className="flex gap-2 text-xs">
            <dt className="w-20 shrink-0 pt-1 text-muted-foreground">Rastreio</dt>
            {/* O código inteiro e à vista (é o que o cliente copia); a transportadora por baixo. */}
            <dd className="min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="break-all font-mono font-semibold text-foreground">{card.tracking}</span>
                <button
                  type="button"
                  onClick={copy}
                  aria-label={copied ? 'Código copiado' : 'Copiar o código de rastreio'}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </span>
              {card.carrier && <span className="block text-[11px] text-muted-foreground">{card.carrier}</span>}
            </dd>
          </div>
        )}
      </dl>

      <footer className="flex border-t border-border/60">
        <Link
          to={authed ? '/profile' : '/track'}
          className="flex-1 px-3.5 py-2 text-center text-xs font-semibold text-primary hover:bg-primary/5"
        >
          {authed ? 'Ver nas minhas encomendas' : 'Abrir o rastreio'}
        </Link>
      </footer>
    </section>
  );
}
