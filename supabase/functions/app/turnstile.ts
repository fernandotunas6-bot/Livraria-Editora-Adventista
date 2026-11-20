// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Cloudflare Turnstile: prova de que quem envia um formulário público não é um programa.
//
// Achado da análise crítica de 2026-11-20: o checkout é público, cada encomenda reserva stock, e as
// de pagamento na entrega não se cancelam sozinhas. O limite de encomendas por contacto contorna-se
// mudando o contacto e o limite por IP com mais IPs: um programa esvaziava o stock visível da loja.
// O mesmo para o formulário de contacto, a candidatura a colportor e a newsletter.
//
// Liga-se com dois segredos da Edge Function, criados no Cloudflare (Turnstile → Add widget, modo
// «Managed», domínios livrariaadventista.ao e www.livrariaadventista.ao):
//   supabase secrets set TURNSTILE_SITE_KEY=0x… TURNSTILE_SECRET_KEY=0x…
// Sem eles nada muda: o site não mostra o widget e o servidor não pede o token. Com os dois, o
// /settings publica a chave do site e as rotas passam a exigir o token (docs/LANCAMENTO.md).
//
// Se o Cloudflare não responder, deixa passar e regista: uma loja que não vende porque o serviço
// de outra empresa caiu é pior do que um robô a mais durante esse tempo. Um token recusado, esse sim,
// recusa. Sem nada de Deno, para os testes correrem no `npm test`.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOutcome =
  | { ok: true; skipped?: boolean; degraded?: boolean }
  | { ok: false; reason: string };

/** Ligado só com as duas chaves: sem a do site, o widget não aparece e ninguém teria token. */
export function turnstileEnabled(siteKey: string | undefined | null, secret: string | undefined | null): boolean {
  return !!String(siteKey || "").trim() && !!String(secret || "").trim();
}

/**
 * Confere o token com o Cloudflare. `ok: false` só quando o Cloudflare diz que o token não vale
 * (ou não veio); falhas de rede passam (`degraded`).
 */
export async function verifyTurnstile(
  token: unknown,
  opts: { secret: string; ip?: string; fetchFn?: typeof fetch; timeoutMs?: number; log?: (...a: unknown[]) => void },
): Promise<TurnstileOutcome> {
  const secret = String(opts.secret || "").trim();
  if (!secret) return { ok: true, skipped: true };
  const response = typeof token === "string" ? token.trim() : "";
  // Os tokens do Turnstile têm até 2048 caracteres.
  if (!response || response.length > 2048) return { ok: false, reason: "missing-input-response" };
  const form = new URLSearchParams({ secret, response });
  if (opts.ip && opts.ip !== "anon") form.set("remoteip", opts.ip);
  const log = opts.log || console.log;
  try {
    const res = await (opts.fetchFn || fetch)(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      log("Turnstile: o Cloudflare respondeu", res.status);
      return { ok: true, degraded: true };
    }
    const data = await res.json().catch(() => null) as { success?: boolean; "error-codes"?: string[] } | null;
    if (!data) return { ok: true, degraded: true };
    if (data.success === true) return { ok: true };
    const codes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
    // Chave secreta errada é erro nosso, não do visitante: passa e fica no registo.
    if (codes.some((c) => c === "invalid-input-secret" || c === "missing-input-secret")) {
      log("Turnstile: a chave secreta foi recusada pelo Cloudflare", codes.join(","));
      return { ok: true, degraded: true };
    }
    return { ok: false, reason: codes.join(",") || "rejected" };
  } catch (err) {
    log("Turnstile: sem resposta do Cloudflare", (err as Error)?.message || err);
    return { ok: true, degraded: true };
  }
}

/** A frase para o visitante quando o token falta ou não vale. */
export const TURNSTILE_MESSAGE = "Não conseguimos confirmar que não é um robô. Espere um momento e tente outra vez.";
