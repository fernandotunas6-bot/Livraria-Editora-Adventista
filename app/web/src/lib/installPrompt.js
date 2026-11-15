// Quando mostrar o aviso "Instalar App" (PwaInstallBanner).
//
// Aparecia mal a página abria, em todas as páginas: no telemóvel tapava o chat e o conteúdo,
// e na ficha do livro, no desktop, tapava o segundo botão de compra. Passa a esperar por
// interesse (deslizar um pouco ou ficar uns segundos) e nunca aparece onde se compra ou se
// faz uma tarefa.

export const ENGAGE_SCROLL_PX = 600;
export const ENGAGE_AFTER_MS = 20000;

const HIDDEN = [/^\/product\//, /^\/success/, /^\/admin/, /^\/painel/, /^\/login/, /^\/forgot-password/, /^\/reset-password/, /^\/unsubscribe/, /^\/cancelar-subscricao/];

export function installPromptAllowed(pathname = '/') {
  return !HIDDEN.some((re) => re.test(pathname));
}

/**
 * Na página inicial, o topo é do banner de destaques. Com o aviso à vista, o chat sobe por
 * cima dele e caía na seta «anterior» do banner — num iPhone SE, no próprio botão do slide.
 * Subir a fila do banner também não dá: num ecrã pequeno não há altura para o texto, a fila,
 * o chat, o aviso e a barra de baixo. Por isso o aviso espera que a pessoa desça um pouco e
 * sai outra vez quando ela volta ao topo. A fila deixa de tocar o chat aos ~60 px; 160 dão folga.
 */
export const HOME_TOP_PX = 160;

export function installPromptCoversHero(pathname, scrollY) {
  return pathname === '/' && scrollY < HOME_TOP_PX;
}

/**
 * Variáveis de CSS com a altura do aviso, para os flutuantes se afastarem dele.
 * No telemóvel o aviso ocupa a largura toda: sobem os dois cantos (chat e botão de subir).
 * A partir de 640 px fica só no canto direito: sobe só o botão de subir.
 */
export function installPromptOffsets(height, viewportWidth) {
  const h = Math.max(0, Math.round(height || 0));
  if (!h) return { full: '0px', right: '0px' };
  return viewportWidth < 640 ? { full: `${h}px`, right: '0px' } : { full: '0px', right: `${h}px` };
}

/**
 * Fechar o aviso «Instalar App» adia-o por uns dias; antes era para sempre, e quem o fechava
 * uma vez nunca mais sabia que a app existia. (O menu do telemóvel tem sempre «Instalar a app».)
 * O valor antigo, '1', conta como fechado há muito tempo: o aviso volta a aparecer uma vez.
 */
export const AVISO_ADIADO_DIAS = 14;
const CHAVE_AVISO = 'pwa-dismissed';

export function avisoFechado(agora = Date.now(), storage = globalThis.localStorage) {
  try {
    const v = Number(storage?.getItem(CHAVE_AVISO));
    if (!v || v < 1e12) return false;
    return agora - v < AVISO_ADIADO_DIAS * 86_400_000;
  } catch {
    return false;
  }
}

export function fecharAviso(agora = Date.now(), storage = globalThis.localStorage) {
  try { storage?.setItem(CHAVE_AVISO, String(agora)); } catch { /* sem armazenamento: só nesta visita */ }
}
