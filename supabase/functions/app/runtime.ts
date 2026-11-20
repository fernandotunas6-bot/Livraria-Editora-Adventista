// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Utilitários de execução da Edge Function, sem nada de Deno nem de Supabase — por isso
// testáveis no `npm test` (ver runtime.test.ts).

/**
 * Cache curta em memória, por instância da função.
 *
 * Guarda a promessa e não o valor: pedidos simultâneos à mesma chave partilham uma só
 * leitura em vez de irem todos à base de dados. Uma falha ou um resultado vazio
 * (`null`/`undefined`) não ficam guardados — o pedido seguinte volta a tentar, em vez de
 * ficar uns segundos sem definições por causa de uma falha passageira.
 */
export function createMemo(now: () => number = Date.now) {
  const memo = new Map<string, { at: number; value: Promise<unknown> }>();
  function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, fresh = false): Promise<T> {
    const hit = memo.get(key);
    if (!fresh && hit && now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = load();
    memo.set(key, { at: now(), value });
    const drop = () => { if (memo.get(key)?.value === value) memo.delete(key); };
    value.then((v) => { if (v == null) drop(); }, drop);
    return value;
  }
  const forget = (key: string) => { memo.delete(key); };
  return { cached, forget };
}

type EdgeRuntimeLike = { waitUntil?: (promise: Promise<unknown>) => void };

/**
 * Trabalho que quem fez o pedido não precisa de esperar (o email de confirmação, o registo
 * no CRM). `EdgeRuntime.waitUntil` mantém a instância viva até a tarefa acabar, já depois de
 * a resposta ter saído. Sem `EdgeRuntime` (testes locais) a tarefa corre na mesma.
 * Um erro fica no registo da função e nunca chega a quem fez o pedido.
 */
export function runAfterResponse(
  label: string,
  task: () => Promise<unknown>,
  runtime: EdgeRuntimeLike | undefined = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime,
  log: (...args: unknown[]) => void = console.log,
): Promise<unknown> {
  let promise: Promise<unknown>;
  try {
    promise = task().catch((err) => log(`${label}:`, err));
  } catch (err) {
    // Uma tarefa que rebenta antes de devolver a promessa também não pode partir a resposta.
    log(`${label}:`, err);
    promise = Promise.resolve();
  }
  runtime?.waitUntil?.(promise);
  return promise;
}
