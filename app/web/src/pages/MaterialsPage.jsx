// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Loader2 } from 'lucide-react';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import DownloadItem from '@/components/downloads/DownloadItem';
import { useAuth } from '@/hooks/useAuth';
import { isMissingTable, loadDownloads } from '@/lib/downloadsApi';
import { DOWNLOAD_KINDS } from '@/lib/downloads';
import { pageTitle } from '@/lib/brand';

/** Materiais em PDF: gratuitos para todos, e os pagos para quem comprou o produto. */
export default function MaterialsPage() {
  const { user } = useAuth();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [state, setState] = useState('loading');
  const [kind, setKind] = useState('');
  const [access, setAccess] = useState('');

  useEffect(() => {
    let alive = true;
    setState('loading');
    loadDownloads()
      .then((rows) => { if (alive) { setItems(rows); setState('ready'); } })
      .catch((e) => { if (alive) setState(isMissingTable(e) ? 'soon' : 'error'); });
    return () => { alive = false; };
  }, [user?.id]);

  const kinds = useMemo(() => DOWNLOAD_KINDS.filter((k) => items.some((i) => i.kind === k.value)), [items]);
  const shown = items.filter((i) => (!kind || i.kind === kind) && (!access || i.access === access));

  const chip = (active) => `rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`;

  return (
    <>
      <Helmet>
        <title>{pageTitle('Materiais para descarregar')}</title>
        <meta name="description" content="Revistas, lições e folhetos em PDF para descarregar." />
      </Helmet>
      <Header onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="section-spacing bg-background">
        <div className="mx-auto w-full max-w-3xl px-4">
          <h1 className="text-3xl font-bold text-foreground">Materiais para descarregar</h1>
          <p className="mt-2 mb-6 text-muted-foreground">
            Revistas, lições e folhetos em PDF. Os gratuitos descarregam-se logo. Os outros abrem a quem comprou o produto, depois de a compra estar paga.
          </p>

          {state === 'loading' && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
          {state === 'soon' && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Os materiais para descarregar abrem em breve.</p>}
          {state === 'error' && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Não foi possível carregar os materiais. Tente outra vez daqui a pouco.</p>}

          {state === 'ready' && (
            items.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Ainda não há materiais publicados.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar materiais">
                  <button type="button" className={chip(!kind && !access)} aria-pressed={!kind && !access} onClick={() => { setKind(''); setAccess(''); }}>Todos</button>
                  {kinds.map((k) => (
                    <button key={k.value} type="button" className={chip(kind === k.value)} aria-pressed={kind === k.value} onClick={() => setKind(kind === k.value ? '' : k.value)}>{k.label}</button>
                  ))}
                  <button type="button" className={chip(access === 'free')} aria-pressed={access === 'free'} onClick={() => setAccess(access === 'free' ? '' : 'free')}>Gratuitos</button>
                  {items.some((i) => i.access === 'paid') && (
                    <button type="button" className={chip(access === 'paid')} aria-pressed={access === 'paid'} onClick={() => setAccess(access === 'paid' ? '' : 'paid')}>Com compra</button>
                  )}
                </div>
                {shown.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum material com estes filtros.</p>
                ) : (
                  <ul className="space-y-3">
                    {shown.map((item) => <DownloadItem key={item.id} item={item} />)}
                  </ul>
                )}
              </>
            )
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
