import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    // Os testes são unitários e não falam com o Supabase, mas vários módulos criam o cliente
    // no momento do import e o supabase-js recusa um URL vazio. O `app/web/.env` é gitignored,
    // por isso num checkout limpo — como o do CI — quatro ficheiros falhavam a CARREGAR com
    // "supabaseUrl is required", sem correr um único teste. Valores fixos aqui, em vez de
    // passar as variáveis ao CI: o `npm test` passa a dar o mesmo resultado em qualquer
    // máquina, sem configuração nem segredos, e nenhum teste toca a rede.
    env: {
      VITE_SUPABASE_URL: 'http://supabase.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_apenas_para_testes',
    },
    // Inclui também os módulos de email da Edge Function: são TypeScript sem nada de Deno,
    // e assim o `npm test` (que o deploy usa como gate) cobre o HTML enviado aos clientes.
    include: ['src/**/*.test.{js,jsx}', '../../supabase/functions/**/*.test.ts'],
  },
});
