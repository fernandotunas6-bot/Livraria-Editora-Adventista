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
