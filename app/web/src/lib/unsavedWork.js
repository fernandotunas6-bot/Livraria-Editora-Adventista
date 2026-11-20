// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Trabalho por gravar, para a app não se actualizar sozinha por cima dele (AppUpdateNotice).
//
// Um ecrã com alterações ainda não gravadas (o editor e o quadro do Painel de Vendas, por
// exemplo) marca-se aqui enquanto as tem; a actualização automática espera que deixe de ter.

const marcas = new Set();

/** `sim` = este ecrã (`id`) tem alterações por gravar; `false` tira a marca. */
export function marcarPorGravar(id, sim) {
  if (sim) marcas.add(String(id));
  else marcas.delete(String(id));
}

export const haTrabalhoPorGravar = () => marcas.size > 0;

/** Só para os testes. */
export function _limparPorGravar() { marcas.clear(); }
