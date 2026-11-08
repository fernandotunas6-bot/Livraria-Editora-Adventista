import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import PageBannerSlider from '@/components/PageBannerSlider';
import { Button } from '@/components/ui/button';
import { pageTitle } from '@/lib/brand';
import { CURRENT_VERSION, applyUpdate, fetchPublishedVersion, isNewerVersion } from '@/lib/appVersion';
import { listPublishedReleases, markReleasesSeen, noteLines } from '@/lib/appReleases';

const longDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-AO', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** "A sua app": a versão que está a correr e, a pedido, se já há uma nova. */
function VersionCard() {
  const [state, setState] = useState('idle'); // idle | checking | latest | available | offline
  const check = async () => {
    setState('checking');
    const published = await fetchPublishedVersion();
    if (!published) setState('offline');
    else setState(isNewerVersion(published) ? 'available' : 'latest');
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">A sua app</p>
        <p className="text-xs text-muted-foreground">Versão {CURRENT_VERSION === 'dev' ? 'de desenvolvimento' : CURRENT_VERSION}</p>
        {state === 'latest' && (
          <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" role="status">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Já tem a versão mais recente.
          </p>
        )}
        {state === 'offline' && <p className="mt-1 text-xs text-muted-foreground" role="status">Sem ligação: tente daqui a pouco.</p>}
        {state === 'available' && <p className="mt-1 text-xs font-medium text-foreground" role="status">Há uma versão nova.</p>}
      </div>
      {state === 'available' ? (
        <Button size="sm" className="btn-primary" onClick={() => applyUpdate()}>Actualizar agora</Button>
      ) : (
        <Button size="sm" variant="outline" onClick={check} disabled={state === 'checking'}>
          {state === 'checking'
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />}
          Procurar actualizações
        </Button>
      )}
    </div>
  );
}

/** /novidades: o que mudou em cada versão da app (painel → Versões da app). */
export default function NovidadesPage() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [releases, setReleases] = useState(null);

  useEffect(() => {
    let alive = true;
    listPublishedReleases(30).then((items) => {
      if (!alive) return;
      setReleases(items);
      // Ver a página conta como ter visto as novidades: o aviso "App actualizada" não as repete.
      if (items[0]?.published_at) markReleasesSeen(items[0].published_at);
    });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <Helmet>
        <title>{pageTitle('Novidades da app')}</title>
        <meta name="description" content="O que mudou em cada versão da app da Livraria Adventista." />
      </Helmet>

      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />

      <PageBannerSlider>
        <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl/10 md:text-5xl/none">Novidades da app</h1>
        <p className="text-base text-white/85 sm:text-lg">O que mudou em cada versão</p>
      </PageBannerSlider>

      <main className="section-spacing bg-background">
        <div className="container-custom max-w-3xl space-y-8">
          <VersionCard />

          {releases === null && (
            <div className="flex justify-center py-10" role="status" aria-label="A carregar as novidades">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          {releases?.length === 0 && (
            <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              Ainda não há novidades publicadas. A app actualiza-se sozinha: quando houver uma versão nova, avisamos.
            </p>
          )}

          {releases?.length > 0 && (
            <ol className="space-y-6">
              {releases.map((r, i) => {
                const lines = noteLines(r.notes);
                return (
                  <li key={r.id} className="rounded-xl border bg-card p-5 sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {i === 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                          <Sparkles className="h-3 w-3" aria-hidden="true" /> Mais recente
                        </span>
                      )}
                      <time dateTime={r.published_at}>{longDate(r.published_at)}</time>
                      {r.version && <span className="font-mono">v{r.version}</span>}
                    </div>
                    <h2 className="text-lg font-semibold text-foreground sm:text-xl">{r.title}</h2>
                    {lines.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
                        {lines.map((line, j) => <li key={j}>{line}</li>)}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
