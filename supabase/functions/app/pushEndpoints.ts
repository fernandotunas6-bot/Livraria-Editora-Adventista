// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Endereços de subscrição Web Push aceites em /push/subscribe.
//
// A rota é pública (os visitantes também recebem as novidades da app) e o servidor faz depois um
// POST para cada endereço guardado. Aceitar qualquer https deixava um visitante pôr o servidor a
// fazer pedidos para onde quisesse. Os navegadores só dão endereços dos serviços de push dos
// fabricantes: a lista é essa (Chrome, Edge antigo e Samsung pela Google; Firefox; Edge e Windows;
// Safari).

const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

/** `true` quando o endereço é https, sem credenciais nem porta, num serviço de push conhecido. */
export function isPushEndpoint(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (raw.length < 12 || raw.length > 1000 || /\s/.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
