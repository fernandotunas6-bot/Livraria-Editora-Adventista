// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O crédito do rodapé, «Desenvolvido pela Kanguele», liga ao site da Kanguele (o KanGest). O endereço vem das
 * Configurações do painel (`site_settings.kangest_url`, separador Rodapé): mudar o domínio lá muda o link nos dois
 * rodapés, sem mexer no código. Um endereço vazio ou inválido volta ao de omissão, para o link nunca ficar partido.
 */
export const KANGUELE_SITE = 'https://kangest.livrariaadventista.com/';

/** O endereço do site da Kanguele: o das Configurações se for um https:// válido; senão, o de omissão. */
export function ligacaoKanguele(valor) {
  const v = String(valor ?? '').trim();
  if (!v || v.length > 200 || /[\s"'<>]/.test(v)) return KANGUELE_SITE;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return KANGUELE_SITE;
    return u.toString();
  } catch {
    return KANGUELE_SITE;
  }
}
