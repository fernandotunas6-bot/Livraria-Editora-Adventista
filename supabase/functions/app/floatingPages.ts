// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Páginas onde os botões flutuantes do site (assistente, "Voltar ao topo") não aparecem.
// As chaves são as de app/web/src/lib/floatingButtons.js e da restrição da migração
// `botoes_flutuantes_por_pagina`: mudar uma obriga a mudar as outras.

export const FLOATING_PAGE_KEYS: readonly string[] = [
  "inicio", "loja", "produto", "encomenda", "entrar", "perfil", "informacao", "painel",
];

/** Só chaves conhecidas, sem repetir. Sem lista gravada (coluna por migrar): `null`, e o site usa as de omissão. */
export function floatingPagesFrom(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return FLOATING_PAGE_KEYS.filter((k) => value.includes(k));
}
