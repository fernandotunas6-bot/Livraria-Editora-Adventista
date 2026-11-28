// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * As ligações do painel do site pelo servidor da loja (pedido do dono a 27/11: «abrir sem protocolo com rotas
 * permitidas»). O painel abre o modo web deste servidor com a rota no endereço e a marca `origem=site`:
 * `http://192.168.1.10:7799/#/loja-online?encomenda=LA-1&origem=site`.
 *
 * **Só as rotas das ligações kangest://** (src-tauri/src/ligacoes.rs): a encomenda na Loja online, a Loja online
 * filtrada e a ajuda. Qualquer outra rota marcada como do site vai para o início. Uma ligação só leva a um ecrã: nunca
 * faz nada sozinha, e a pessoa entra como sempre. A rota sem a marca é a do próprio KanGest (um recarregar da página) e
 * não se mexe.
 */

const FILTROS = ["por_confirmar", "em_curso", "levantamentos", "concluidas", "canceladas"];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * A rota segura para um endereço (`#…`) marcado como vindo do site, sem a marca; `null` se não vier do site.
 */
export function destinoDoSite(hash: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const [caminho, consulta = ""] = h.split("?", 2);
  const p = new URLSearchParams(consulta);
  if (p.get("origem") !== "site") return null;
  if (caminho === "/loja-online") {
    const encomenda = p.get("encomenda");
    if (encomenda !== null) return ID.test(encomenda) ? `/loja-online?encomenda=${encomenda}` : "/loja-online";
    const filtro = p.get("filtro");
    return filtro && FILTROS.includes(filtro) ? `/loja-online?filtro=${filtro}` : "/loja-online";
  }
  if (caminho === "/ajuda") return "/?ajuda=avisos";
  return "/";
}
