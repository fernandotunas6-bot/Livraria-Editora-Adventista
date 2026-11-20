// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * As ligações para descarregar os apps (site_settings.app_android_url e app_ios_url), como saem
 * no `/settings` público. O painel escreve o que quiser; para o site só vai uma ligação https,
 * sem espaços nem credenciais — é o que acaba no `href` de um botão da página /app.
 *
 * O mesmo filtro vive no site (app/web/src/lib/appDownload.js → ligacaoDaApp).
 *
 * Sem nada de Deno nem de Supabase: testado no `npm test` (appLinks.test.ts).
 */
export function appLink(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s || s.length > 500 || /\s/.test(s)) return "";
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  return url.href;
}
