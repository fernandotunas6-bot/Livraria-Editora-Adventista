// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

const escapar = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A folha de cada formato: o talão sem margens e da largura do papel; o A4 com as margens do KanGest. */
export const PAGINAS = {
  talao: '@page { size: 80mm auto; margin: 0 } body { width: 80mm }',
  a4: '@page { size: A4; margin: 10mm }',
};

/**
 * Imprime só um elemento da página (um documento do KanGest), num quadro escondido com os estilos do site, para a
 * impressora receber o papel certo (o talão de 80 mm ou o A4) e não o painel à volta. O título é o nome do ficheiro
 * quando se guarda como PDF. Devolve false se o navegador não deixar (sem quadros).
 */
export function imprimirElemento(el, { titulo = '', pagina = PAGINAS.a4 } = {}) {
  if (!el || typeof document === 'undefined') return false;
  const quadro = document.createElement('iframe');
  quadro.setAttribute('aria-hidden', 'true');
  quadro.setAttribute('tabindex', '-1');
  Object.assign(quadro.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(quadro);
  const doc = quadro.contentDocument;
  const janela = quadro.contentWindow;
  if (!doc || !janela) {
    quadro.remove();
    return false;
  }
  const estilos = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('');
  doc.open();
  doc.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>${estilos}`
    + `<style>${pagina} html, body { background: #fff !important; margin: 0; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style>`
    + `</head><body>${el.outerHTML}</body></html>`);
  doc.close();
  let feito = false;
  const imprimir = () => {
    if (feito) return;
    feito = true;
    try {
      janela.focus();
      janela.print();
    } finally {
      // o print() espera pelo diálogo na maior parte dos navegadores; o quadro sai depois
      setTimeout(() => quadro.remove(), 1500);
    }
  };
  // os estilos e o logótipo têm de estar carregados antes de imprimir
  if (doc.readyState === 'complete') setTimeout(imprimir, 300);
  else janela.addEventListener('load', () => setTimeout(imprimir, 100), { once: true });
  setTimeout(imprimir, 3000);
  return true;
}
