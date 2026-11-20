// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { createPainelApi, detectMultiStore, listStores } from '@/painel-vendas/adapter';
import { storeGallery } from '@/lib/stores';
import { mountPainel } from '@/painel-vendas/painel.js';
import css from '@/painel-vendas/painel.css?inline';
import markup from '@/painel-vendas/painel.html?raw';
// O logotipo oficial (o mesmo de public/logo.png, mais leve): no ecrã, nas imagens e nos PDFs
// que o painel exporta. Antes era o do Ministério de Publicações.
import logoUrl from '@/painel-vendas/logo-livraria-adventista.png';
// A versão branca, para o topo escuro e para os vídeos (PNG transparente, sem fundo branco).
import logoClaroUrl from '@/painel-vendas/logo-livraria-adventista-claro.png';

const STORE_KEY = 'painel-vendas:loja';

const isHuambo = (s) => /huambo/i.test(`${s?.province || ''} ${s?.name || ''}`);

/**
 * Separador "Vendas por loja" do Painel Admin: o painel do pacote painel-vendas-huambo com o design original.
 * Corre num Shadow DOM, para que o Tailwind do sistema não altere o painel e o CSS do painel não altere o sistema.
 * Ler exige «Ver relatórios» ou «Editar relatórios de vendas»; gravar exige «Editar relatórios de vendas» ou
 * administrador (RLS em vendas_anos e painel_vendas_docs, migração relatorios_de_todas_as_livrarias).
 * Com a migração painel_vendas_por_loja cada loja tem os seus dados; antes dela há só os da Loja do Huambo.
 */
const VendasHuamboTab = () => {
  const hostRef = useRef(null);
  const { user, isAdmin, hasPermission } = useAuth();
  const { theme } = useTheme();
  const userId = user?.id;
  const role = user?.role;
  const canReadOrders = isAdmin || hasPermission('manage_orders');
  const canEdit = isAdmin || hasPermission('edit_reports');
  const canReadSales = isAdmin || hasPermission('view_reports') || hasPermission('edit_reports');

  const [stores, setStores] = useState(null);
  const [multi, setMulti] = useState(false);
  const [lojaId, setLojaId] = useState(() => {
    try { return localStorage.getItem(STORE_KEY) || ''; } catch { return ''; }
  });

  useEffect(() => {
    let alive = true;
    Promise.all([detectMultiStore(), listStores()]).then(([m, list]) => {
      if (!alive) return;
      setMulti(m);
      setStores(list);
    });
    return () => { alive = false; };
  }, []);

  // Sem a migração os dados são da Loja do Huambo; com ela, a loja escolhida (por omissão a do Huambo).
  const store = useMemo(() => {
    if (!stores) return null;
    if (!multi) return stores.find(isHuambo) || null;
    return stores.find((s) => s.id === lojaId) || stores.find(isHuambo) || stores[0] || null;
  }, [stores, multi, lojaId]);

  const chooseStore = (id) => {
    setLojaId(id);
    try { localStorage.setItem(STORE_KEY, id); } catch { /* sem localStorage: fica só nesta visita */ }
  };

  const storeId = store?.id || '';
  useEffect(() => {
    if (!stores) return undefined;
    const host = hostRef.current;
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style>${markup.replace('__LOGO__', logoUrl).replace('__LOGO_CLARO__', logoClaroUrl)}`;
    const api = createPainelApi({ id: userId, role }, {
      lojaId: multi ? storeId || null : null,
      // As fotografias da galeria da loja (separador Lojas) entram no modo apresentação.
      store: store ? { id: store.id, name: store.name, province: store.province, fotos: storeGallery(store) } : null,
      canReadOrders,
      canEdit,
      canReadSales,
    });
    const unmount = mountPainel(root, api);
    return () => {
      unmount();
      root.replaceChildren();
    };
    // store muda sempre que storeId muda; as restantes dependências são estáveis durante a visita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, multi, storeId, userId, role, canReadOrders, canEdit, canReadSales]);

  return (
    <div className="space-y-3">
      {multi && stores?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Store className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="painel-loja" className="font-medium">Loja</label>
          <select
            id="painel-loja"
            value={storeId}
            onChange={(e) => chooseStore(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ' (inactiva)'}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">Cada loja tem os seus anos, metas e histórico.</span>
        </div>
      )}
      {!multi && stores && isAdmin && (
        <p className="text-xs text-muted-foreground">
          Os dados mostrados são da Loja do Huambo. A escolha de loja fica disponível depois de aplicada a migração “painel_vendas_por_loja”.
        </p>
      )}
      {/* O painel segue o tema claro/escuro do sistema. */}
      <div ref={hostRef} data-theme={theme === 'dark' ? 'dark' : 'light'} />
    </div>
  );
};

export default VendasHuamboTab;
