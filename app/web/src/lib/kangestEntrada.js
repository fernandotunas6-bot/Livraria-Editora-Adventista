// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * A entrada nos dois sentidos entre o KanGest e o site (pedido do dono a 27/11: «o login deve funcionar para os dois»;
 * o servidor está em supabase/functions/app/kangestEntrada.ts):
 * - `/kangest/abrir#t=…&d=…`: o KanGest abre uma página do painel já com a sessão da pessoa (o resumo de um link de
 *   entrada, no fragmento, que nunca chega a nenhum servidor);
 * - `/kangest/entrar-com-o-site?e=…&d=…`: quem tem a sessão aberta no site entra no KanGest, depois de confirmar.
 */

/** As páginas que o KanGest pode abrir: as mesmas que o servidor aceita (`destinoNoSite`). */
const DESTINO = /^\/(?:admin|gestao|profile|shop|product\/[A-Za-z0-9_-]{1,80}|track|lojas|comunidade|novidades)?(?:\?[A-Za-z0-9_=&%.+~-]{0,400})?$/;

/** O destino, se é uma página permitida do próprio site; senão o painel. */
export function destinoPermitido(d) {
  const t = String(d ?? '').trim();
  return t && t.length <= 500 && DESTINO.test(t) ? t : '/admin';
}

/** O resumo do link de entrada e o destino, tirados do fragmento (`#t=…&d=…`). */
export function lerAbertura(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const t = p.get('t') || '';
  return { tokenHash: /^[A-Za-z0-9_-]{8,200}$/.test(t) ? t : '', destino: destinoPermitido(p.get('d')) };
}

/** O pedido do KanGest (`?e=<estado>&d=<desafio PKCE>`), se tem a forma do que o KanGest gera; senão `null`. */
export function pedidoDoKanGest(search) {
  const p = new URLSearchParams(String(search || ''));
  const estado = p.get('e') || '';
  const desafio = p.get('d') || '';
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(estado) || !/^[A-Za-z0-9_-]{43}$/.test(desafio)) return null;
  return { estado, desafio };
}

/** A ligação que devolve o código ao KanGest (a mesma do retorno do Google: `kangest://auth?e=…&code=…`). */
export function retornoParaOKanGest(estado, codigo) {
  return `kangest://auth?e=${encodeURIComponent(estado)}&code=${encodeURIComponent(codigo)}`;
}

/** A ligação que diz ao KanGest que a pessoa desistiu. */
export function desistenciaParaOKanGest(estado) {
  return `kangest://auth?e=${encodeURIComponent(estado)}&erro=${encodeURIComponent('A pessoa cancelou no site.')}`;
}
