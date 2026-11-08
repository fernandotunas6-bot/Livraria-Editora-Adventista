import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Loader2, PackageCheck } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ShoppingCart from '@/components/ShoppingCart';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { pageTitle } from '@/lib/brand';
import { APP_API_URL } from '@/lib/supabaseClient';

async function sendFeedback(payload) {
  const res = await fetch(`${APP_API_URL}/order-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível registar a resposta.');
  return data;
}

/**
 * Destino dos botões do email de agradecimento: "Recebi tudo bem" (regista logo) e
 * "Tive um problema" (pede uma descrição e avisa a equipa).
 */
export default function OrderFeedbackPage() {
  const [params] = useSearchParams();
  const orderId = params.get('e') || '';
  const token = params.get('t') || '';
  const initial = params.get('r') === 'problema' ? 'problem' : 'ok';
  const [mode, setMode] = useState(initial);
  const [message, setMessage] = useState('');
  const [state, setState] = useState({ status: 'idle', text: '', orderNumber: '' });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const autoSent = useRef(false);

  const submit = async (outcome) => {
    setState((s) => ({ ...s, status: 'sending', text: '' }));
    try {
      const data = await sendFeedback({ order_id: orderId, token, outcome, message: outcome === 'problem' ? message : '' });
      setState({ status: outcome === 'ok' ? 'done-ok' : 'done-problem', text: data.message, orderNumber: data.order_number });
    } catch (err) {
      setState({ status: 'error', text: err.message, orderNumber: '' });
    }
  };

  // "Recebi tudo bem" regista-se ao abrir: é um clique no email, não precisa de um segundo.
  useEffect(() => {
    if (initial === 'ok' && orderId && token && !autoSent.current) {
      autoSent.current = true;
      submit('ok');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invalid = !orderId || !token;

  return (
    <>
      <Helmet>
        <title>{pageTitle('Confirmar encomenda')}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <main className="section-spacing bg-background">
        <div className="container-custom max-w-xl">
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-xs sm:p-10">
            {invalid && (
              <>
                <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-500" aria-hidden />
                <h1 className="mb-2 text-2xl font-semibold">Link incompleto</h1>
                <p className="text-muted-foreground">Abra o link directamente a partir do email que recebeu.</p>
              </>
            )}

            {!invalid && state.status === 'sending' && (
              <>
                <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" aria-hidden />
                <p className="text-muted-foreground">A registar a sua resposta…</p>
              </>
            )}

            {!invalid && state.status === 'done-ok' && (
              <>
                <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" aria-hidden />
                <h1 className="mb-2 text-2xl font-semibold">Obrigado por confirmar!</h1>
                <p className="mb-6 text-muted-foreground">
                  Ficámos a saber que a encomenda {state.orderNumber} chegou bem. Foi uma alegria servi-lo.
                </p>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Button asChild><Link to="/sugestoes">Ver sugestões para si</Link></Button>
                  <Button variant="outline" onClick={() => { setMode('problem'); setState({ status: 'idle', text: '', orderNumber: '' }); }}>
                    Afinal houve um problema
                  </Button>
                </div>
              </>
            )}

            {!invalid && state.status === 'done-problem' && (
              <>
                <PackageCheck className="mx-auto mb-4 h-12 w-12 text-primary" aria-hidden />
                <h1 className="mb-2 text-2xl font-semibold">Recebemos o seu aviso</h1>
                <p className="text-muted-foreground">{state.text} Lamentamos o incómodo.</p>
              </>
            )}

            {!invalid && (state.status === 'idle' || state.status === 'error') && mode === 'problem' && (
              <form onSubmit={(e) => { e.preventDefault(); submit('problem'); }} className="text-left">
                <h1 className="mb-2 text-center text-2xl font-semibold">O que aconteceu?</h1>
                <p className="mb-5 text-center text-muted-foreground">
                  Produto danificado, em falta, tamanho errado… Conte-nos e a equipa entra em contacto.
                </p>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={1500}
                  placeholder="Ex.: o uniforme veio no tamanho 8 em vez de 10." required minLength={5} />
                {state.status === 'error' && <p className="mt-3 text-sm text-destructive">{state.text}</p>}
                <Button type="submit" className="mt-4 w-full" disabled={message.trim().length < 5}>Enviar aviso</Button>
              </form>
            )}

            {!invalid && state.status === 'error' && mode === 'ok' && (
              <>
                <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-500" aria-hidden />
                <p className="mb-4 text-muted-foreground">{state.text}</p>
                <Button onClick={() => submit('ok')}>Tentar outra vez</Button>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
