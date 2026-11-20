// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Novidades da app por push a todos os aparelhos (migração `versoes_da_app`).
 *
 * Cada push é cifrado para o seu aparelho, e uma Edge Function tem pouco tempo de CPU por
 * pedido: com milhares de aparelhos, um envio de uma vez não acabava. Vai por lotes, pela ordem
 * do `id` das subscrições, com o último `id` tratado guardado na novidade (`push_cursor`). O
 * primeiro lote sai logo que a equipa pede; os seguintes, de 2 em 2 minutos, pelo agendador
 * "avisos-equipa". Antes de enviar, o lote é reservado (o cursor só avança se ainda for o que se
 * leu): o botão e o agendador ao mesmo tempo nunca enviam o mesmo lote duas vezes.
 *
 * Sem nada de Deno nem de Supabase: testado no `npm test` (releasePush.test.ts).
 */

/** Aparelhos por lote: cabe com folga no tempo de CPU de um pedido. */
export const RELEASE_PUSH_BATCH = 150;
/** Envios em paralelo dentro de um lote (cada um espera pelo serviço de push do telemóvel). */
export const RELEASE_PUSH_CONCURRENCY = 10;
/** Um envio parado há mais do que isto deixa de ser retomado (o agendador também o ignora). */
export const RELEASE_PUSH_MAX_AGE_MS = 2 * 24 * 3600_000;

export type ReleaseForPush = { id: string; title?: string | null };

/** O aviso no telemóvel: tocar abre /novidades, já na versão nova. */
export function releasePushPayload(release: ReleaseForPush) {
  const title = String(release.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    title: "Nova versão da app",
    body: title || "Veja o que mudou.",
    url: "/novidades",
    tag: "livraria:novidades",
  };
}

/** Depois de ler um lote: o cursor seguinte e se o envio acaba com ele. */
export function nextReleaseBatch(ids: string[], previous: string | null, batch = RELEASE_PUSH_BATCH) {
  const cursor = ids.length ? ids[ids.length - 1] : previous;
  return { cursor: cursor ?? null, done: ids.length < batch };
}

/** O envio ainda vale a pena retomar? */
export function releasePushAlive(requestedAt: string | null | undefined, now = Date.now()) {
  const at = requestedAt ? new Date(requestedAt).getTime() : NaN;
  return Number.isFinite(at) && now - at <= RELEASE_PUSH_MAX_AGE_MS;
}

/** O que fazer a uma subscrição depois de um envio falhado: apagar (o aparelho já não existe) ou só contar. */
export function pushFailure(err: unknown): "gone" | "failed" {
  const code = (err as { statusCode?: number } | null)?.statusCode;
  return code === 404 || code === 410 ? "gone" : "failed";
}

/** `fn` para cada um, no máximo `limit` ao mesmo tempo; os resultados pela ordem de entrada. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
