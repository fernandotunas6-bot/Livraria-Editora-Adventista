// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import PainelGestao, { BotoesPainel } from '@/components/gestao/PainelGestao';
import { escreverFiltros, lerFiltros } from '@/lib/painelGestao';
import { EM_GESTAO, ENDERECO_GESTAO } from '@/lib/gestaoHost';

const MetasDialog = lazy(() => import('@/components/gestao/MetasDialog'));
const PublicidadeDialog = lazy(() => import('@/components/gestao/PublicidadeTv').then((m) => ({ default: m.PublicidadeDialog })));
const ModoTv = lazy(() => import('@/components/gestao/ModoTv'));

/**
 * Painel de Gestão (docs/PAINEL-GESTAO.md): em gestao.livrariaadventista.ao (e /gestao), e dentro do painel
 * (`embutido`, Relatórios → Painel de Gestão). Os filtros ficam no endereço (?loja=…&canal=…&tv=1).
 */
export default function PainelGestaoPage({ embutido = false }) {
  const { ready, isAuthed, hasPermission, logout } = useAuth();
  const { settings } = useSiteSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const filtros = lerFiltros(location.search);
  const [dados, setDados] = useState(null);
  const [metas, setMetas] = useState(false);
  const [publicidade, setPublicidade] = useState(false);
  const nome = settings?.site_name || 'Livraria';
  const logo = settings?.logo_url || settings?.logo || '';

  useEffect(() => {
    if (!embutido) document.title = `Painel de Gestão · ${nome}`;
  }, [embutido, nome]);

  const mudarFiltros = useCallback((f) => {
    navigate({ pathname: location.pathname, search: escreverFiltros(location.search, { ...filtros, ...f }) }, { replace: true });
  }, [navigate, location.pathname, location.search, filtros]);

  if (!embutido) {
    if (!ready) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">A abrir…</div>;
    if (!isAuthed) {
      return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    }
  }
  const podeVer = hasPermission('view_reports') || hasPermission('edit_reports') || hasPermission('view_store_dashboard');
  if (!podeVer) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Sem acesso ao Painel de Gestão</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Peça ao administrador a permissão «Ver relatórios» (todas as lojas) ou «Painel da sua loja» (a loja da sua ficha de funcionário).
        </p>
        {!embutido && <Button variant="outline" onClick={() => logout?.()}><LogOut className="mr-1.5 h-4 w-4" />Sair</Button>}
      </div>
    );
  }
  const podeMetas = hasPermission('edit_reports');
  const podePublicidade = hasPermission('manage_settings') || hasPermission('edit_reports');

  if (filtros.tv) {
    return (
      <Suspense fallback={null}>
        <ModoTv canal={filtros.canal} alvoInicial={filtros.alvo} logo={logo} nome={nome} onSair={() => mudarFiltros({ tv: false })} />
      </Suspense>
    );
  }

  const acoes = (
    <BotoesPainel
      onMetas={podeMetas && dados ? () => setMetas(true) : null}
      onPublicidade={podePublicidade ? () => setPublicidade(true) : null}
      onTv={() => mudarFiltros({ tv: true })}
    />
  );
  // na página própria, o «Sair» fica na faixa azul do painel, ao lado do relógio
  const sair = embutido ? null : (
    <Button size="sm" variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={() => logout?.()} aria-label="Sair">
      <LogOut className="h-4 w-4" />
    </Button>
  );
  const painel = (
    <>
      <PainelGestao alvo={filtros.alvo} canal={filtros.canal} onFiltros={mudarFiltros} variante={embutido ? 'admin' : 'pagina'}
        acoes={acoes} extra={sair} onDados={setDados} />
      <Suspense fallback={null}>
        {metas && dados && (
          <MetasDialog open={metas} onOpenChange={setMetas} alvos={dados.alvos} ano={dados.ano} mes={dados.mes} />
        )}
        {publicidade && <PublicidadeDialog open={publicidade} onOpenChange={setPublicidade} />}
      </Suspense>
    </>
  );

  if (embutido) {
    return (
      <div className="space-y-3">
        {!EM_GESTAO && (
          <p className="text-xs text-muted-foreground">
            Também em <a className="inline-flex items-center gap-1 underline" href={ENDERECO_GESTAO} target="_blank" rel="noopener noreferrer">
              {ENDERECO_GESTAO.replace('https://', '')}<ExternalLink className="h-3 w-3" /></a>, em ecrã inteiro e no modo TV.
          </p>
        )}
        {painel}
      </div>
    );
  }
  // a faixa azul do painel (com o logótipo) abre a página; o fundo leva um brilho da marca
  return (
    <div className="min-h-screen bg-[#ffffff] text-foreground dark:bg-background"
      style={{ backgroundImage: 'radial-gradient(60rem 30rem at 100% 0%, rgba(10,116,143,0.08), transparent 60%)' }}>
      <main className="mx-auto max-w-[1600px] px-3 pb-2 pt-3 sm:px-5">{painel}</main>
    </div>
  );
}
