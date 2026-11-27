// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// O retorno da entrada com o Google no KanGest (index.html, ao lado). O Auth do site acrescenta o código (`code`) ou o
// erro ao endereço desta página, que já traz o estado da entrada (`e`); tudo segue para o KanGest pela ligação
// kangest://auth. O KanGest só aceita um estado que ele próprio gerou, e troca o código com o seu verificador do PKCE.

/** A ligação kangest://auth para o retorno, ou `null` quando o endereço não é de uma entrada do KanGest. */
export function destinoDoKanGest(search, hash) {
  const q = new URLSearchParams(search || '');
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const tirar = (k) => q.get(k) ?? h.get(k) ?? '';
  const estado = tirar('e');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(estado)) return null;
  const p = new URLSearchParams({ e: estado });
  const code = tirar('code');
  if (/^[A-Za-z0-9._-]{1,200}$/.test(code)) {
    p.set('code', code);
  } else {
    const erro = (tirar('error_description') || tirar('error')).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
    p.set('erro', erro || 'O Google não devolveu a entrada.');
  }
  return `kangest://auth?${p.toString()}`;
}

function correr() {
  const destino = destinoDoKanGest(window.location.search, window.location.hash);
  const texto = document.getElementById('texto');
  const botao = document.getElementById('abrir');
  // o código não fica no endereço nem no histórico desta página
  window.history.replaceState(null, '', window.location.pathname);
  if (!destino) {
    texto.textContent = 'Esta página só serve para voltar ao KanGest depois de entrar com o Google. Comece a entrada no próprio KanGest.';
    botao.hidden = true;
    return;
  }
  botao.href = destino;
  window.location.href = destino;
}

if (typeof document !== 'undefined' && document.getElementById('kangest-entrar')) correr();
