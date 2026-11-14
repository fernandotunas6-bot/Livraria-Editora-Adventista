import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build da página de teste do Painel de Vendas (ver main.js e e2e/painel-vendas.spec.js), com as
// mesmas regras de compilação do site: o que falhar aqui por causa do tree-shaking falha lá.
const aqui = path.dirname(fileURLToPath(import.meta.url));

export default {
  root: aqui,
  resolve: { alias: { '@': path.resolve(aqui, '../../src') } },
  build: { outDir: path.resolve(aqui, '../../../../dist/e2e-painel'), emptyOutDir: true },
};
