// Verificação em dois passos (TOTP do Supabase Auth) na Edge Function.
//
// Uma conta com um factor verificado só tem os poderes da equipa numa sessão `aal2`, ou seja,
// depois de introduzir o código da aplicação autenticadora. Com a palavra-passe apenas, a
// sessão é `aal1` e vale como a de um cliente. A mesma regra está na base de dados
// (`private.mfa_satisfied`, usada por `is_admin`, `is_staff` e `has_permission`): sem ela,
// quem soubesse a palavra-passe chamava a API REST directamente e saltava o ecrã do código.
//
// Desde a migração `dois_passos_obrigatorio_equipa`, a equipa (admin e gestor) precisa do código
// mesmo sem o ter activado, a partir do prazo em `private.staff_mfa_policy`: passado esse dia,
// uma conta da equipa sem factor vale como a de um cliente até o activar. Clientes não mudam.
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

/**
 * O prazo vindo da base de dados (`public.staff_mfa_deadline()`), em milissegundos.
 * `null` = sem prazo (a migração ainda não chegou, ou `infinity`): o código só se exige a quem o
 * activou. `-infinity` (a linha do prazo foi apagada) = já: a base de dados fecha, e aqui também.
 */
export function deadlineFrom(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (text === "infinity" || text === "+infinity") return null;
  if (text === "-infinity") return 0;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

export type MfaPolicy = {
  /** A conta é da equipa (admin ou gestor). */
  staff?: boolean;
  /** A partir de quando a equipa precisa do código (ms), ou `null` sem prazo. */
  enforceAfter?: number | null;
  now?: number;
};

/**
 * A sessão ainda deve o segundo passo:
 * - há factor verificado e o token não é `aal2`; ou
 * - é da equipa, não tem factor e o prazo já passou (tem de o activar).
 */
export function mfaPending(factors: Factor[] | null | undefined, token: string, policy: MfaPolicy = {}): boolean {
  const hasVerified = (factors || []).some((f) => f?.status === "verified");
  if (hasVerified) return jwtClaims(token).aal !== "aal2";
  if (!policy.staff) return false;
  const deadline = policy.enforceAfter;
  if (deadline === null || deadline === undefined || !Number.isFinite(deadline)) return false;
  return (policy.now ?? Date.now()) >= deadline;
}
