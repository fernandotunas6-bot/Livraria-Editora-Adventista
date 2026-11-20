// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O Painel de Gestão tem domínio próprio (docs/PAINEL-GESTAO.md): em gestao.livrariaadventista.ao o site abre só o
 * painel — mesmo deploy do Cloudflare Pages, mesmas contas — e não mostra a loja, o assistente nem os avisos da app.
 */
export const ENDERECO_GESTAO = 'https://gestao.livrariaadventista.ao';

export const eGestao = (hostname) => /^gestao\./i.test(String(hostname || ''));

export const EM_GESTAO = typeof window !== 'undefined' && eGestao(window.location.hostname);
