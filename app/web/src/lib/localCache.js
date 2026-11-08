// Guardar no navegador respostas públicas (configurações do site, integrações activas) para quem
// volta ao site as ter logo, sem esperar pela Edge Function (~2 s a partir de Angola), e pedir a
// versão nova por trás. A cache HTTP já faz isto durante 5 minutos (stale-while-revalidate do
// servidor); aqui vale dias. Só dados públicos: nunca segredos nem nada da conta.
//
// Sem armazenamento (navegação privada bloqueada), lê-se `null` e tudo funciona como antes.

const PREFIX = 'livraria:cache:';

/** O valor guardado em `key`, se tiver menos de `maxAgeMs`; senão null. */
export function readCache(key, maxAgeMs) {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (!at || Date.now() - at > maxAgeMs || data == null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // cheio ou sem armazenamento: fica só a resposta em memória
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;
