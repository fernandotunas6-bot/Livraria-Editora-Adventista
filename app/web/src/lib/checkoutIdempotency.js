// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Chave de idempotência do checkout.
//
// Se a rede cai depois de o servidor gravar a encomenda, o cliente vê um erro e carrega outra
// vez. Com a mesma chave, o servidor devolve a encomenda que já existe em vez de criar outra
// (e de descontar o stock duas vezes). A chave mantém-se enquanto o pedido for o mesmo; se o
// cliente mudar o carrinho, a morada ou o pagamento, é outra compra e leva chave nova.
// A assinatura fica de fora da comparação: voltar a assinar não faz da compra outra compra.

const newKey = () =>
  (globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

/** Representação estável do pedido (chaves ordenadas), sem a assinatura. */
export function checkoutFingerprint(payload) {
  const { checkoutSignature: _ignored, ...rest } = payload || {};
  const stable = (value) => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
    }
    return value;
  };
  return JSON.stringify(stable(rest));
}

/**
 * Devolve a tentativa a usar: a anterior, se o pedido for o mesmo, ou uma nova.
 * @param {{fingerprint: string, key: string} | null} previous
 */
export function nextCheckoutAttempt(previous, payload) {
  const fingerprint = checkoutFingerprint(payload);
  if (previous && previous.fingerprint === fingerprint) return previous;
  return { fingerprint, key: newKey() };
}
