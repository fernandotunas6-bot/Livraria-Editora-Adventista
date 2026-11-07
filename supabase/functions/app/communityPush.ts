/**
 * Avisos da comunidade (respostas, respostas oficiais e gostos): só push, nunca email. O aviso
 * dentro do site já foi escrito pela base de dados; aqui decide-se se e quando sai o push.
 */
export const LIKE_TITLE = "Gostaram da sua publicação";
/** Os gostos esperam este tempo para chegarem num único push com o texto agrupado. */
export const LIKE_WAIT_MS = 30 * 60_000;

export type CommunityNotice = { title?: string | null; created_at: string; read_at?: string | null };

/**
 * 'wait': ainda não (gosto recente, pode juntar mais); 'skip': marcar como tratado sem push
 * (já foi lido no site, ou a pessoa desligou os avisos); 'push': enviar.
 */
export function communityPushPlan(n: CommunityNotice, opts: { now: number; notify: boolean }): "wait" | "skip" | "push" {
  if (n.read_at) return "skip";
  if (!opts.notify) return "skip";
  if (n.title === LIKE_TITLE && opts.now - new Date(n.created_at).getTime() < LIKE_WAIT_MS) return "wait";
  return "push";
}

/** Só caminhos do próprio site; qualquer outra coisa abre a comunidade. */
export function communityPushUrl(href: unknown): string {
  return typeof href === "string" && /^\/comunidade\/[A-Za-z0-9/_-]+$/.test(href) ? href : "/comunidade";
}
