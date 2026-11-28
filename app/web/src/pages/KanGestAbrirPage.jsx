// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import * as React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { pageTitle } from '@/lib/brand';
import { supabase } from '@/lib/supabaseClient';
import { lerAbertura } from '@/lib/kangestEntrada';

/**
 * Do KanGest para o site (pedido do dono a 27/11: «o login deve funcionar para os dois»): o KanGest abre esta página com
 * o resumo de um link de entrada da conta da pessoa no fragmento (`#t=…&d=…`). A página tira-o logo do endereço, troca-o
 * por uma sessão e segue para a página pedida, já com a sessão. O resumo só serve uma vez; quem tem os dois passos
 * escreve o código no painel, como em qualquer entrada.
 */
export default function KanGestAbrirPage() {
  const navigate = useNavigate();
  // lido uma vez, antes de o endereço ficar sem o fragmento
  const [abertura] = React.useState(() => lerAbertura(typeof window !== 'undefined' ? window.location.hash : ''));
  const [erro, setErro] = React.useState(abertura.tokenHash ? '' : 'Este endereço está incompleto. Volte ao KanGest e abra a página outra vez.');
  const feito = React.useRef(false);

  React.useEffect(() => {
    // o resumo não fica no histórico nem no endereço que se copia
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sem histórico */ }
    if (!abertura.tokenHash || feito.current) return;
    feito.current = true; // só uma vez (o resumo gasta-se)
    (async () => {
      const { error } = await supabase.auth.verifyOtp({ token_hash: abertura.tokenHash, type: 'magiclink' });
      if (error) {
        setErro('Este acesso já foi usado ou passou o prazo. Volte ao KanGest e abra a página outra vez, ou entre com a sua conta.');
        return;
      }
      navigate(abertura.destino, { replace: true });
    })();
  }, [abertura, navigate]);

  return (
    <>
      <Helmet>
        <title>{pageTitle('A abrir o painel')}</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-muted/30 to-background p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center"><BrandLogo linkTo="/" /></div>
          <div className="rounded-2xl border bg-card p-7 text-center shadow-lg">
            {erro ? (
              <>
                <ShieldAlert className="mx-auto h-11 w-11 text-destructive" aria-hidden="true" />
                <h1 className="mt-4 text-xl font-bold">Não foi possível abrir com a sessão do KanGest</h1>
                <p className="mt-2 text-sm text-muted-foreground">{erro}</p>
                <Button asChild className="mt-6">
                  <Link to={`/login?redirect=${encodeURIComponent(abertura.destino)}`}>Entrar com a minha conta</Link>
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-hidden="true" />
                <h1 className="mt-4 text-xl font-bold">A abrir o painel</h1>
                <p className="mt-2 text-sm text-muted-foreground" role="status">Com a mesma conta com que entrou no KanGest.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
