// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import pb from '@/lib/dataClient';
import { APP_API_URL } from '@/lib/supabaseClient';
import { DAY_MS, readCache, writeCache } from '@/lib/localCache';

// As integrações activas (públicas: que botões e serviços o site mostra) da última visita, até 7
// dias: quem volta não espera pela Edge Function para ver o botão do WhatsApp, por exemplo.
const CACHE_KEY = 'integracoes:v1';

const IntegrationsContext = createContext({
  integrations: {},
  driveImageConfig: { enabled: false },
  loading: true,
  refresh: async () => {},
});


export function IntegrationsProvider({ children }) {
  const [integrations, setIntegrations] = useState(() => readCache(CACHE_KEY, 7 * DAY_MS) || {});
  const [driveImageConfig, setDriveImageConfig] = useState({ enabled: false });
  const [loading, setLoading] = useState(true);

  // `fresh`: o painel, depois de gravar uma integração, pede sem a cache do browser (a
  // resposta pública fica 30 s em cache, como a de /settings).
  const refresh = useCallback(async ({ fresh = false } = {}) => {
    try {
      const res = await fetch(`${APP_API_URL}/integrations`, fresh ? { cache: 'no-cache' } : undefined);
      const data = res.ok ? await res.json() : null;
      if (data) {
        setIntegrations(data.integrations || {});
        writeCache(CACHE_KEY, data.integrations || {});
      }

      // Só a equipa usa a configuração do Drive (e só a ela a rota responde): um cliente com
      // sessão fazia um pedido a mais em cada página, sempre recusado.
      if (pb.authStore.isValid && ['admin', 'manager'].includes(pb.authStore.record?.role)) {
        try {
          const adminRes = await pb.send('/api/app/admin/media-config', { method: 'GET' });
          const drive = adminRes?.google_drive;
          setDriveImageConfig({
            enabled: !!drive?.enabled,
            ...(drive?.config || {}),
          });
        } catch {
          setDriveImageConfig({ enabled: false });
        }
      } else {
        setDriveImageConfig({ enabled: false });
      }
    } catch {
      // Sem rede: fica a cópia guardada (ou nada).
      setDriveImageConfig({ enabled: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    return pb.authStore.onChange(() => { refresh(); });
  }, [refresh]);

  return (
    <IntegrationsContext.Provider value={{ integrations, driveImageConfig, loading, refresh }}>
      {children}
    </IntegrationsContext.Provider>
  );
}

export function useIntegrations() {
  return useContext(IntegrationsContext);
}
