// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Abrir os ecrãs do KanGest a partir do painel pelo servidor da loja (pedido do dono a 27/11, «pelo servidor da loja»):
// o modo web do KanGest servidor (http://IP-DA-LOJA:7799), em vez da ligação kangest://, que o navegador pergunta
// sempre. Só as rotas permitidas, as mesmas das ligações kangest:// (app/kangest-sistema/src-tauri/src/ligacoes.rs);
// o KanGest confere-as outra vez (src/lib/ligacoesWeb.ts) e pede a entrada, como sempre.

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const FILTROS = ['por_confirmar', 'em_curso', 'levantamentos', 'concluidas', 'canceladas'];

/** O endereço escrito à mão no painel: http(s), um IP ou um nome da rede da loja e a porta (a regra da base). */
export const enderecoManualValido = (v) => /^https?:\/\/[A-Za-z0-9.-]{1,80}(:[0-9]{1,5})?$/.test(String(v || '').trim().replace(/\/+$/, ''));

/** O ecrã da encomenda na Loja online do KanGest (ou a Loja online, se o id não servir). */
export const destinoDaEncomenda = (id) => (ID.test(String(id || '')) ? `/loja-online?encomenda=${id}` : '/loja-online');

/** A Loja online filtrada (só os filtros que o KanGest conhece). */
export const destinoDaLoja = (filtro) => (FILTROS.includes(filtro) ? `/loja-online?filtro=${filtro}` : '/loja-online');

/** A ligação pelo servidor da loja: o modo web com a rota no endereço, marcada como vinda do site. */
export function ligacaoPeloServidor(endereco, destino) {
  const base = String(endereco || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) return '';
  return `${base}/#${destino}${destino.includes('?') ? '&' : '?'}origem=site`;
}

/** A ligação kangest:// para o programa deste computador (o recurso quando a loja não tem o servidor). */
export function ligacaoDoPrograma(destino) {
  const m = /^\/loja-online\?encomenda=([A-Za-z0-9_-]{1,64})$/.exec(destino);
  if (m) return `kangest://loja-online/encomenda/${m[1]}`;
  const f = /^\/loja-online\?filtro=([a-z_]+)$/.exec(destino);
  if (f) return `kangest://loja-online?filtro=${f[1]}`;
  return 'kangest://loja-online';
}

/**
 * O posto por onde abrir: o que emite as encomendas da loja da encomenda; senão, um que emita encomendas; senão, o da
 * loja; senão, o primeiro. A loja vem pelo id ou pelo nome (as encomendas guardam o nome da loja de levantamento). Sem
 * postos com endereço, `null`.
 */
export function postoParaAbrir(postos, loja) {
  const l = (postos || []).filter((p) => p?.endereco);
  if (!l.length) return null;
  const alvo = String(loja || '').trim().toLowerCase();
  const daLoja = (p) => !!alvo && (p.store_id === loja || String(p.loja || '').trim().toLowerCase() === alvo);
  return l.find((p) => p.emitir_encomendas && daLoja(p))
    || l.find((p) => p.emitir_encomendas)
    || l.find(daLoja)
    || l[0];
}
