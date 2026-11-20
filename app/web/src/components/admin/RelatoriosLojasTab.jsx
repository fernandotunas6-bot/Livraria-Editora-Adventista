// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { createConsolidadoApi, detectMultiStore } from '@/painel-vendas/adapter';
import { mountConsolidado } from '@/painel-vendas/consolidado-ui.js';
import cssPainel from '@/painel-vendas/painel.css?inline';
import cssConjunto from '@/painel-vendas/consolidado.css?inline';
import markup from '@/painel-vendas/consolidado.html?raw';
import logoUrl from '@/painel-vendas/logo-livraria-adventista.png';
// A versão branca, para o topo escuro e para os vídeos (PNG transparente, sem fundo branco).
import logoClaroUrl from '@/painel-vendas/logo-livraria-adventista-claro.png';

// A mesma chave do separador Vendas por loja: abrir uma loja daqui deixa-a escolhida lá.
const STORE_KEY = 'painel-vendas:loja';

/**
 * Separador «Todas as livrarias» do Painel Admin: o relatório conjunto, com o desenho do painel de
 * vendas (painel.css) e o ecrã próprio (consolidado-ui.js), num Shadow DOM como o VendasHuamboTab.
 * Ver: «Ver relatórios» ou «Editar relatórios de vendas». Lançar vendas: «Editar relatórios de
 * vendas» ou administrador. Quem protege os dados é o RLS (migração relatorios_de_todas_as_livrarias).
 * `onOpenStore(id)`: abre o painel dessa loja no separador Vendas por loja.
 */
const RelatoriosLojasTab = ({ onOpenStore }) => {
  const hostRef = useRef(null);
  const { isAdmin, hasPermission } = useAuth();
  const { theme } = useTheme();
  const canEdit = isAdmin || hasPermission('edit_reports');
  const [multi, setMulti] = useState(null);
  const openRef = useRef(onOpenStore);
  openRef.current = onOpenStore;

  useEffect(() => {
    let alive = true;
    detectMultiStore().then((m) => { if (alive) setMulti(m); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!multi) return undefined;
    const host = hostRef.current;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${cssPainel}\n${cssConjunto}</style>${markup.replace('__LOGO__', logoUrl).replace('__LOGO_CLARO__', logoClaroUrl)}`;
    const api = createConsolidadoApi({ canEdit });
    api.abrirLoja = (id) => {
      try { localStorage.setItem(STORE_KEY, id); } catch { /* sem localStorage: abre a loja de omissão */ }
      openRef.current?.(id);
    };
    const unmount = mountConsolidado(root, api);
    return () => {
      unmount();
      root.replaceChildren();
    };
  }, [multi, canEdit]);

  if (multi === false) {
    return (
      <p className="text-sm text-muted-foreground">
        O relatório conjunto precisa das vendas separadas por loja (migração «painel_vendas_por_loja»).
      </p>
    );
  }

  return <div ref={hostRef} data-theme={theme === 'dark' ? 'dark' : 'light'} />;
};

export default RelatoriosLojasTab;
