// KanGest — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { toast } from "sonner";
import { call, NA_APP } from "@/lib/api";
import { navegador } from "@/lib/navegador";

/** O caminho e a pergunta de um endereço do site (`/admin?tab=orders`), que é o que o site aceita como destino. */
export function destinoDoEndereco(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Abre uma página do painel do site já com a sessão da pessoa (pedido do dono a 27/11: «o login deve funcionar para os
 * dois»; sinc/pessoa.rs, `loja.conta.abrir_no_site`). Quem entrou no KanGest com a conta do site não escreve a senha
 * outra vez. No programa, a página com a sessão abre no navegador do KanGest em sessão privada: a sessão do site não
 * fica guardada no computador da loja para a pessoa seguinte. Sem a sessão do site (entrou com a senha local, ou está
 * sem Internet), abre a página como antes, e o site pede a entrada.
 */
export async function abrirNoSite(url: string) {
  let alvo = url;
  let comSessao = false;
  const destino = destinoDoEndereco(url);
  if (destino) {
    try {
      const r = await call<{ url: string | null }>("loja.conta.abrir_no_site", { destino });
      if (r?.url) {
        alvo = r.url;
        comSessao = true;
      }
    } catch {
      // sem a sessão do site: abre sem ela
    }
  }
  try {
    if (NA_APP) await navegador("abrir", { texto: alvo, privado: comSessao });
    else window.open(alvo, "_blank", "noopener");
  } catch (x) {
    toast.error((x as Error).message);
  }
}
