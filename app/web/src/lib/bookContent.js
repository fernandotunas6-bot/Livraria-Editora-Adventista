// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Conteúdo em falta num livro, com um só critério para o painel (indicadores e filtros).
 *
 * Antes o indicador "Sem capa" olhava só para `cover` e o filtro com o mesmo nome também
 * para `cover_image`: os números não batiam com a lista. E não havia nada para as
 * descrições, que faltavam em 100 dos 102 livros (auditoria, achado 5).
 */

// Uma descrição com menos do que isto não é uma sinopse ("-", "Em breve", "<p><br></p>").
export const MIN_DESCRIPTION_CHARS = 20;

/** Texto visível de um HTML do editor, sem etiquetas, entidades de espaço nem espaços a mais. */
export function visibleText(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const hasCover = (book) => Boolean(String(book?.cover || book?.cover_image || '').trim());

export const hasDescription = (book) => visibleText(book?.description).length >= MIN_DESCRIPTION_CHARS;

/**
 * Rascunho de um artigo novo do KanGest ainda por rever: entrou sozinho, oculto (docs/KANGEST.md §4.1). Quando alguém
 * o publica, deixa de ser rascunho.
 */
export const isKanGestDraft = (book) => Boolean(book?.kangest_novo_em) && book?.active === false;
