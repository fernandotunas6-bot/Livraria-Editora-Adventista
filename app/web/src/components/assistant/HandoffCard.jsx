import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Headset, Loader2, LogIn, MessageCircle } from 'lucide-react';

/** Número de WhatsApp em formato wa.me (só dígitos, com o indicativo de Angola se faltar). */
export function whatsappHref(number) {
  let digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) digits = `244${digits}`;
  return `https://wa.me/${digits}`;
}

/**
 * Oferta de passar a conversa à equipa. Com conta: escolher a encomenda (opcional), acrescentar
 * detalhes e confirmar. Sem conta: entrar (a conversa fica guardada e passa para a conta) ou
 * WhatsApp. Nada sai sem o cliente confirmar, como nos sistemas de atendimento de referência.
 */
export default function HandoffCard({
  authed, orders = [], whatsapp = '', loginHref, onConfirm, onDismiss, busy = false, error = '',
}) {
  const [details, setDetails] = useState('');
  const [orderId, setOrderId] = useState('');
  const wa = whatsappHref(whatsapp);

  if (!authed) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5 text-sm">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Headset className="h-4 w-4 text-primary" /> Falar com a equipa
        </p>
        <p className="mt-1 text-muted-foreground">
          Entre na sua conta para a equipa lhe responder aqui. Esta conversa fica guardada e passa consigo.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to={loginHref}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <LogIn className="h-3.5 w-3.5" /> Entrar ou criar conta
          </Link>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          <button type="button" onClick={onDismiss} className="px-2 text-xs text-muted-foreground hover:text-foreground">
            Agora não
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-2.5 rounded-2xl border border-primary/25 bg-primary/5 p-3.5 text-sm"
      onSubmit={(e) => { e.preventDefault(); onConfirm?.({ details, orderId }); }}
    >
      <p className="flex items-center gap-2 font-semibold text-foreground">
        <Headset className="h-4 w-4 text-primary" /> Passar à equipa
      </p>
      <p className="text-muted-foreground">
        A equipa recebe esta conversa inteira e responde-lhe aqui. Também recebe um aviso na sua conta.
      </p>
      {orders.length > 0 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">É sobre uma encomenda?</span>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-2.5 text-base sm:text-sm"
          >
            <option value="">Não / outra coisa</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{o.order_number} · {o.state}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-foreground">Quer acrescentar algum detalhe?</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Opcional se já explicou acima"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm"
        />
      </label>
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Passar à equipa
        </button>
        <button type="button" onClick={onDismiss} disabled={busy} className="px-2 text-xs text-muted-foreground hover:text-foreground">
          Continuar com o assistente
        </button>
      </div>
    </form>
  );
}
