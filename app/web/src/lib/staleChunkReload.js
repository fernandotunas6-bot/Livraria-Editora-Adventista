// Depois de cada publicação, os ficheiros do site com o hash antigo (/assets/Página-ab12cd34.js)
// deixam de existir, e o Cloudflare Pages responde a esses endereços com o index.html (200,
// text/html; verificado a 2026-11-07). Quem tinha o site aberto e mudava de página pedia o
// ficheiro antigo, recebia "Failed to fetch dynamically imported module" e ficava no ecrã
// "Algo correu mal" — com publicações várias vezes por dia, isto apanha clientes reais.
//
// O Vite avisa com o evento `vite:preloadError`. Recarrega-se a página uma vez, o que vai
// buscar o index.html novo e os ficheiros da versão nova. Se voltar a falhar no minuto
// seguinte (sem rede, por exemplo), deixa-se o erro seguir para o ecrã de erro em vez de
// recarregar em ciclo — e sem `sessionStorage` (bloqueado) nunca se recarrega sozinho, pela
// mesma razão.

const KEY = 'livraria:recarregou-por-versao-nova';
const WINDOW_MS = 60_000;

/** Pode recarregar agora? Não, se já o fez há menos de um minuto. */
export function shouldReload(now, lastReloadAt) {
  return !(lastReloadAt > 0 && now - lastReloadAt < WINDOW_MS);
}

export function installStaleChunkReload(win = window, now = () => Date.now()) {
  win.addEventListener('vite:preloadError', (event) => {
    let last;
    try {
      last = Number(win.sessionStorage.getItem(KEY)) || 0;
      if (!shouldReload(now(), last)) return;
      win.sessionStorage.setItem(KEY, String(now()));
    } catch {
      return; // sem onde guardar que já recarregou: melhor o ecrã de erro do que um ciclo
    }
    event.preventDefault();
    win.location.reload();
  });
}
