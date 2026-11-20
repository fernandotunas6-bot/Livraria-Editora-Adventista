// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * A barra «Filtros» dos relatórios (painel de cada loja e relatório conjunto), por baixo do topo.
 * Guarda a escolha no browser (por ecrã) e chama `onChange(filtro)` quando muda. As contas estão
 * em filtros.js.
 *
 * montarFiltros(root, { chave, lojas, ultimo, onChange }) →
 *   { filtro() — o filtro actual, actualizar() — refaz as lojas e o resumo, desmontar() }
 * `lojas()` = [{ id, nome }] (só no conjunto); `ultimo()` = o índice do último mês registado.
 */
import { MESES } from './modelo.js';
import { PERIODOS, filtroActivo, normalizarFiltro, rotuloFiltro } from './filtros.js';

const ler = (chave) => {
  try { return normalizarFiltro(JSON.parse(localStorage.getItem(chave) || 'null')); } catch { return normalizarFiltro(null); }
};
const gravar = (chave, f) => {
  try { localStorage.setItem(chave, JSON.stringify(f)); } catch { /* sem armazenamento: fica só nesta visita */ }
};

export function montarFiltros(root, { chave, lojas = null, ultimo = () => 11, onChange }) {
  const $ = (id) => root.getElementById(id);
  const box = $('filtros');
  if (!box) return { filtro: () => normalizarFiltro(null), actualizar() {}, desmontar() {} };
  let f = ler(chave);
  const selP = $('f-periodo');
  const selDe = $('f-de');
  const selAte = $('f-ate');
  const chk = $('f-fech');
  const caixaLojas = $('f-lojas');
  selP.replaceChildren(...Object.entries(PERIODOS).map(([v, t]) => new Option(t, v)));
  [selDe, selAte].forEach((s) => s.replaceChildren(...MESES.map((m, i) => new Option(m, String(i)))));

  const nLojas = () => (lojas ? lojas().length : null);
  function pintar() {
    selP.value = f.periodo;
    selDe.value = String(f.de);
    selAte.value = String(f.ate);
    chk.checked = f.soFechados;
    $('f-pers').hidden = f.periodo !== 'pers';
    if (caixaLojas && lojas) {
      const lista = lojas();
      caixaLojas.hidden = lista.length < 2;
      caixaLojas.replaceChildren(...lista.map((l) => {
        const lab = root.ownerDocument.createElement('label');
        lab.className = 'f-loja';
        const c = root.ownerDocument.createElement('input');
        c.type = 'checkbox';
        c.value = l.id;
        c.checked = f.lojas == null || f.lojas.includes(l.id);
        if (l.cor) lab.style.setProperty('--cor', l.cor);
        lab.append(c, root.ownerDocument.createTextNode(l.nome));
        return lab;
      }));
    }
    const activo = filtroActivo(f, nLojas());
    $('f-limpar').hidden = !activo;
    box.classList.toggle('on', activo);
    const txt = rotuloFiltro(f, { ultimo: ultimo(), nLojas: nLojas() });
    $('f-resumo').textContent = activo ? 'A mostrar: ' + txt + '. Os meses fora do filtro ficam esbatidos; o acumulado do ano continua inteiro.' : '';
  }
  function mudar(novo) {
    f = normalizarFiltro(novo);
    gravar(chave, f);
    pintar();
    onChange && onChange(f);
  }
  const offs = [];
  const on = (el, ev, fn) => { el.addEventListener(ev, fn); offs.push(() => el.removeEventListener(ev, fn)); };
  on(selP, 'change', () => mudar({ ...f, periodo: selP.value }));
  on(selDe, 'change', () => mudar({ ...f, de: Number(selDe.value) }));
  on(selAte, 'change', () => mudar({ ...f, ate: Number(selAte.value) }));
  on(chk, 'change', () => mudar({ ...f, soFechados: chk.checked }));
  on($('f-limpar'), 'click', () => mudar({ ...f, periodo: 'ano', soFechados: false, lojas: null }));
  if (caixaLojas) {
    on(caixaLojas, 'change', () => {
      const marcadas = [...caixaLojas.querySelectorAll('input:checked')].map((i) => i.value);
      const todas = lojas ? lojas().map((l) => l.id) : [];
      // Pelo menos uma loja; com todas marcadas, o filtro de lojas desliga-se (as novas entram).
      if (!marcadas.length) { pintar(); return; }
      mudar({ ...f, lojas: marcadas.length === todas.length ? null : marcadas });
    });
  }
  pintar();
  return {
    filtro: () => f,
    actualizar: pintar,
    desmontar: () => offs.forEach((o) => o()),
  };
}
