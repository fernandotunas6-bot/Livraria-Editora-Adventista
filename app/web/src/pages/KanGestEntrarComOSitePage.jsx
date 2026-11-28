// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import * as React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useLocation } from 'react-router-dom';
import { CheckCircle2, Loader2, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { pageTitle } from '@/lib/brand';
import { useAuth } from '@/hooks/useAuth';
import pb from '@/lib/dataClient';
import { desistenciaParaOKanGest, pedidoDoKanGest, retornoParaOKanGest } from '@/lib/kangestEntrada';

/**
 * Do site para o KanGest («Entrar com a sessão do site»; pedido do dono a 27/11: «o login deve funcionar para os
 * dois»). O KanGest abre esta página com o seu estado e o desafio PKCE. Com a sessão do site e depois de a pessoa
 * confirmar, o site dá um código de uso único (dois minutos), que volta ao KanGest pela ligação kangest://auth. Só o
 * KanGest que pediu o consegue trocar (tem o verificador). Os dois passos pedem-se no KanGest, como com a senha.
 */
export default function KanGestEntrarComOSitePage() {
  const location = useLocation();
  const { ready, user } = useAuth();
  const pedido = React.useMemo(() => pedidoDoKanGest(location.search), [location.search]);
  const [estado, setEstado] = React.useState('pronto'); // pronto | a_pedir | enviado | cancelado | erro
  const [mensagem, setMensagem] = React.useState('');
  const [retorno, setRetorno] = React.useState('');

  async function entrar() {
    setEstado('a_pedir');
    try {
      const r = await pb.send('/api/app/kangest/entrar-com-o-site/codigo', { method: 'POST', body: pedido });
      const url = retornoParaOKanGest(pedido.estado, r.codigo);
      setRetorno(url);
      setEstado('enviado');
      window.location.href = url;
    } catch (e) {
      setMensagem(e?.message || 'Não foi possível pedir a entrada.');
      setEstado('erro');
    }
  }

  function cancelar() {
    setEstado('cancelado');
    window.location.href = desistenciaParaOKanGest(pedido.estado);
  }

  const aqui = `${location.pathname}${location.search}`;
  let conteudo;
  if (!pedido) {
    conteudo = (
      <>
        <ShieldAlert className="mx-auto h-11 w-11 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Este endereço não veio do KanGest</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abra o KanGest e carregue em «Entrar com a sessão do site»: ele abre esta página sozinho.
        </p>
      </>
    );
  } else if (!ready) {
    conteudo = <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" aria-label="A carregar" />;
  } else if (!user) {
    conteudo = (
      <>
        <MonitorSmartphone className="mx-auto h-11 w-11 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Entre primeiro no site</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Para entrar no KanGest com a sessão do site, entre aqui com a sua conta. Depois volta a esta página.
        </p>
        <Button asChild className="mt-6 w-full"><Link to={`/login?redirect=${encodeURIComponent(aqui)}`}>Entrar no site</Link></Button>
      </>
    );
  } else if (estado === 'enviado') {
    conteudo = (
      <>
        <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Volte ao KanGest</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          O KanGest abre sozinho com a sua conta. Se o navegador perguntar, permita abrir o KanGest. Pode fechar esta janela.
        </p>
        <Button asChild variant="outline" className="mt-6"><a href={retorno}>Abrir o KanGest</a></Button>
        <p className="mt-3 text-xs text-muted-foreground">Esta entrada vale dois minutos e só uma vez.</p>
      </>
    );
  } else if (estado === 'cancelado') {
    conteudo = (
      <>
        <h1 className="text-xl font-bold">Entrada cancelada</h1>
        <p className="mt-2 text-sm text-muted-foreground">O KanGest não entrou com a sua conta. Pode fechar esta janela.</p>
      </>
    );
  } else {
    conteudo = (
      <>
        <MonitorSmartphone className="mx-auto h-11 w-11 text-primary" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">Entrar no KanGest com esta conta?</h1>
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-semibold">{user.name || user.email}</span>
          {user.name && user.email ? <span className="block text-muted-foreground">{user.email}</span> : null}
        </p>
        <p className="mt-3 text-left text-sm text-muted-foreground">
          O KanGest deste computador pediu para entrar com a sua conta do site, sem escrever a senha. Só confirme se foi
          você que carregou em «Entrar com a sessão do site» agora mesmo. Se tem os dois passos, o KanGest pede o código.
        </p>
        {estado === 'erro' && <p className="mt-3 text-sm text-destructive" role="alert">{mensagem}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button className="flex-1" onClick={entrar} disabled={estado === 'a_pedir'}>
            {estado === 'a_pedir' && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Entrar no KanGest
          </Button>
          <Button variant="outline" className="flex-1" onClick={cancelar} disabled={estado === 'a_pedir'}>Cancelar</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle('Entrar no KanGest')}</title>
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-muted/30 to-background p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center"><BrandLogo linkTo="/" /></div>
          <div className="rounded-2xl border bg-card p-7 text-center shadow-lg">{conteudo}</div>
        </div>
      </div>
    </>
  );
}
