import { useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * A chave que decide quando a página inteira é montada de novo.
 *
 * O `App.jsx` envolvia as rotas numa fronteira de erros com `key={location.key}`, para uma
 * página que rebentou voltar a funcionar quando se navega. Mas o React Router dá uma
 * `location.key` nova a **qualquer** navegação, incluindo o `setSearchParams(…, { replace:
 * true })` com que as próprias páginas guardam o seu estado no endereço. Cada uma dessas
 * escritas desmontava e voltava a montar a página toda. Medido no navegador:
 *
 * - **na loja, cada filtro ou ordenação remontava a página** — e no telemóvel o painel de
 *   filtros fechava-se sozinho a cada toque, porque o "aberto" é estado da página. Combinar
 *   dois filtros obrigava a reabrir o painel e a descer outra vez até onde se estava;
 * - no painel, cada mudança de separador remontava o painel e voltava a carregar tudo
 *   (encomendas, livros, relatórios); no perfil, o mesmo com as encomendas;
 * - a "Ordenação por defeito" das Configurações perdia-se: chegava depois do primeiro desenho,
 *   a escrita no endereço remontava a loja, e a nova montagem lia a ordenação antiga.
 *
 * A remontagem fica para quando é precisa: uma navegação **a sério** — um link (PUSH), voltar
 * atrás ou à frente (POP) — ou uma mudança de página. Um link do menu de `/shop?category=A`
 * para `/shop?category=B` continua a montar a loja de novo, e é isso que faz os filtros
 * passarem a B (o `useProductFilters` lê-os do endereço ao montar). O que deixa de remontar é
 * só a página a reescrever o seu próprio endereço, sempre com `replace`, no mesmo caminho.
 *
 * Um `<Navigate replace>` para outro caminho (por exemplo `/loja` → `/shop`) muda o caminho,
 * por isso continua a remontar.
 */
export function useRouteRemountKey() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const chave = useRef(location.key);
  const caminho = useRef(location.pathname);

  // Actualizado durante o desenho, e não num efeito: num efeito a nova chave só chegava um
  // desenho depois, e a página chegava a desenhar uma vez com o estado antigo. O cálculo é
  // idempotente — o mesmo endereço dá sempre a mesma chave —, por isso desenhar duas vezes
  // (StrictMode, desenho concorrente) não muda o resultado.
  if (navigationType !== 'REPLACE' || location.pathname !== caminho.current) {
    chave.current = location.key;
  }
  caminho.current = location.pathname;
  return chave.current;
}
