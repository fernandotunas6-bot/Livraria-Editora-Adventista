import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { supabaseCspPlugin } from '../../scripts/csp-supabase.mjs';
import { appVersionPlugin } from '../../scripts/app-version.mjs';

export default defineConfig(({ mode }) => ({
  // O CSP do `_headers` passa a aceitar só o projecto Supabase da loja (ver o script). A versão
  // de cada build vai para o código e para /version.json: é como a app aberta sabe que há uma
  // versão nova (scripts/app-version.mjs).
  plugins: [react(), supabaseCspPlugin(loadEnv(mode, __dirname, 'VITE_').VITE_SUPABASE_URL), appVersionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: '../../dist/app/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Blocos fixos só para o que TODAS as páginas usam — o React com o router e o Supabase.
        // Ficam com o mesmo nome entre deploys e o browser reaproveita-os. O Framer Motion saiu
        // daqui: os componentes usam `m` e o motor das animações chega depois, por import
        // dinâmico (LazyMotion, lib/motionFeatures.js); um bloco fixo voltava a pô-lo no início.
        //
        // Tudo o resto fica com o Rollup, que põe cada pacote junto do código que o usa: os
        // gráficos e as suas dependências (lodash, react-smooth, decimal.js…) no painel, o
        // Firebase no seu bloco, carregado a pedido. Um `return 'vendor-core'` para os
        // restantes pacotes metia tudo isso na página inicial: ~80 KB das dependências do
        // Recharts iam para todas as visitas, porque a regra geral as apanhava antes de o
        // Rollup as juntar ao bloco dos gráficos.
        //
        // As expressões são exactas de propósito: `id.includes('/react')` apanhava também o
        // `react-smooth` (dos gráficos) e arrastava-o para o bloco do React.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return 'vendor-supabase';
          return undefined;
        },
      },
    },
  },
}));
