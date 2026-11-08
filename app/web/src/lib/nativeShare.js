// Partilhar com a folha do próprio sistema (WhatsApp, Facebook, SMS, copiar…), como nas lojas
// e redes sociais no telemóvel. Onde não existe (a maioria dos computadores), quem chama
// decide a alternativa: copiar a ligação ou abrir o WhatsApp.

export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/**
 * Abre a folha de partilha. Devolve 'shared', 'cancelled' (a pessoa fechou a folha: não se
 * faz mais nada) ou 'unsupported' (sem folha, ou o navegador recusou: usar a alternativa).
 */
export async function nativeShare({ title, text, url }) {
  if (!canNativeShare()) return 'unsupported';
  try {
    await navigator.share({ title, text, url });
    return 'shared';
  } catch (error) {
    return error?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/** Copia para a área de transferência. Devolve `true` se conseguiu. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
