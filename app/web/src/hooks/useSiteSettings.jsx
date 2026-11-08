import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchSiteSettings } from '@/api/PlatformApi';
import { DAY_MS, readCache, writeCache } from '@/lib/localCache';
import { BRAND } from '@/lib/brand';
import { withCacheBust } from '@/lib/imageUrl';
import { applyShopTheme } from '@/lib/shopTheme';

const THEME_DEFAULTS = {
  primary_color: '#0ea5c9',
  pwa_theme_color: '#0c4a6e',
  ui_glass_enabled: true,
  ui_glass_opacity: 0.72,
  shop_bg_mode: 'image',
  shop_bg_overlay: 0.55,
};

const SiteSettingsContext = createContext(null);

// As configurações públicas da última visita (até 7 dias): quem volta vê logo o tema, os textos e
// as regras da loja certos, e a versão nova chega por trás (lib/localCache.js).
const CACHE_KEY = 'definicoes:v1';
const CACHE_MAX_AGE = 7 * DAY_MS;

function applyHead(data) {
  if (typeof document === 'undefined' || !data) return;
  if (data.favicon_url) {
    const favHref = withCacheBust(data.favicon_url, data.assets_version);
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = favHref;
  }
  if (data.pwa_theme_color) {
    let meta = document.querySelector("meta[name='theme-color']");
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = data.pwa_theme_color;
  }
}

export function SiteSettingsProvider({ children }) {
  const [cached] = useState(() => readCache(CACHE_KEY, CACHE_MAX_AGE));
  const [settings, setSettings] = useState(() => ({
    ...BRAND,
    ...THEME_DEFAULTS,
    site_name: BRAND.name,
    logo_url: '',
    favicon_url: '',
    assets_version: '',
    shipping_free_threshold: 20000,
    shipping_cost: 1500,
    pwa_enabled: true,
    maintenance_mode: false,
    google_oauth_enabled: false,
    ...(cached || {}),
  }));
  // Com uma cópia guardada já não se espera: os ecrãs que aguardam as configurações mostram-se logo.
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    applyShopTheme(cached ? { ...THEME_DEFAULTS, ...cached } : THEME_DEFAULTS);
    if (cached) applyHead(cached);
  }, [cached]);

  // Chamado sem argumentos (o painel, depois de gravar) vai sempre ao servidor: a resposta
  // pública do `/settings` fica uns segundos em cache no browser, e o admin tem de ver logo
  // o que acabou de gravar. No arranque aceita-se a cópia em cache.
  const refresh = useCallback(async ({ fresh = true } = {}) => {
    try {
      const data = await fetchSiteSettings({ fresh });
      writeCache(CACHE_KEY, data);
      const merged = { ...THEME_DEFAULTS, ...data };
      setSettings((prev) => ({ ...prev, ...merged }));
      applyShopTheme(merged);
      applyHead(data);
      if (data.site_name) document.title = data.site_name;
    } catch {
      // Sem resposta: fica a cópia guardada (se havia) ou as de omissão.
      setSettings((prev) => ({ ...THEME_DEFAULTS, ...prev }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh({ fresh: false }); }, [refresh]);

  return (
    <SiteSettingsContext.Provider value={{ settings, loading, refresh }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export const useSiteSettings = () => useContext(SiteSettingsContext);
