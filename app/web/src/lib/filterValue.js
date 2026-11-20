// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Escapa valores para filtros da camada compatível (evita injecção em filter strings).
 *
 * Vive à parte do `sanitizeHtml.js` de propósito: este é usado no arranque (sessão, catálogo,
 * contactos) e aquele importa o DOMPurify, ~9 KB comprimidos que iam para o bloco principal de
 * todas as páginas só por causa desta função. O DOMPurify fica para quem mostra HTML.
 */
export function escapeFilterValue(value) {
  if (value == null) return '';
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
