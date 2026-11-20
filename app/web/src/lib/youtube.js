// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Links do YouTube: ler o endereço que a equipa cola no painel e tirar dele o que o site
 * precisa — o identificador do vídeo, o endereço para abrir no YouTube, o endereço de
 * incorporação e a miniatura.
 *
 * Porque é que isto não é um `<iframe src={o-que-a-equipa-colou}>`:
 *
 * - **O endereço vem da base de dados.** Quem tem permissão de catálogo escreve-o pela API,
 *   sem passar pelo formulário. Um `src` vindo de lá, sem verificação, aceitava
 *   `javascript:`, `data:` ou um site qualquer dentro de uma moldura na nossa página. Aqui só
 *   sai um endereço que esta função construiu, com um identificador de 11 caracteres que
 *   passou pela expressão regular — nunca o texto original.
 * - **Incorpora-se por `youtube-nocookie.com`**, que não escreve cookies de publicidade antes
 *   de alguém carregar em "play". O domínio normal escreve-os só por a página existir, o que
 *   obrigaria a um aviso de cookies que a loja não tem.
 * - **A moldura só entra na página quando se carrega na miniatura** (ver
 *   `components/ProductVideo.jsx`). Um `iframe` do YouTube custa mais de 500 KB e vários
 *   pedidos a servidores da Google; posto logo, pagava-o quem nunca vê o vídeo — e, com
 *   ligações móveis a pagar por MB, isso é dinheiro do visitante.
 *
 * O CSP tem de deixar entrar `https://www.youtube-nocookie.com` em `frame-src`
 * (`app/web/public/_headers`); sem isso o navegador bloqueia a moldura em silêncio.
 */

/** Identificador de vídeo do YouTube: 11 caracteres, letras, dígitos, `-` e `_`. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

/** Caminhos que levam o id no próprio caminho: /embed/ID, /shorts/ID, /live/ID, /v/ID. */
const PATH_PREFIXES = ['/embed/', '/shorts/', '/live/', '/v/'];

/**
 * O id do vídeo neste endereço, ou `''`.
 *
 * Aceita também um id escrito sozinho — é o que acontece quando alguém copia só o código em
 * vez do endereço completo.
 */
export function youtubeId(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (ID_RE.test(raw)) return raw;

  let url;
  try {
    // Sem esquema (`youtu.be/abc`) o `URL` falha; assume-se https, como faria o navegador.
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return '';
  }
  // Só http(s): fecha `javascript:`, `data:` e tudo o que não é um endereço web.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (!HOSTS.has(url.hostname.toLowerCase())) return '';

  if (url.hostname.toLowerCase().endsWith('youtu.be')) {
    const candidato = url.pathname.slice(1).split('/')[0];
    return ID_RE.test(candidato) ? candidato : '';
  }

  const v = url.searchParams.get('v') || '';
  if (ID_RE.test(v)) return v;

  for (const prefixo of PATH_PREFIXES) {
    if (url.pathname.startsWith(prefixo)) {
      const candidato = url.pathname.slice(prefixo.length).split('/')[0];
      if (ID_RE.test(candidato)) return candidato;
    }
  }
  return '';
}

/** O endereço aponta para um vídeo do YouTube que se consegue mostrar? */
export const isYoutubeUrl = (input) => youtubeId(input) !== '';

/**
 * Segundo em que o vídeo começa, lido do `?t=` ou `#t=` (`90`, `90s`, `1m30s`, `1h2m3s`).
 * Zero quando não há ou não se entende.
 */
export function youtubeStartSeconds(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return 0;
  let valor = '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    valor = url.searchParams.get('t') || url.searchParams.get('start') || url.hash.replace(/^#t=/, '') || '';
  } catch {
    return 0;
  }
  if (!valor) return 0;
  if (/^\d+$/.test(valor)) return Math.min(Number(valor), 86_400);
  const m = valor.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  const segundos = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return Math.min(segundos, 86_400);
}

/**
 * O vídeo em forma utilizável, ou `null` se o endereço não serve.
 *
 * `embed` já traz os parâmetros todos: começa a tocar (porque só é criado depois de alguém
 * carregar em "play"), não sugere vídeos de outros canais no fim (`rel=0`) e não mostra a
 * ligação para o YouTube no título (`modestbranding=1`).
 */
export function parseYoutube(input) {
  const id = youtubeId(input);
  if (!id) return null;
  const start = youtubeStartSeconds(input);
  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (start > 0) params.set('start', String(start));
  return {
    id,
    watchUrl: `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}` : ''}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
    autoplayUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}&autoplay=1`,
    // `hqdefault` existe em todos os vídeos; `maxresdefault` falta nos antigos e dava uma
    // imagem partida no lugar do botão de "play".
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/**
 * O que gravar na base de dados: o endereço limpo e canónico, ou `''`.
 *
 * Guarda-se o endereço do YouTube e não só o id, para quem abrir a linha na base de dados ou
 * exportar o catálogo perceber o que ali está. Os parâmetros de campanha e de lista que vêm
 * no "copiar link" (`si=`, `list=`, `pp=`) ficam de fora: não dizem nada sobre o vídeo e
 * seguem a pessoa que carrega.
 */
export function sanitizeYoutubeUrl(input) {
  const video = parseYoutube(input);
  return video ? video.watchUrl : '';
}
