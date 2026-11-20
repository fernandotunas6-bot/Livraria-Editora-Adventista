import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MailCheck, MailX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { pageTitle } from '@/lib/brand';
import { APP_API_URL } from '@/lib/supabaseClient';

/**
 * Confirmar a subscrição da newsletter, pelo link do email (dupla confirmação, migração
 * newsletter_dupla_confirmacao).
 *
 * Como na página de cancelar: a confirmação é um POST feito ao carregar no botão, não ao abrir o
 * link. Alguns servidores de correio abrem os endereços das mensagens para os analisar; com a
 * confirmação no GET, essa visita inscrevia quem nunca pediu nada — que é o que a dupla
 * confirmação existe para impedir.
 */
export default function NewsletterConfirmPage() {
  const [params] = useSearchParams();
  const token = (params.get('t') || '').trim();
  const valid = /^[0-9a-f]{64}$/i.test(token);
  const [state, setState] = useState(valid ? 'idle' : 'invalid');
  const [message, setMessage] = useState('');

  const confirm = async () => {
    setState('loading');
    try {
      const res = await fetch(`${APP_API_URL}/newsletter/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Não foi possível confirmar.');
      setMessage(data.message || 'Subscrição confirmada.');
      setState('done');
    } catch (err) {
      setMessage(err.message || 'Não foi possível confirmar.');
      setState('error');
    }
  };

  return (
    <>
      <Helmet>
        <title>{pageTitle('Confirmar subscrição')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-muted/30 to-background p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center"><BrandLogo linkTo="/" /></div>
          <div className="rounded-2xl border bg-card p-7 shadow-lg text-center">
            {state === 'done' ? (
              <>
                <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-500" aria-hidden />
                <h1 className="mt-4 text-xl font-bold">Subscrição confirmada</h1>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
                <Button asChild className="mt-6"><Link to="/shop">Ver o catálogo</Link></Button>
              </>
            ) : state === 'invalid' || state === 'error' ? (
              <>
                <MailX className="mx-auto h-11 w-11 text-destructive" aria-hidden />
                <h1 className="mt-4 text-xl font-bold">Não foi possível confirmar</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {state === 'invalid' ? 'Este link está incompleto. Abra-o outra vez a partir do email.' : message}
                </p>
                <Button asChild variant="outline" className="mt-6"><Link to="/">Ir para a loja</Link></Button>
              </>
            ) : (
              <>
                <MailCheck className="mx-auto h-11 w-11 text-primary" aria-hidden />
                <h1 className="mt-4 text-xl font-bold">Receber as novidades da livraria?</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Lançamentos, promoções e eventos, neste email. Pode deixar de os receber quando quiser, com um clique no
                  fundo de cada mensagem.
                </p>
                <Button className="mt-6 w-full" onClick={confirm} disabled={state === 'loading'}>
                  {state === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Confirmar a subscrição
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
