// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Vídeos de fundo (slides da página inicial e hero da loja): o que a etiqueta `<video>` sabe
 * tocar e o que não sabe.
 *
 * Os campos do painel dizem "URL do Vídeo (MP4/WebM)" e o site põe esse endereço num
 * `<video src=…>`. Quem tem o vídeo da livraria no YouTube — que é o caso normal — cola lá o
 * link do YouTube, e o `<video>` não o toca: fica a imagem *poster* se houver, ou um
 * rectângulo preto. Sem erro na consola, sem aviso no painel, sem nada que diga porquê.
 *
 * Aqui só se recusa o que de certeza não funciona: endereços de plataformas que só servem
 * vídeo por incorporação. Tudo o resto passa — um CDN pode servir um ficheiro sem extensão
 * no endereço, e uma lista fechada de extensões recusaria endereços que funcionam hoje.
 *
 * Um vídeo do YouTube tem o seu lugar no site: a ficha do produto (`lib/youtube.js`), onde a
 * moldura é a forma certa e só carrega quando alguém a abre. O que não se faz é pô-lo a
 * tocar sozinho, em ciclo e sem som, por trás de um título — meio megabyte e vários pedidos
 * à Google só para servir de papel de parede.
 */

/** Plataformas que só dão o vídeo por incorporação; um `<video src>` nunca as toca. */
const SO_INCORPORACAO = [
  { teste: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i, nome: 'YouTube' },
  { teste: /(^|\.)(vimeo\.com|player\.vimeo\.com)$/i, nome: 'Vimeo' },
  { teste: /(^|\.)(dailymotion\.com|dai\.ly)$/i, nome: 'Dailymotion' },
  { teste: /(^|\.)(facebook\.com|fb\.watch)$/i, nome: 'Facebook' },
  { teste: /(^|\.)(instagram\.com)$/i, nome: 'Instagram' },
  { teste: /(^|\.)(tiktok\.com)$/i, nome: 'TikTok' },
  { teste: /(^|\.)(drive\.google\.com)$/i, nome: 'Google Drive' },
];

/**
 * O nome da plataforma, quando o endereço é de uma que só serve vídeo por incorporação.
 * `''` quando o endereço serve (ou quando está vazio).
 */
export function embedOnlyVideoPlatform(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return '';
  }
  const host = url.hostname.toLowerCase();
  return SO_INCORPORACAO.find((p) => p.teste.test(host))?.nome || '';
}

/**
 * O endereço a pôr no `<video src>`, ou `''` para o site mostrar a imagem.
 *
 * Aceita caminhos do próprio site (os ficheiros do Storage chegam assim depois do
 * `toSiteRelativeUrl`) e endereços `http(s)`. Recusa as plataformas de incorporação e
 * qualquer outro esquema — um `javascript:` ou `data:` num `src` de vídeo não executa, mas
 * também não serve para nada e não tem de chegar ao HTML.
 */
export function playableVideoUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return /^\/[/\\]/.test(raw) ? '' : raw;
  if (embedOnlyVideoPlatform(raw)) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? raw : '';
  } catch {
    return '';
  }
}
