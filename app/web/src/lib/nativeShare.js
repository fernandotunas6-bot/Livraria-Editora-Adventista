// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Partilhar com a folha do próprio sistema (WhatsApp, Facebook, SMS, copiar…), como nas lojas
// e redes sociais no telemóvel. Onde não existe (a maioria dos computadores), quem chama
// decide a alternativa: copiar a ligação ou abrir o WhatsApp. Dentro do app iOS (lib/nativeApp.js)
// usa-se a folha nativa do plugin Share: a do WKWebView nem sempre existe.

import { eAppNativa, pluginShare } from '@/lib/nativeApp';

export const canNativeShare = () => eAppNativa()
  || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/** O plugin recusa com «Share canceled» quando a pessoa fecha a folha. */
const foiCancelada = (error) => error?.name === 'AbortError' || /cancel/i.test(String(error?.message || ''));

/**
 * Abre a folha de partilha. Devolve 'shared', 'cancelled' (a pessoa fechou a folha: não se
 * faz mais nada) ou 'unsupported' (sem folha, ou o navegador recusou: usar a alternativa).
 */
export async function nativeShare({ title, text, url }) {
  if (!canNativeShare()) return 'unsupported';
  const share = await pluginShare();
  try {
    if (share) await share.share({ title, text, url, dialogTitle: title });
    else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') await navigator.share({ title, text, url });
    else return 'unsupported';
    return 'shared';
  } catch (error) {
    return foiCancelada(error) ? 'cancelled' : 'unsupported';
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
