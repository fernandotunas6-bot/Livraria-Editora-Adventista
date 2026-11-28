// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * A entrada nos dois sentidos entre o KanGest e o site (pedido do dono a 27/11: «o login deve funcionar para os dois»):
 * - **do KanGest para o site** (`POST /kangest/abrir-no-site`): quem está no KanGest com a conta do site abre uma página
 *   do painel já com a sessão, sem escrever a senha outra vez. Só para os destinos desta lista;
 * - **do site para o KanGest** (`/kangest/entrar-com-o-site/*`): quem tem a sessão aberta no site entra no KanGest com
 *   um código de uso único preso ao desafio PKCE do KanGest (RFC 7636), que só o KanGest que o pediu consegue trocar.
 *
 * Código puro, sem rede nem base de dados (os testes estão em `kangestEntrada.test.ts`).
 */

/**
 * As páginas do site que o KanGest pode abrir já com a sessão: o painel, a gestão, o perfil, a loja, um produto, o
 * rastreio, as lojas, a comunidade e as novidades, com uma pergunta (`?tab=…`) só de caracteres seguros. Sem `//`, sem
 * `:`, sem `@` nem `\`: o destino é sempre um caminho do próprio site, nunca outro endereço.
 */
const DESTINO = /^\/(?:admin|gestao|profile|shop|product\/[A-Za-z0-9_-]{1,80}|track|lojas|comunidade|novidades)?(?:\?[A-Za-z0-9_=&%.+~-]{0,400})?$/;

/** O destino pedido, se é uma página permitida; senão `null`. Sem destino, o painel. */
export function destinoNoSite(d: unknown): string | null {
  const t = String(d ?? "").trim() || "/admin";
  return t.length <= 500 && DESTINO.test(t) ? t : null;
}

/** Bytes em base64url sem `=` (RFC 4648 §5). */
export function base64url(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** O desafio PKCE S256 de um verificador: base64url(SHA-256(verificador)), como o KanGest o calcula. */
export async function desafioPkce(verificador: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador))));
}

/** O que o KanGest gera: 32 bytes em base64url (43 caracteres). */
export const verificadorValido = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(v);
export const desafioValido = (d: unknown) => typeof d === "string" && /^[A-Za-z0-9_-]{43}$/.test(d);
/** O estado de uma entrada do KanGest (18 bytes em base64url, ou parecido): o mesmo que `estado_valido` no Rust. */
export const estadoValido = (e: unknown) => typeof e === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(e);
/** O código de uso único: 32 bytes em base64url, como `codigoDeEntrada` o gera. */
export const codigoValido = (c: unknown) => typeof c === "string" && /^[A-Za-z0-9_-]{43}$/.test(c);

/** Um código de entrada novo: 32 bytes aleatórios em base64url. Na base só fica o resumo. */
export function codigoDeEntrada(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Compara dois textos sem parar no primeiro carácter diferente (o tempo não diz quanto acertou). */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * A página do site que abre a sessão a partir do resumo do link de entrada (`/kangest/abrir`). O resumo e o destino
 * vão no fragmento (`#`), que o navegador nunca manda a nenhum servidor nem deixa nos registos.
 */
export function enderecoDeAbertura(site: string, tokenHash: string, destino: string): string {
  const base = site.replace(/\/+$/, "");
  return `${base}/kangest/abrir#t=${encodeURIComponent(tokenHash)}&d=${encodeURIComponent(destino)}`;
}
