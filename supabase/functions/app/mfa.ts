// Verificação em dois passos (TOTP do Supabase Auth) na Edge Function.
//
// Uma conta com um factor verificado só tem os poderes da equipa numa sessão `aal2`, ou seja,
// depois de introduzir o código da aplicação autenticadora. Com a palavra-passe apenas, a
// sessão é `aal1` e vale como a de um cliente. A mesma regra está na base de dados
// (`private.mfa_satisfied`, usada por `is_admin`, `is_staff` e `has_permission`): sem ela,
// quem soubesse a palavra-passe chamava a API REST directamente e saltava o ecrã do código.
// Contas sem factor não mudam nada.
// Sem nada de Deno, para os testes correrem no `npm test`.

type Factor = { status?: string | null };

/** Lê as reivindicações de um JWT já validado (o `getUser` confirmou-o). Nunca lança. */
export function jwtClaims(token: string): Record<string, unknown> {
  try {
    const part = String(token || "").split(".")[1] || "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** A sessão ainda deve o segundo passo: há factor verificado e o token não é `aal2`. */
export function mfaPending(factors: Factor[] | null | undefined, token: string): boolean {
  const hasVerified = (factors || []).some((f) => f?.status === "verified");
  return hasVerified && jwtClaims(token).aal !== "aal2";
}
