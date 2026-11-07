import React, { useState } from 'react';
import { CheckCircle2, Copy, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/api/EcommerceApi';
import { reportPaymentReference } from '@/api/PlatformApi';

/**
 * Pagamento depois de encomendar (transferência, Multicaixa Express): quanto, para onde, com que
 * referência, e onde indicar o comprovativo. Usado na página de sucesso e no rastreio.
 * A encomenda identifica-se pelo número e email, ou número e telefone (levantamento sem email).
 */
export default function PayLaterBox({
  orderNumber, email = '', phone = '', total, methodName = '', accountInfo = '', instructions = '', paymentLink = '',
  referenceAlreadySent = false,
}) {
  const [reference, setReference] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(referenceAlreadySent);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (reference.trim().length < 4) {
      setError('Indique a referência do pagamento (pelo menos 4 caracteres).');
      return;
    }
    setSending(true);
    try {
      await reportPaymentReference({ orderNumber, email, phone, reference: reference.trim() });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const safeLink = /^https:\/\//.test(paymentLink || '') ? paymentLink : '';

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5 text-left space-y-3" aria-labelledby="como-pagar">
      <h2 id="como-pagar" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" /> Como pagar{methodName ? ` — ${methodName}` : ''}
      </h2>
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
        <li>
          Pague <strong className="text-foreground">{formatCurrency(Number(total || 0) * 100)}</strong>
          {orderNumber && <> e escreva <strong className="text-foreground font-mono">{orderNumber}</strong> no descritivo</>}.
        </li>
        <li>Indique abaixo a referência do pagamento. A equipa confirma e avisa-o.</li>
      </ol>

      {accountInfo && (
        <div className="rounded-lg bg-background border border-border p-3 space-y-2">
          <p className="tabular-nums tracking-wide text-sm break-words text-foreground">{accountInfo}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copy(accountInfo, 'dados')}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> {copied === 'dados' ? 'Copiado' : 'Copiar dados'}
            </Button>
            {orderNumber && (
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copy(orderNumber, 'numero')}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> {copied === 'numero' ? 'Copiado' : 'Copiar n.º da encomenda'}
              </Button>
            )}
          </div>
        </div>
      )}
      {instructions && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{instructions}</p>}
      {safeLink && (
        <Button asChild className="w-full btn-primary">
          <a href={safeLink} target="_blank" rel="noopener noreferrer">Pagar com {methodName || 'o link de pagamento'}</a>
        </Button>
      )}

      {sent ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Referência recebida. A equipa confirma o pagamento e avisa-o.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <Label htmlFor="referencia-pagamento">Referência do pagamento</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="referencia-pagamento"
              autoComplete="off"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Referência ou n.º do comprovativo"
              maxLength={120}
              aria-invalid={!!error}
              aria-describedby={error ? 'referencia-erro' : undefined}
            />
            <Button type="submit" disabled={sending} className="shrink-0">
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar referência
            </Button>
          </div>
          {error && <p id="referencia-erro" className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </section>
  );
}
