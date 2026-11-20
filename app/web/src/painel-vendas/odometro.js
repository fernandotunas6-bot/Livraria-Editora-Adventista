// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Os algarismos de um valor a rodar até ao número, como num contador mecânico ou numa máquina de
 * calcular: cada algarismo é uma fita de 0 a 9 que sobe; os da esquerda param primeiro e os da
 * direita dão mais voltas. O resto (espaços, vírgula, «Kz», «+», «%») fica parado. No fim, o
 * elemento fica só com o texto, como se tivesse sido escrito.
 *
 * Os estilos são .odo, .odo-d, .odo-f e .odo-c (painel.css): a fita tem uma linha de 1,15 em por
 * algarismo, e o valor tem de ter algarismos de largura igual (tabular-nums).
 */

const ALTURA = 1.15; // em: a altura de cada algarismo na fita (igual ao line-height em painel.css)

/**
 * Põe `texto` em `e` a rodar durante `dur` ms, a começar daqui a `atraso` ms. Com `reduce` (ou sem
 * algarismos), escreve logo o texto. Devolve o temporizador do fim (ou null).
 */
export function rolar(e, texto, { dur = 1000, atraso = 0, reduce = false } = {}) {
  const t = String(texto ?? '');
  const total = [...t].filter((c) => c >= '0' && c <= '9').length;
  if (reduce || !total) { e.textContent = t; return null; }
  const doc = e.ownerDocument;
  const span = (cls, txt) => { const s = doc.createElement('span'); s.className = cls; if (txt != null) s.textContent = txt; return s; };
  // O texto inteiro para os leitores de ecrã; as fitas são só para os olhos.
  const leitor = span('odo-sr', t);
  const wrap = span('odo');
  wrap.setAttribute('aria-hidden', 'true');
  const fitas = [];
  let k = 0;
  for (const c of t) {
    if (!(c >= '0' && c <= '9')) { wrap.appendChild(span('odo-c', c)); continue; }
    // 1 volta no primeiro algarismo, 3 no último: a direita gira mais, como num conta-quilómetros.
    const voltas = 1 + Math.round((k / Math.max(1, total - 1)) * 2);
    const alvo = voltas * 10 + Number(c);
    const fita = span('odo-f', Array.from({ length: alvo + 1 }, (_, i) => i % 10).join('\n'));
    const d = Math.round(dur * (0.6 + 0.4 * ((k + 1) / total)));
    fita.style.transition = `transform ${d}ms cubic-bezier(.2,.8,.25,1) ${Math.max(0, atraso)}ms`;
    const caixa = span('odo-d');
    caixa.appendChild(fita);
    wrap.appendChild(caixa);
    fitas.push([fita, alvo]);
    k += 1;
  }
  e.replaceChildren(leitor, wrap);
  const view = doc.defaultView;
  const raf = (view && view.requestAnimationFrame) ? view.requestAnimationFrame.bind(view) : (fn) => setTimeout(fn, 16);
  // Dois quadros: no primeiro a fita está no 0; no segundo começa a subir.
  raf(() => raf(() => { for (const [f, alvo] of fitas) f.style.transform = `translateY(${-(alvo * ALTURA).toFixed(3)}em)`; }));
  return setTimeout(() => { if (e.contains(wrap)) e.textContent = t; }, Math.max(0, atraso) + dur + 80);
}
