/**
 * Limite de pedidos, sem nada de Deno nem de Supabase — por isso testável no `npm test`.
 *
 * São dois limites, não um. O que conta é o da base de dados (`check_rate_limit`, da
 * migração `limites_pedidos`), porque é partilhado por todas as instâncias: as Edge
 * Functions escalam e reciclam, e um contador em memória perde-se a cada arranque a frio —
 * não travava ninguém que tivesse paciência para esperar pelo próximo isolate.
 *
 * O da memória fica como recuo, para dois casos distintos que convém não confundir:
 *
 * - **a função não existe** (migração por aplicar): desiste de vez e não volta a tentar, para
 *   não pagar uma ida à base em cada pedido da loja até alguém reparar;
 * - **a base falhou agora** (rede, tempo esgotado): usa a memória *neste* pedido mas volta a
 *   tentar no seguinte, porque uma falha passageira não pode degradar a loja para sempre.
 *
 * Em qualquer dos casos a loja continua a funcionar: um limite fraco é melhor do que uma
 * caixa que não abre.
 */

export type RpcErro = { code?: string; message?: string } | null;
export type RpcResultado = { data: unknown; error: RpcErro };

/** A janela é de um minuto, igual à da função na base de dados. */
const JANELA_MS = 60000;

/**
 * O contador em memória desta instância.
 *
 * Guarda os instantes de cada pedido e descarta os que já saíram da janela. O relógio é
 * injectável para os testes poderem andar com o tempo para a frente sem esperar.
 */
export function createLocalRateLimit(now: () => number = Date.now) {
  const registo: Record<string, number[]> = {};
  return function permite(bucket: string, cliente: string, maxPorMinuto: number): boolean {
    const chave = `${bucket}:${cliente || "anon"}`;
    const agora = now();
    registo[chave] = (registo[chave] || []).filter((t) => agora - t < JANELA_MS);
    if (registo[chave].length >= maxPorMinuto) return false;
    registo[chave].push(agora);
    return true;
  };
}

/**
 * O erro diz que a função não existe — distinto de ter falhado a correr.
 *
 * O PostgREST responde `PGRST202` quando não a encontra; a mensagem é a segunda via, para o
 * caso de o código mudar entre versões.
 */
export const funcaoEmFalta = (error: RpcErro) =>
  error?.code === "PGRST202"
  || /could not find the function|does not exist/i.test(error?.message || "");

/**
 * O limite a sério: tenta a base de dados, e cai na memória quando não pode contar com ela.
 */
export function createRateLimit(opts: {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResultado>;
  now?: () => number;
  log?: (...args: unknown[]) => void;
}) {
  const local = createLocalRateLimit(opts.now);
  const log = opts.log || (() => {});
  let partilhadoDesligado = false;

  return async function permite(bucket: string, cliente: string, maxPorMinuto = 30): Promise<boolean> {
    if (!partilhadoDesligado) {
      const { data, error } = await opts.rpc("check_rate_limit", {
        p_bucket: bucket,
        p_client: cliente || "anon",
        p_max: maxPorMinuto,
      });
      // `data !== false` e não `data === true`: a função devolve booleano, mas um `null` por
      // uma razão qualquer não pode fechar a loja a toda a gente.
      if (!error) return data !== false;
      if (funcaoEmFalta(error)) {
        partilhadoDesligado = true;
        log("check_rate_limit em falta na base de dados; a usar o limite em memória.");
      } else {
        log("check_rate_limit:", error.message);
      }
    }
    return local(bucket, cliente, maxPorMinuto);
  };
}
