// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

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
  // Confirmado pelo gateway de pagamentos (webhook): não se pede a referência.
  automatic = false,
  // Pagamentos registados: o que falta (pago em parte), o que o cliente indicou e, se a equipa
  // não o encontrou, porquê.
  outstandingAmount = null, reportedReference = '', rejectedReference = '', rejectedReason = '',
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
  const due = outstandingAmount != null && Number(outstandingAmount) > 0 ? Number(outstandingAmount) : Number(total || 0);
  const partial = outstandingAmount != null && Number(outstandingAmount) > 0 && Number(outstandingAmount) < Number(total || 0);

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5 text-left space-y-3" aria-labelledby="como-pagar">
      <h2 id="como-pagar" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" /> Como pagar{methodName ? ` — ${methodName}` : ''}
      </h2>
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
        <li>
          Pague <strong className="text-foreground">{formatCurrency(due * 100)}</strong>
          {partial && <> (já recebemos {formatCurrency((Number(total || 0) - due) * 100)})</>}
          {orderNumber && <> e escreva <strong className="text-foreground font-mono">{orderNumber}</strong> no descritivo</>}.
        </li>
        {automatic
          ? <li>A confirmação é automática: assim que o pagamento for processado, a encomenda fica paga e avisamo-lo.</li>
          : <li>Indique abaixo a referência do pagamento. A equipa confirma e avisa-o.</li>}
      </ol>

      {rejectedReason && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não encontrámos o pagamento{rejectedReference ? <> com a referência <strong className="font-mono">{rejectedReference}</strong></> : ''}: {rejectedReason}.
          {!automatic && ' Verifique e indique a referência certa.'}
        </p>
      )}

      {accountInfo && (
        <div className="rounded-lg bg-background border border-border p-3 space-y-2">
          <p className="tabular-nums tracking-wide text-sm wrap-break-word text-foreground">{accountInfo}</p>
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

      {automatic ? null : sent ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Referência recebida{reportedReference ? <> (<span className="font-mono">{reportedReference}</span>)</> : ''}. A equipa confirma o pagamento e avisa-o.
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
