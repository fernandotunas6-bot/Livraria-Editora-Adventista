// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Church, Copy, Loader2, Percent, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import ShoppingCart from '@/components/ShoppingCart.jsx';
import { pageTitle } from '@/lib/brand';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { claimInvite, colporteurMe } from '@/lib/colporteurApi';
import { CATEGORIES, SALE_MODES, STATUSES } from '@/lib/colporteurCommission';
import { Pill } from '@/components/admin/igreja/registryUi';
import ColporteurWorkspace from '@/components/colportagem/ColporteurWorkspace';
import AreaBreadcrumb from '@/components/AreaBreadcrumb';
import { forgetColporteurMe } from '@/hooks/useColporteurMe';
import { COLPORTEUR_VIEWS, resolveColporteurView } from '@/lib/siteAreas';
import MyCardReviews from '@/components/colportagem/MyCardReviews';

const EVENT_TEXT = {
  candidatura: () => 'Candidatura enviada',
  estado: (d) => `Estado: ${STATUSES[d.to]?.label || d.to}${d.reason ? ` — ${d.reason}` : ''}`,
  categoria: (d) => `Categoria: ${CATEGORIES[d.from]?.label || d.from} → ${CATEGORIES[d.to]?.label || d.to}`,
  convite: () => 'Convite para ligar a conta',
  conta: (d) => (d.unlinked ? 'Conta desligada' : 'Conta ligada'),
  percentagem: (d) => `Percentagem própria${d.sale_mode ? ` (${SALE_MODES[d.sale_mode]?.label})` : ''}: ${d.pct == null ? 'retirada' : `${d.pct}%`}`,
  nota: () => 'Nota',
  cartao: (d) => (d.accao === 'reemitido' ? 'Cartão reemitido' : 'Cartão emitido'),
};

/**
 * Área do colportor (/colportor). Com ?convite=… liga a conta à ficha aprovada; depois mostra
 * o código, a categoria, as percentagens, o relatório semanal, os livros em mão e a conta.
 */
export default function ColporteurAreaPage() {
  const { ready, isAuthed, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const invite = params.get('convite') || '';
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [me, setMe] = useState(undefined);
  const [error, setError] = useState('');
  const claimed = useRef(false);

  useEffect(() => {
    if (!ready || !isAuthed) return;
    let alive = true;
    (async () => {
      try {
        if (invite && !claimed.current) {
          claimed.current = true;
          const r = await claimInvite(invite);
          // Os menus do site passam a mostrar a "Área do colportor".
          forgetColporteurMe(user?.id);
          toast({ title: r?.already ? 'A conta já estava ligada.' : `Bem-vindo! O seu código é ${r?.code}.` });
          setParams({}, { replace: true });
        }
        const data = await colporteurMe();
        if (alive) setMe(data);
      } catch (err) {
        if (alive) { setError(err.message); setMe(null); }
      }
    })();
    return () => { alive = false; };
  }, [ready, isAuthed, invite, setParams, toast, user?.id]);

  // A vista aberta (Relatório, Entregas…) no caminho e no título, só com a área à vista.
  const viewLabel = me ? COLPORTEUR_VIEWS.find((v) => v.id === resolveColporteurView(params.get('tab')))?.label : '';
  const loginPath = `/login?redirect=${encodeURIComponent(`/colportor${invite ? `?convite=${encodeURIComponent(invite)}` : ''}`)}`;
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast({ title: `${label} copiado.` }); } catch { /* sem acesso à área de transferência */ }
  };

  let body;
  if (!ready || (isAuthed && me === undefined && !error)) {
    body = <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  } else if (!isAuthed) {
    body = (
      <div className="rounded-2xl border border-border p-6">
        <h1 className="mb-2 text-xl font-bold">{invite ? 'Ligar a sua conta de colportor' : 'Área do colportor'}</h1>
        <p className="mb-4 text-muted-foreground">
          {invite ? 'Entre (ou crie conta, por exemplo com o Google) para ligar a sua conta ao código de colportor que recebeu.' : 'Entre na conta ligada ao seu código de colportor.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(loginPath)}>Entrar</Button>
          {!invite && <Button variant="outline" asChild><Link to="/colportor/candidatura">Quero ser colportor</Link></Button>}
        </div>
      </div>
    );
  } else if (!me) {
    body = (
      <div className="rounded-2xl border border-border p-6">
        <h1 className="mb-2 text-xl font-bold">Esta conta não está ligada a um colportor</h1>
        {error && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <p className="mb-4 text-muted-foreground">Se já foi aprovado, use o link do convite que recebeu no WhatsApp. Se ainda não se candidatou, faça-o aqui.</p>
        <Button asChild><Link to="/colportor/candidatura">Candidatar-me</Link></Button>
      </div>
    );
  } else {
    const status = STATUSES[me.status] || { label: me.status, tone: 'muted' };
    body = (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-linear-to-br from-primary/10 to-background p-6">
          <p className="text-sm text-muted-foreground">Colportor</p>
          <h1 className="text-2xl font-bold">{me.full_name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => copy(me.code, 'Código')} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-mono text-lg font-bold text-primary-foreground" title="Copiar código">
              <BadgeCheck className="h-5 w-5" />{me.code}<Copy className="h-4 w-4 opacity-70" />
            </button>
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone="blue">{CATEGORIES[me.category]?.label || me.category}</Pill>
          </div>
          {me.start_date && <p className="mt-2 text-sm text-muted-foreground">Colportor desde {new Date(me.start_date).toLocaleDateString('pt-AO')}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-5">
            <h3 className="mb-2 flex items-center gap-2 font-semibold"><Church className="h-4 w-4" />Igreja e zona</h3>
            <p>{me.church?.name || '—'}{me.church?.district ? ` · ${me.church.district}` : ''}</p>
            <p className="text-sm text-muted-foreground">{[me.municipality, me.province].filter(Boolean).join(', ')}</p>
            {me.territory && <p className="mt-2 text-sm">Território: {me.territory}</p>}
          </div>
          <div className="rounded-2xl border border-border p-5">
            <h3 className="mb-2 flex items-center gap-2 font-semibold"><Percent className="h-4 w-4" />As suas percentagens hoje</h3>
            <ul className="space-y-1 text-sm">
              {Object.entries(SALE_MODES).map(([k, m]) => (
                <li key={k} className="flex justify-between gap-2"><span>{m.label}</span><strong className="tabular-nums">{Number(me.pct?.[k] ?? 0)}%</strong></li>
              ))}
            </ul>
            {Object.keys(me.pct_by_type || {}).length > 0 && <p className="mt-2 text-xs text-muted-foreground">Alguns tipos de produto têm percentagem própria; a Livraria indica-a em cada guia.</p>}
          </div>
        </div>

        <MyCardReviews me={me} />

        <div className="rounded-2xl border border-border p-5">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><ScrollText className="h-4 w-4" />Histórico</h3>
          <ul className="space-y-1.5 text-sm">
            {(me.events || []).map((e, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2">
                <span>{(EVENT_TEXT[e.kind] || (() => e.kind))(e.detail || {})}</span>
                <span className="text-muted-foreground">{new Date(e.created).toLocaleDateString('pt-AO')}</span>
              </li>
            ))}
          </ul>
        </div>
        {me.status === 'activo' && <ColporteurWorkspace me={me} />}
      </div>
    );
  }

  return (
    <>
      <Helmet><title>{pageTitle(`${viewLabel ? `${viewLabel} · ` : ''}Área do colportor`)}</title><meta name="robots" content="noindex" /></Helmet>
      <Header pinned onCartOpen={() => setIsCartOpen(true)} />
      <ShoppingCart isCartOpen={isCartOpen} setIsCartOpen={setIsCartOpen} />
      <main className="container mx-auto max-w-3xl px-4 py-10">
        <AreaBreadcrumb items={[{ label: 'Área do colportor', to: '/colportor' }, viewLabel && { label: viewLabel }]} />
        {body}
      </main>
      <Footer />
    </>
  );
}
