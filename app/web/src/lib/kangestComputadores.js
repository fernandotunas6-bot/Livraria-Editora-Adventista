// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * O estado do computador de cada posto do KanGest (kangest_postos.estado_computador, que o KanGest manda em cada volta:
 * app/kangest-sistema/src-tauri/src/sinc/estado.rs) lido para o painel: o resumo e o que precisa de atenção.
 */

const GB = 1024 ** 3;
const MB = 1024 ** 2;
/** O espaço que a próxima cópia de segurança precisa (a mesma conta do KanGest: a base, mais um décimo, mais 200 MB). */
export const espacoParaCopia = (base) => base * 1.1 + 200 * MB;
/** Sem notícias do posto há mais do que isto, com ele activo: o KanGest está fechado ou sem Internet. */
export const SEM_CONTACTO_MIN = 30;

export function tamanho(b) {
  if (b == null) return '—';
  return b >= GB ? `${(b / GB).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(b / MB))} MB`;
}

/**
 * Os problemas do computador de um posto, do mais grave para o menos: `{ grave: bool, texto }`. Um posto sem estado
 * (versão antiga do KanGest, ou nunca sincronizou) não tem problemas aqui: o painel diz só que ainda não há estado.
 */
export function problemasDoComputador(p, agora = Date.now()) {
  const e = p?.estado_computador || {};
  const v = [];
  if (p?.estado === 'activo' && p?.estado_em) {
    const min = (agora - new Date(p.estado_em).getTime()) / 60000;
    if (min > SEM_CONTACTO_MIN) {
      v.push({ grave: min > 24 * 60, texto: min > 24 * 60 ? `Sem contacto há ${Math.floor(min / 1440)} dia(s)` : `Sem contacto há ${Math.round(min / 60) || 1} h` });
    }
  }
  if (e.espaco_livre != null && e.base_bytes != null && e.espaco_livre < espacoParaCopia(e.base_bytes)) {
    v.push({ grave: true, texto: `Disco quase cheio (${tamanho(e.espaco_livre)} livres)` });
  }
  if (e.verificacao === 'graves') v.push({ grave: true, texto: 'A verificação da base encontrou problemas graves' });
  if (e.fe_rejeitados > 0) v.push({ grave: true, texto: `${e.fe_rejeitados} documento(s) rejeitado(s) pela AGT` });
  if (Object.keys(e).length > 0) {
    if (!e.ultima_copia) v.push({ grave: false, texto: 'Ainda sem cópias de segurança' });
    else if (agora - new Date(e.ultima_copia).getTime() > 2 * 86400000) {
      v.push({ grave: false, texto: `Última cópia há ${Math.floor((agora - new Date(e.ultima_copia).getTime()) / 86400000)} dias` });
    }
  }
  if (e.copia_externa_erro) v.push({ grave: false, texto: 'A cópia externa (pen, OneDrive) falhou' });
  if (e.verificacao === 'avisos') v.push({ grave: false, texto: 'A verificação da base deixou avisos' });
  if (e.por_enviar > 20) v.push({ grave: false, texto: `${e.por_enviar} documento(s) por enviar ao site` });
  return v.sort((a, b) => Number(b.grave) - Number(a.grave));
}
