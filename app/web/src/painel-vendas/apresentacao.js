/**
 * Os controlos do modo apresentação, iguais nos dois relatórios (o painel de uma loja, painel.js,
 * e todas as livrarias, consolidado-ui.js): o palco de 1280×720 à escala do ecrã, os botões, o
 * teclado, o toque, o ecrã inteiro e a reprodução automática.
 *
 * Quem o usa dá só a lista dos diapositivos e a função que desenha cada um; o resto é daqui.
 * O HTML é o mesmo nos dois (#pres, #pres-view, #pres-timer, #pr-*, e o botão #btn-pres).
 *
 * montarApresentacao({ $, listen, reduce, lista, desenhar, aoAbrir })
 *  · lista() → os diapositivos (pedida ao abrir e em actualizar());
 *  · desenhar(s, item, { depois }) desenha o diapositivo `item` no elemento `s` (já com a classe
 *    .slide); `depois(fn, ms)` marca um passo da animação, cancelado ao mudar de diapositivo;
 *  · aoAbrir() corre antes de abrir (por exemplo, parar as animações do painel por baixo).
 */
import { cidadeDaLoja } from '@/lib/stores';

export function montarApresentacao({ $, listen, reduce = false, lista, desenhar, aoAbrir }) {
  const P = { idx: 0, list: [], playing: false, timer: null, raf: null, steps: [] };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function fit() {
    const v = $('pres-view'); const s = v.querySelector('.slide'); if (!s) return;
    const sc = Math.min(v.clientWidth / 1280, v.clientHeight / 720) * 0.96;
    s.style.transform = `translate(-50%, -50%) scale(${sc})`;
  }
  function limparPassos() { P.steps.forEach(clearTimeout); P.steps = []; }
  const depois = (fn, ms) => P.steps.push(setTimeout(fn, reduce ? 0 : ms));
  function contador() {
    const txt = (P.idx + 1) + ' / ' + P.list.length;
    $('pr-cnt').textContent = txt;
    $('pr-prog').style.width = ((P.idx + 1) / P.list.length * 100) + '%';
    const num = $('pres-view').querySelector('.s-num'); if (num) num.textContent = txt;
  }
  function mostrar(dir) {
    limparPassos();
    const view = $('pres-view');
    view.querySelectorAll('.slide').forEach((x) => x.remove());
    const s = el('div', 'slide enter' + (dir < 0 ? ' back' : ''));
    desenhar(s, P.list[P.idx], { depois });
    s.appendChild(el('div', 's-num', ''));
    view.appendChild(s);
    fit();
    contador();
    if (P.playing) correr();
  }
  function ir(k) {
    const n = Math.max(0, Math.min(P.list.length - 1, P.idx + k));
    if (n === P.idx) { if (P.playing && k > 0) tocar(false); return; }
    P.idx = n; mostrar(k);
  }
  function correr() {
    clearTimeout(P.timer); if (P.raf) cancelAnimationFrame(P.raf);
    const ms = Number($('pr-speed').value) || 8000; const t0 = performance.now(); const bar = $('pres-timer');
    const tick = (now) => { const t = Math.min(1, (now - t0) / ms); bar.style.width = t * 100 + '%'; if (t < 1 && P.playing) P.raf = requestAnimationFrame(tick); };
    P.raf = requestAnimationFrame(tick);
    P.timer = setTimeout(() => { if (!P.playing) return; if (P.idx >= P.list.length - 1) { tocar(false); return; } ir(1); }, ms);
  }
  function tocar(on) {
    P.playing = on; $('pr-play').textContent = on ? 'Pausar' : 'Reproduzir'; $('pr-play').classList.toggle('on', on);
    if (on) correr(); else { clearTimeout(P.timer); if (P.raf) cancelAnimationFrame(P.raf); $('pres-timer').style.width = '0'; }
  }
  const aberta = () => !$('pres').hidden;
  function abrir(inicio = 0) {
    const l = lista();
    if (!l || !l.length) return;
    if (aoAbrir) aoAbrir();
    P.list = l; P.idx = Math.max(0, Math.min(l.length - 1, inicio));
    $('pres').hidden = false; document.documentElement.style.overflow = 'hidden';
    mostrar(1);
    $('pr-next').focus();
  }
  function fechar() {
    tocar(false); limparPassos();
    $('pres').hidden = true; document.documentElement.style.overflow = '';
    $('pres-view').querySelectorAll('.slide').forEach((x) => x.remove());
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* sem ecrã inteiro */ }
    $('btn-pres').focus();
  }
  /**
   * A lista mudou com a apresentação aberta (chegaram os mais vendidos): fica o mesmo diapositivo
   * à vista, só o número e o total mudam. `mesmo(a, b)` diz se dois itens são o mesmo diapositivo.
   */
  function actualizar(mesmo = (a, b) => a.k === b.k && a.r === b.r && a.l === b.l) {
    if (!aberta()) return;
    const nova = lista();
    if (!nova || nova.length === P.list.length) return;
    const cur = P.list[P.idx];
    P.list = nova;
    const i = nova.findIndex((x) => mesmo(x, cur));
    P.idx = i < 0 ? Math.min(P.idx, nova.length - 1) : i;
    contador();
  }

  $('btn-pres').addEventListener('click', () => abrir(0));
  $('pr-next').addEventListener('click', () => ir(1));
  $('pr-prev').addEventListener('click', () => ir(-1));
  $('pr-play').addEventListener('click', () => tocar(!P.playing));
  $('pr-speed').addEventListener('change', () => { if (P.playing) correr(); });
  $('pr-close').addEventListener('click', fechar);
  $('pr-fs').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('pres').requestFullscreen(); } catch (e) { $('pr-fs').textContent = 'Ecrã inteiro indisponível'; $('pr-fs').disabled = true; }
  });
  listen(document, 'fullscreenchange', () => { $('pr-fs').textContent = document.fullscreenElement ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'; setTimeout(fit, 60); });
  let rz = null;
  listen(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (aberta()) fit(); }, 150); });
  $('pres-view').addEventListener('click', (e) => { const r = $('pres-view').getBoundingClientRect(); ir(e.clientX - r.left < r.width / 3 ? -1 : 1); });
  listen(document, 'keydown', (e) => {
    if (!aberta()) return;
    // Fora do Shadow DOM, e.target é o separador; o elemento real é o primeiro do composedPath().
    const tg = e.composedPath()[0];
    if (tg && tg.tagName === 'SELECT') return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); ir(1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); ir(-1); }
    else if (e.key === 'Home') { P.idx = 0; mostrar(-1); }
    else if (e.key === 'End') { P.idx = P.list.length - 1; mostrar(1); }
    else if (e.key === 'Escape' && !document.fullscreenElement) fechar();
    else if (e.key.toLowerCase() === 'f') $('pr-fs').click();
    else if (e.key.toLowerCase() === 'p') tocar(!P.playing);
  });
  let tx = null;
  $('pres-view').addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  $('pres-view').addEventListener('touchend', (e) => { if (tx == null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 40) { ir(d < 0 ? 1 : -1); e.preventDefault(); } tx = null; });

  return {
    abrir, fechar, actualizar, aberta, fit,
    desmontar() { tocar(false); limparPassos(); clearTimeout(rz); },
  };
}

/**
 * Uma fotografia a cobrir a caixa `caixa`, com zoom lento. Se a imagem não carregar, corre
 * `aoFalhar` (por omissão, a caixa sai).
 */
export function fotoEm(caixa, url, i = 0, aoFalhar = () => caixa.remove()) {
  const im = caixa.ownerDocument.createElement('img');
  im.className = 's-foto-im'; im.alt = ''; im.decoding = 'async'; im.src = url;
  im.style.animationDelay = -(i * 3) + 's';
  im.addEventListener('error', () => { im.remove(); aoFalhar(); }, { once: true });
  caixa.appendChild(im);
  return caixa;
}

/**
 * As fotografias de uma loja para os diapositivos: as da galeria (separador Lojas), só com endereço
 * do próprio site ou https, sem repetidas, até `n`. Aceita a loja com `fotos` ou com `gallery`.
 */
export function fotosDaLoja(store, n = 5) {
  const vistas = new Set();
  let bruta = (store && (store.fotos || store.gallery)) || [];
  if (typeof bruta === 'string') { try { bruta = JSON.parse(bruta); } catch (e) { bruta = []; } }
  if (!Array.isArray(bruta)) return [];
  return bruta
    .map((f) => (typeof f === 'string' ? { url: f, caption: '' } : { url: String((f && f.url) || ''), caption: String((f && f.caption) || '') }))
    .map((f) => ({ ...f, url: f.url.trim() }))
    .filter((f) => /^(\/(?!\/)|https:\/\/)/.test(f.url) && !vistas.has(f.url) && vistas.add(f.url))
    .slice(0, n);
}

// Terras que se dizem com artigo («do Huambo», «da Huíla»); as outras levam «de» («de Catumbela»,
// «de Benguela», «de Luanda»). Pela primeira palavra, sem acentos.
const COM_DO = new Set(['huambo', 'lubango', 'lobito', 'uige', 'namibe', 'sumbe', 'soyo', 'dundo', 'luena', 'cuito', 'kuito', 'bie']);
const COM_DA = new Set(['huila', 'lunda']);

/**
 * Como o rodapé e os diapositivos dizem a loja escolhida: «Loja do Huambo», «Loja do Lubango», «Loja de
 * Catumbela». Sem cidade no nome fica o próprio nome da loja; sem loja (antes da migração
 * painel_vendas_por_loja só havia a do Huambo), a do Huambo, como sempre foi.
 */
export function lojaDe(store) {
  if (!store) return 'Loja do Huambo';
  const cidade = cidadeDaLoja(store);
  if (!cidade) return String(store.name || '').trim() || 'Loja do Huambo';
  const k = cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]/)[0];
  return 'Loja ' + (COM_DA.has(k) ? 'da' : COM_DO.has(k) ? 'do' : 'de') + ' ' + cidade;
}
