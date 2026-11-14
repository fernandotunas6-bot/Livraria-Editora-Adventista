/**
 * Painel de Vendas da Loja do Huambo (pacote painel-vendas-huambo), igual à página autónoma do pacote.
 * mountPainel(root, api) desenha-o dentro de `root` (o Shadow DOM do separador do Painel Admin) e devolve a função que o desmonta.
 * `api` = { db, user, downloads }, a interface que o pacote esperava em window.claude.use() (ver adapter.js).
 */
import * as d3 from 'd3';
// O `.transition()` das selecções vem deste módulo, que o acrescenta ao `selection.prototype` só
// por ser importado. O pacote `d3` declara-se sem efeitos secundários (`sideEffects: false`), por
// isso o build de produção deixava-o de fora quando só se importava o `d3`: em produção cada
// `.transition()` dava «transition is not a function», e o painel parava a meio do primeiro
// desenho (sem o acumulado, o ganho mensal nem o quadro geral). Em desenvolvimento e nos testes
// funcionava, porque aí o código corre sem tree-shaking. O teste e2e/painel-vendas.spec.js monta o
// painel a partir do build para isto não voltar.
import 'd3-transition';
import { toCsv, buildXlsx, renderSummaryPng, printReport } from './exportar.js';
import { planoVideo, duracaoPlano, fmtDuracao } from './video.js';
import { abrirEstudio } from './estudio-video.js';
import { MESES, CRIT, buildYearModel, periodoAte } from './modelo.js';
import { capasParaFundo, pintarMaisVendidos, pintarParede } from './capas-de-fundo.js';
import { filtroActivo, mesesDoPeriodo, recortarModelo, rotuloFiltro } from './filtros.js';
import { montarFiltros } from './filtros-ui.js';
import { cidadeDaLoja } from '@/lib/stores';
import { avisosDePlausibilidade, textoDoAviso } from './plausibilidade.js';
import { fotoEm, fotosDaLoja, lojaDe, montarApresentacao } from './apresentacao.js';

export { cidadeDaLoja, fotosDaLoja, lojaDe };

/**
 * A sequência dos diapositivos: capa, a loja (se houver fotografias), o resumo, os mais vendidos
 * (se os houver), um por mês dentro do filtro, o quadro, o acumulado e a perspectiva.
 */
export function diapositivos(rows, { fotos = 0, maisVendidos = 0 } = {}) {
  return [{ k: 'capa' }]
    .concat(fotos ? [{ k: 'loja' }] : [], [{ k: 'resumo' }], maisVendidos ? [{ k: 'mv' }] : [])
    .concat((rows || []).filter((r) => !r.fora).map((r) => ({ k: 'mes', r })), [{ k: 'quadro' }, { k: 'acum' }, { k: 'persp' }]);
}

export function mountPainel(root, api) {
  const short = (m) => m.slice(0, 3);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C1 = '#9A9EA5', C2 = '#E0679A', POS = '#2F9E6E', NEG = '#D64545', TEAL = '#12898C';
  const $ = (id) => root.getElementById(id);
  // Ouvintes fora do Shadow DOM e subscrições dos dados, removidos ao desmontar.
  const offs = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };
  let dead = false;

  // ---------- Formatação ----------
  // Valores sempre com cêntimos: os totais mostrados têm de bater com a soma das linhas.
  const grp = (n) => {
    if (n == null || !isFinite(n)) return '—';
    const [i, d] = (Math.round(Math.abs(n) * 100) / 100).toFixed(2).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + d;
  };
  const kz = (n) => (n == null || !isFinite(n)) ? '—' : (n < 0 ? '−' : '') + grp(Math.abs(n)) + ' Kz';
  const kzs = (n) => (n == null || !isFinite(n)) ? '—' : (n >= 0 ? '+' : '−') + grp(Math.abs(n)) + ' Kz';
  const pct = (p) => (p == null || !isFinite(p)) ? '—' : (p >= 0 ? '+' : '−') + Math.abs(p * 100).toFixed(1).replace('.', ',') + '%';
  const mi = (n) => (n < 0 ? '−' : '') + (Math.abs(n) / 1e6).toFixed(1).replace('.', ',') + ' M';
  const mis = (n) => (n >= 0 ? '+' : '−') + (Math.abs(n) / 1e6).toFixed(1).replace('.', ',') + ' M';
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const inField = (n) => n == null ? '' : (Math.round(n * 100) / 100).toFixed(Number.isInteger(n) ? 0 : 2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function parseKz(s) {
    let t = String(s || '').trim().replace(/[\s  ]/g, '').replace(/kz$/i, '');
    if (!t) return { ok: true, v: null };
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const v = Number(t);
    return (isFinite(v) && v >= 0) ? { ok: true, v: Math.round(v * 100) / 100 } : { ok: false };
  }
  // Cada elemento tem uma contagem de cada vez: uma nova (ou um valor escrito sem animação)
  // cancela a anterior, que senão continuava a escrever por cima (ao mudar de filtro ou de mês).
  const contagens = new WeakMap();
  function countUp(e, to, fmt, dur, delay) {
    const id = {};
    contagens.set(e, id);
    if (reduce || !dur || to == null || !isFinite(to)) { e.textContent = fmt(to); return; }
    const t0 = performance.now() + (delay || 0);
    const tick = (now) => {
      if (!e.isConnected || contagens.get(e) !== id) return;
      const t = Math.min(1, Math.max(0, (now - t0) / dur));
      e.textContent = fmt(to * easeOut(t));
      if (t < 1) requestAnimationFrame(tick); else e.textContent = fmt(to);
    };
    requestAnimationFrame(tick);
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- Estado ----------
  const S = { db: null, user: null, uid: null, isOwner: false, canWrite: null, years: {}, note: null, cfg: undefined, hist: [], mv: null,
    ano: null, comp: null, model: null, sel: null, playing: false, timers: [], raf: null,
    admin: false, ed: { ano: null, dirty: false }, readOnly: false, downloads: null,
    store: null, sales: null, sys: { ano: null, data: null } };

  // ---------- Modelo ----------
  // O cálculo está em modelo.js (puro e testado), partilhado com o painel de todas as livrarias.
  const build = (ano, comp) => buildYearModel(S.years, ano, comp);
  // Filtros avançados (filtros-ui.js): S.modelAno é o ano inteiro; S.model, o recortado ao filtro.
  let FIL = null;
  const ultimoDe = (MA) => (MA && MA.R.ultimo ? MA.R.ultimo.i : 11);
  function filtrar(MA) {
    const F = FIL ? FIL.filtro() : null;
    if (!MA || !F || !filtroActivo(F)) return MA;
    const MF = recortarModelo(MA, mesesDoPeriodo(F, ultimoDe(MA)), { soFechados: F.soFechados });
    MF.filtro.texto = rotuloFiltro(F, { ultimo: ultimoDe(MA) });
    return MF;
  }

  // ---------- Tooltip ----------
  function tip(box, lines, x, y, obs) {
    const t = box.querySelector('.tip');
    if (!lines) { t.style.display = 'none'; return; }
    t.replaceChildren();
    lines.forEach((line, i) => {
      if (i === 0) { t.appendChild(el('div', 't', line)); return; }
      const d = el('div', 'l'); const a = el('span');
      if (line[2]) { const sw = el('i'); sw.style.background = line[2]; a.appendChild(sw); }
      a.appendChild(document.createTextNode(line[0]));
      d.append(a, el('span', null, line[1])); t.appendChild(d);
    });
    if (obs) t.appendChild(el('div', 'o', obs));
    t.style.display = 'block';
    const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
    let left = x + 14; if (left + tw > bw) left = x - tw - 14; if (left < 0) left = 0;
    let top = y - th - 10; if (top < 0) top = y + 14;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function clearBox(box, msg) {
    box.querySelectorAll('svg, .empty').forEach((s) => s.remove());
    if (msg) box.appendChild(el('div', 'empty', msg));
  }

  // ---------- Comparativo mensal ----------
  function drawMensal(M, animate) {
    const box = $('chart-mensal'); clearBox(box);
    const rows = M.rows;
    const W = Math.max(280, box.clientWidth), H = 300;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Vendas mensais');
    const metaM = M.meta ? M.meta / 12 : null;
    const max = d3.max(rows, (r) => Math.max(r.v1 || 0, r.v2 || 0, r.est || 0, metaM || 0)) || 1;
    const y = d3.scaleLinear().domain([0, max]).nice(5);
    const ticks = y.ticks(5);
    const probe = svg.append('text').text(mi(ticks[ticks.length - 1]));
    const ml = probe.node().getComputedTextLength() + 10; probe.remove();
    const band0 = (W - ml - 8) / 12;
    const showG = band0 >= 44, showV = band0 >= 62;
    const m = { t: showV ? 22 : 10, r: 8, b: showG ? 44 : 26, l: ml };
    y.range([H - m.b, m.t]);
    const x = d3.scaleBand().domain(MESES).range([m.l, W - m.r]).paddingInner(0.22).paddingOuter(0.08);
    const xi = d3.scaleBand().domain(['1', '2']).range([0, x.bandwidth()]).padding(0.08);
    const defs = svg.append('defs');
    const pat = defs.append('pattern').attr('id', 'hatch').attr('width', 6).attr('height', 6).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    pat.append('rect').attr('width', 6).attr('height', 6).attr('fill', C2).attr('fill-opacity', 0.25);
    pat.append('rect').attr('width', 3).attr('height', 6).attr('fill', C2);
    const gr = defs.append('linearGradient').attr('id', 'g2').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    gr.append('stop').attr('offset', 0).style('stop-color', '#EC8DB5');
    gr.append('stop').attr('offset', 1).style('stop-color', C2);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d === 0 ? '0' : mi(d));
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('class', 'mgrp').attr('transform', (r) => `translate(${x(r.mes)},0)`)
      .style('opacity', (r) => (r.fora ? 0.28 : null));
    const bw = Math.min(32, xi.bandwidth()), off = (xi.bandwidth() - bw) / 2, base = y(0), rx = Math.min(4, bw / 2);
    const b1 = g.filter((r) => r.v1 != null).append('rect').attr('x', xi('1') + off).attr('width', bw).attr('rx', rx).attr('fill', C1);
    const b2 = g.filter((r) => r.v2 != null).append('rect').attr('x', xi('2') + off).attr('width', bw).attr('rx', rx).attr('fill', (r) => r.estado === 'Fechado' ? 'url(#g2)' : 'url(#hatch)');
    const be = g.filter((r) => r.est != null).append('rect').attr('x', xi('2') + off + 1).attr('width', Math.max(1, bw - 2)).attr('rx', rx)
      .attr('fill', 'var(--c26-soft)').attr('stroke', C2).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    const fin = (sel, f) => sel.attr('y', (r) => y(f(r))).attr('height', (r) => Math.max(0, base - y(f(r))));
    const grow = (sel, f, d0) => {
      if (animate && !reduce) sel.attr('y', base).attr('height', 0).transition().delay((r) => d0 + r.i * 70).duration(800).ease(d3.easeCubicOut).call((t) => fin(t, f));
      else fin(sel, f);
    };
    grow(b1, (r) => r.v1, 0); grow(b2, (r) => r.v2, 120); grow(be, (r) => r.est, 400);
    if (metaM) {
      const ml2 = svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(metaM)).attr('y2', y(metaM)).style('stroke', TEAL).attr('stroke-width', 1.5).attr('stroke-dasharray', '6 4');
      svg.append('text').attr('x', W - m.r).attr('y', y(metaM) - 5).attr('text-anchor', 'end').style('fill', TEAL).style('font-weight', 700).text('Meta ' + mi(metaM));
      if (animate && !reduce) ml2.attr('x2', m.l).transition().delay(900).duration(700).attr('x2', W - m.r);
    }
    if (showV) {
      const vl = g.filter((r) => r.v2 != null || r.est != null).append('text').attr('x', xi('2') + xi.bandwidth() / 2).attr('y', (r) => y(r.v2 != null ? r.v2 : r.est) - 6)
        .attr('text-anchor', 'middle').style('font-weight', (r) => r.v2 != null ? 700 : 500).style('fill', (r) => r.v2 != null ? 'var(--fg)' : 'var(--muted)')
        .text((r) => (r.v2 != null ? '' : '≈') + mi(r.v2 != null ? r.v2 : r.est).replace(' M', 'M'));
      if (animate && !reduce) vl.style('opacity', 0).transition().delay((r) => 700 + r.i * 70).duration(300).style('opacity', 1);
    }
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', base).attr('y2', base).style('stroke', 'var(--axis)');
    g.append('text').attr('x', x.bandwidth() / 2).attr('y', base + 16).attr('text-anchor', 'middle').text((r) => short(r.mes));
    if (showG) {
      g.append('text').attr('x', x.bandwidth() / 2).attr('y', base + 32).attr('text-anchor', 'middle').style('font-weight', 700)
        .style('fill', (r) => r.estado === 'Por preencher' ? 'var(--muted)' : r.estado === 'Em curso' ? 'var(--warn)' : (r.cresc == null ? 'var(--muted)' : r.cresc >= 0 ? 'var(--ok)' : 'var(--bad)'))
        .text((r) => r.estado === 'Por preencher' ? '—' : r.estado === 'Em curso' ? 'em curso' : (r.cresc == null ? '' : pct(r.cresc).replace(',0%', '%')))
        .style('font-size', (r) => r.estado === 'Fechado' ? '11px' : '9.5px');
    }
    g.append('rect').attr('x', -x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t).attr('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev, r) => {
        const [px, py] = d3.pointer(ev, box);
        const L = [r.mes + (r.estado !== 'Fechado' ? ' · ' + r.estado.toLowerCase() : '')];
        if (M.comp != null) L.push([String(M.comp), kz(r.v1), C1]);
        L.push([String(M.ano), r.v2 != null ? kz(r.v2) : (r.est != null ? '≈ ' + kz(r.est) : '—'), C2]);
        if (M.comp != null) L.push(['Crescimento', r.cresc == null ? '—' : pct(r.cresc)]);
        tip(box, L, px, py, r.obs);
      })
      .on('mouseleave', () => tip(box, null))
      .on('click', (ev, r) => { stopPlay(); select(r.mes, true); });
    highlight();
  }
  function highlight() {
    d3.select($('chart-mensal')).selectAll('.mgrp').transition().duration(250).style('opacity', (r) => (r.fora ? 0.16 : !S.sel || r.mes === S.sel ? 1 : 0.38));
    root.querySelectorAll('#tbl-quadro tbody tr').forEach((tr) => tr.classList.toggle('rsel', tr.dataset.key === S.sel));
    root.querySelectorAll('#sp-chips .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mes === S.sel)));
  }

  // ---------- Acumulado (painel e apresentação) ----------
  function drawAcumInto(box, W, H, M, animate, opt) {
    opt = opt || {};
    const R = M.R;
    const fs = opt.fs || 11;
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Vendas acumuladas');
    const pts1 = M.comp != null ? M.rows.map((r) => ({ mes: r.mes, v: r.acum1 })) : [];
    const pts2 = M.rows.filter((r) => r.acum2 != null).map((r) => ({ mes: r.mes, v: r.acum2 }));
    let proj = [];
    if (R.projeccao != null && M.rows.some((r) => r.estado !== 'Fechado')) {
      const iF = R.ultimoFech ? R.ultimoFech.i : -1;
      let v = R.ultimoFech ? M.rows[iF].acum2 : 0;
      proj = iF >= 0 ? [{ mes: MESES[iF], v }] : [];
      M.rows.slice(iF + 1).forEach((r) => { v += r.projMes || 0; proj.push({ mes: r.mes, v }); });
    }
    const max = Math.max(R.projeccao || 0, R.total1 || 0, R.ytd2 || 0, M.meta || 0) || 1;
    const y = d3.scaleLinear().domain([0, max]).nice(5);
    const ticks = y.ticks(5);
    const txtW = (s, w) => { const p = svg.append('text').style('font-size', fs + 'px').style('font-weight', w || 400).text(s); const L = p.node().getComputedTextLength(); p.remove(); return L; };
    const ml = txtW(mi(ticks[ticks.length - 1])) + 10;
    const endP = R.projeccao != null && proj.length ? 'Projecção ' + mi(R.projeccao) : null;
    const end1 = R.total1 != null ? M.comp + ' ' + mi(R.total1) : null;
    const narrow = W < 520;
    let mr = 12;
    if (!narrow) [endP, end1].forEach((s) => { if (s) mr = Math.max(mr, txtW(s, 700) + 12); });
    const m = { t: 14, r: mr, b: fs + 15, l: ml };
    y.range([H - m.b, m.t]);
    const x = d3.scalePoint().domain(MESES).range([m.l + 6, W - m.r]);
    const every = (W - m.l - m.r) / 12 < 30 ? 2 : 1;
    const T = (sel) => sel.style('font-size', fs + 'px');
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', opt.grid || 'var(--grid)');
    T(svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d === 0 ? '0' : mi(d)));
    T(svg.append('g').selectAll('text').data(MESES.filter((d, i) => i % every === 0)).join('text').attr('x', (d) => x(d)).attr('y', H - 6).attr('text-anchor', 'middle').text(short));
    const uid = 'a' + Math.random().toString(36).slice(2, 7);
    const defs = svg.append('defs');
    const lg = defs.append('linearGradient').attr('id', uid + 'ar').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    [[0, .26], [.25, .16], [.5, .08], [.75, .03], [1, 0]].forEach(([o, a]) => lg.append('stop').attr('offset', o).style('stop-color', C2).style('stop-opacity', a));
    const clip = defs.append('clipPath').attr('id', uid + 'cl').append('rect').attr('x', 0).attr('y', 0).attr('height', H).attr('width', W);
    const plot = svg.append('g').attr('clip-path', `url(#${uid}cl)`);
    if (R.total1 != null) plot.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(R.total1)).attr('y2', y(R.total1)).style('stroke', opt.axis || 'var(--axis)').attr('stroke-dasharray', '3 3');
    if (M.meta) plot.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(M.meta)).attr('y2', y(M.meta)).style('stroke', TEAL).attr('stroke-dasharray', '6 4').attr('stroke-width', 1.5);
    const line = d3.line().x((d) => x(d.mes)).y((d) => y(d.v));
    const sw = opt.sw || 2;
    if (pts2.length) plot.append('path').datum(pts2).attr('fill', `url(#${uid}ar)`).attr('d', d3.area().x((d) => x(d.mes)).y0(y(0)).y1((d) => y(d.v)));
    if (pts1.length) plot.append('path').datum(pts1).attr('fill', 'none').attr('stroke', C1).attr('stroke-width', sw).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', line);
    if (proj.length > 1) plot.append('path').datum(proj).attr('fill', 'none').attr('stroke', C2).attr('stroke-width', sw).attr('stroke-dasharray', '5 4').attr('d', line);
    if (pts2.length) {
      plot.append('path').datum(pts2).attr('fill', 'none').attr('stroke', C2).attr('stroke-width', sw + .5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', line);
      plot.append('g').selectAll('circle').data(pts2).join('circle').attr('cx', (d) => x(d.mes)).attr('cy', (d) => y(d.v)).attr('r', sw + 1).attr('fill', C2);
    }
    if (R.ultrapassa && !narrow) {
      const r = M.rows.find((q) => q.mes === R.ultrapassa);
      const cx = x(r.mes), cy = y(r.acum2);
      plot.append('circle').attr('cx', cx).attr('cy', cy).attr('r', sw + 4).attr('fill', 'none').attr('stroke', POS).attr('stroke-width', 2);
      const t = T(plot.append('text').attr('x', cx + 10).attr('y', cy + fs + 5).style('font-weight', 700).style('fill', opt.ok || 'var(--ok)').text('Supera ' + M.comp + ' em ' + short(r.mes)));
      if (cx + 10 + t.node().getComputedTextLength() > W - m.r) t.attr('x', cx - 10).attr('text-anchor', 'end');
    }
    const xe = x('Dezembro');
    const yP = R.projeccao != null ? y(R.projeccao) : null, y1 = R.total1 != null ? y(R.total1) : null;
    const muted = opt.muted || 'var(--muted)', fg = opt.fg || 'var(--fg)';
    if (narrow) {
      if (endP) T(svg.append('text').attr('x', xe).attr('y', yP - 10).attr('text-anchor', 'end').style('font-weight', 700).style('fill', C2).text(endP));
      if (end1) T(svg.append('text').attr('x', xe).attr('y', y1 + 14).attr('text-anchor', 'end').style('font-weight', 700).style('fill', muted).text(end1));
    } else {
      if (endP) T(svg.append('text').attr('x', xe + 8).attr('y', yP).attr('dy', '0.32em').style('font-weight', 700).style('fill', C2).text(endP));
      if (end1) T(svg.append('text').attr('x', xe + 8).attr('y', yP != null && Math.abs(y1 - yP) < fs + 5 ? (y1 >= yP ? yP + fs + 5 : yP - fs - 5) : y1).attr('dy', '0.32em').style('font-weight', 700).style('fill', muted).text(end1));
    }
    if (pts2.length) {
      const l = pts2[pts2.length - 1];
      if (l.mes !== 'Dezembro') T(svg.append('text').attr('x', x(l.mes)).attr('y', y(l.v) + fs + 7).attr('text-anchor', 'middle').style('font-weight', 700).style('fill', fg).text(mi(l.v)));
      else T(svg.append('text').attr('x', narrow ? xe : xe + 8).attr('text-anchor', narrow ? 'end' : 'start').attr('y', y(l.v) - 14).style('font-weight', 700).style('fill', C2).text(M.ano + ' ' + mi(l.v)));
    }
    if (animate && !reduce) clip.attr('width', m.l).transition().duration(opt.dur || 1500).ease(d3.easeCubicInOut).attr('width', W);
    return { svg, x, y, m, proj };
  }
  function drawAcum(M, animate) {
    const box = $('chart-acum'); clearBox(box);
    if (!M.com2.length && M.comp == null) { clearBox(box, 'Ainda sem vendas registadas para ' + M.ano + '.'); return; }
    const W = Math.max(280, box.clientWidth), H = 300;
    const { svg, x, m, proj } = drawAcumInto(box, W, H, M, animate);
    const R = M.R;
    const hover = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--axis)').style('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r + 6).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev);
        const i = Math.max(0, Math.min(11, Math.round((px - x(MESES[0])) / x.step())));
        const r = M.rows[i];
        hover.attr('x1', x(r.mes)).attr('x2', x(r.mes)).style('opacity', 1);
        const pr = proj.find((p) => p.mes === r.mes);
        const [bx, by] = d3.pointer(ev, box);
        const L = [r.mes];
        if (M.comp != null) L.push([String(M.comp), kz(r.acum1), C1]);
        L.push([String(M.ano), r.acum2 == null ? '—' : kz(r.acum2), C2]);
        if (pr && (!R.ultimoFech || r.i > R.ultimoFech.i)) L.push(['Projecção', kz(pr.v)]);
        tip(box, L, bx, by);
      })
      .on('mouseleave', () => { hover.style('opacity', 0); tip(box, null); });
  }

  // ---------- Ganho mensal ----------
  function drawVar(M, animate) {
    const box = $('chart-var'); clearBox(box);
    const data = M.rows.filter((r) => r.dif != null && !r.fora);
    if (!data.length) { box.style.minHeight = '300px'; clearBox(box, M.comp == null ? 'Escolha um ano de comparação para ver o ganho mensal.' : 'Sem meses com vendas nos dois anos.'); return; }
    const W = Math.max(280, box.clientWidth), rowH = 24, H = Math.max(data.length * rowH + 16, 120);
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Diferença mensal em Kz');
    const probe = svg.append('text').text('Out (em curso)');
    const ml = probe.node().getComputedTextLength() + 12; probe.remove();
    const lblW = 64;
    const mn = Math.min(0, d3.min(data, (d) => d.dif)), mx = Math.max(0, d3.max(data, (d) => d.dif));
    const x = d3.scaleLinear().domain([mn, mx || 1]).range([ml + (mn < 0 ? lblW : 0), W - lblW]);
    const y = d3.scaleBand().domain(data.map((d) => d.mes)).range([8, H - 8]).padding(0.28);
    const g = svg.selectAll('g.r').data(data).join('g').attr('class', 'r');
    g.append('text').attr('x', 0).attr('y', (d) => y(d.mes) + y.bandwidth() / 2).attr('dy', '0.32em').text((d) => short(d.mes) + (d.estado === 'Em curso' ? ' (em curso)' : ''));
    const bars = g.append('rect').attr('y', (d) => y(d.mes)).attr('height', y.bandwidth()).attr('rx', 3).attr('fill', (d) => d.dif >= 0 ? POS : NEG).attr('fill-opacity', (d) => d.estado === 'Fechado' ? 0.9 : 0.5);
    const fin = (sel) => sel.attr('x', (d) => Math.min(x(0), x(d.dif))).attr('width', (d) => Math.abs(x(d.dif) - x(0)));
    if (animate && !reduce) bars.attr('x', x(0)).attr('width', 0).transition().delay((d, i) => 300 + i * 60).duration(700).ease(d3.easeCubicOut).call(fin); else fin(bars);
    g.append('text').attr('x', (d) => d.dif >= 0 ? x(d.dif) + 6 : x(d.dif) - 6).attr('text-anchor', (d) => d.dif >= 0 ? 'start' : 'end')
      .attr('y', (d) => y(d.mes) + y.bandwidth() / 2).attr('dy', '0.32em').style('font-weight', 700).style('fill', (d) => d.dif >= 0 ? 'var(--ok)' : 'var(--bad)').text((d) => mis(d.dif));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 4).attr('y2', H - 4).style('stroke', 'var(--axis)');
    g.append('rect').attr('x', 0).attr('width', W).attr('y', (d) => y(d.mes) - 3).attr('height', y.bandwidth() + 6).attr('fill', 'transparent')
      .on('mousemove', (ev, d) => { const [px, py] = d3.pointer(ev, box); tip(box, [d.mes, [String(M.comp), kz(d.v1), C1], [String(M.ano), kz(d.v2), C2], ['Diferença', kzs(d.dif)]], px, py, d.obs); })
      .on('mouseleave', () => tip(box, null));
  }

  function drawSpark(M) {
    const s = d3.select($('spark')); s.selectAll('*').remove();
    const x = d3.scaleBand().domain(MESES).range([0, 200]).padding(0.25);
    const mx = d3.max(M.rows, (r) => r.v2 || r.est || 0) || 1;
    const y = d3.scaleLinear().domain([0, mx]).range([34, 2]);
    s.selectAll('rect').data(M.rows.filter((r) => r.v2 != null || r.est != null)).join('rect')
      .attr('x', (r) => x(r.mes)).attr('width', x.bandwidth()).attr('y', (r) => y(r.v2 != null ? r.v2 : r.est)).attr('height', (r) => 34 - y(r.v2 != null ? r.v2 : r.est))
      .attr('rx', 1.5).attr('fill', C2).attr('fill-opacity', (r) => r.estado === 'Fechado' ? 0.85 : r.estado === 'Em curso' ? 0.45 : 0.15);
  }

  // ---------- KPIs e textos ----------
  function setPill(e, v, suffix) {
    e.replaceChildren();
    e.appendChild(el('span', 'pill ' + (v == null ? 'na' : v >= 0 ? 'ok' : 'bad'), v == null ? 's/ comparação' : pct(v)));
    if (suffix) e.appendChild(document.createTextNode(suffix));
  }
  function fillKpis(M, animate) {
    const R = M.R, A = M.ano, B = M.comp;
    const ult = R.ultimo ? R.ultimo.mes : null;
    $('k1-lab').textContent = 'Vendas ' + A + (ult ? ' · até ' + ult : '');
    countUp($('k1'), R.ytd2, kz, animate ? 1100 : 0, 150);
    setPill($('k1-d'), R.cresc_ytd, B != null && R.ytd1 != null ? 'vs ' + kz(R.ytd1) + ' em ' + B + ' (mesmos meses)' : '');
    const primeiro = M.filtro ? (M.rows.find((q) => !q.fora) || M.rows[0]).mes : 'Janeiro';
    $('k2-lab').textContent = 'Meses fechados' + (R.ultimoFech ? ' · ' + short(primeiro) + '–' + short(R.ultimoFech.mes) : '');
    countUp($('k2'), R.fech2, kz, animate ? 1100 : 0, 200);
    setPill($('k2-d'), R.cresc_fech, R.fech1 != null ? 'vs ' + kz(R.fech1) + (R.fech2c !== R.fech2 ? ' (mesmos meses)' : '') : '');
    $('k3-lab').textContent = 'Média mensal ' + A + (M.filtro ? ' · ' + M.filtro.rotulo : '');
    countUp($('k3'), R.media2, kz, animate ? 1100 : 0, 250);
    setPill($('k3-d'), R.cresc_media, R.media1 != null ? 'vs ' + kz(R.media1) + ' (' + B + ')' : '');
    $('k4-lab').textContent = 'Melhor mês ' + A + (M.filtro ? ' · ' + M.filtro.rotulo : '');
    countUp($('k4'), R.melhor ? R.melhor.v2 : null, kz, animate ? 1100 : 0, 300);
    if (R.melhor) { setPill($('k4-d'), R.melhor.cresc, 'vs ' + short(R.melhor.mes) + (B != null ? ' ' + B : '')); $('k4-d').prepend(document.createTextNode(R.melhor.mes + ' · ')); }
    else $('k4-d').textContent = 'Sem meses fechados';
    $('k5-lab').textContent = (M.filtro ? 'Projecção ' + M.filtro.rotulo + ' ' : 'Projecção anual ') + A;
    countUp($('k5'), R.projeccao, kz, animate ? 1100 : 0, 350);
    const parts = [];
    if (R.total1 != null) parts.push(M.filtro ? 'vs ' + M.filtro.rotulo + ' ' + B : 'vs total ' + B);
    if (M.meta) parts.push('meta ' + mi(M.meta) + ' · ' + Math.round(R.metaPct * 100) + '% atingido');
    else if (R.progresso != null) parts.push(Math.round(R.progresso * 100) + '% realizado');
    setPill($('k5-d'), R.cresc_proj, parts.join(' · '));
    $('k5-d').appendChild(el('div', 'mut', 'Critério: ' + CRIT[M.crit]));
    const pb = $('proj-bar');
    const prog = M.meta ? R.metaPct : R.progresso;
    pb.style.transition = animate && !reduce ? 'width 1.4s cubic-bezier(.22,1,.36,1) .3s' : 'none';
    pb.style.width = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { pb.style.width = Math.min(100, (prog || 0) * 100).toFixed(1) + '%'; }));
    drawSpark(M);

    $('titulo').textContent = 'Painel de Vendas ' + A + (B != null ? ' vs ' + B : '');
    root.querySelectorAll('.lgA').forEach((e) => { e.textContent = B != null ? String(B) : '—'; });
    root.querySelectorAll('.lgB').forEach((e) => { e.textContent = String(A); });
    $('lg-meta').hidden = !M.meta;
    const estTxt = { media: 'a média dos meses fechados', tendencia: 'o mesmo mês de ' + B + ' ajustado pelo crescimento', meta: 'o que falta para a meta, repartido pelos meses' }[M.crit];
    $('note-mensal').textContent = 'Vendas por mês em Kz. Meses por preencher mostram a estimativa (' + estTxt + '). Clique num mês para o pôr em destaque.';
    $('note-acum').textContent = 'Vendas somadas mês a mês até Dezembro. Projecção pelo critério: ' + CRIT[M.crit] + '.';
    const tk = $('takeaway'); tk.replaceChildren();
    const add = (t, cls) => { tk.appendChild(el(cls ? 'b' : 'span', cls && cls !== 'b' ? cls : null, t)); };
    if (!R.ultimo) { add('Ainda não há vendas registadas para ' + A + '. Entre na Administração para preencher os meses.'); return; }
    if (M.filtro) { add('Filtro '); add(M.filtro.rotulo, 'b'); add(': '); }
    add(M.filtro ? 'até ' : 'Até '); add(R.ultimo.mes + (R.ultimo.estado === 'Em curso' ? ' (em curso)' : ''), 'b'); add(', a loja faturou '); add(kz(R.ytd2), 'b'); add(' em ' + A);
    if (R.cresc_ytd != null) { add(', '); add(pct(R.cresc_ytd), R.cresc_ytd >= 0 ? 'up' : 'dn'); add(' face aos mesmos meses de ' + B + '.'); } else add('.');
    if (R.ultrapassa) { add(' Em '); add(R.ultrapassa, 'b'); add(' o acumulado já superava ' + (M.filtro ? 'todo o mesmo período de ' : 'todo o ano de ') + B + '.'); }
    const falta = M.rows.filter((r) => r.estado === 'Por preencher' && !r.fora).length;
    if (falta) { add(' Faltam '); add(falta + (falta === 1 ? ' mês' : ' meses'), 'b'); add(M.filtro ? ' por preencher no filtro.' : ' por preencher até Dezembro.'); }
  }

  // ---------- Tabelas ----------
  function fillQuadro(M) {
    const tb = root.querySelector('#tbl-quadro tbody');
    const max = d3.max(M.rows, (r) => r.v2 || 0) || 1;
    const td = (txt, cls) => el('td', cls, txt);
    tb.replaceChildren(...M.rows.map((r) => {
      const tr = el('tr', r.fora ? 'fora' : null); tr.dataset.key = r.mes;
      const c2 = r.v2 != null ? td(kz(r.v2), 'bar2') : td(r.est != null ? '≈ ' + kz(r.est) : '—', 'est');
      if (r.v2 != null) { c2.style.backgroundImage = 'linear-gradient(90deg, #EC8DB5, #E0679A)'; c2.style.backgroundSize = `${(r.v2 / max * 100).toFixed(1)}% 3px`; }
      const cE = el('td'); cE.appendChild(el('span', 'tag ' + (r.estado === 'Fechado' ? 'f' : r.estado === 'Em curso' ? 'c' : 'p'), r.estado));
      tr.append(td(r.mes), td(r.v1 != null ? kz(r.v1) : '—', r.v1 == null ? 'mut' : ''), c2,
        td(r.dif == null ? '—' : kzs(r.dif), r.dif == null ? 'mut' : ''),
        td(r.cresc == null ? '—' : pct(r.cresc), r.cresc == null ? 'mut' : r.cresc >= 0 ? 'pos' : 'neg'), cE, td(r.obs || '', 'o'));
      return tr;
    }));
    const R = M.R, tf = root.querySelector('#tbl-quadro tfoot');
    const r1 = el('tr');
    r1.append(td((M.filtro ? 'Filtro ' + M.filtro.rotulo + ' · comparável' : 'Período comparável') + (R.ultimo ? ' (até ' + R.ultimo.mes + ')' : '')), td(kz(R.ytd1)), td(kz(R.ytd2c)), td(kzs(R.dif_ytd)), td(pct(R.cresc_ytd), R.cresc_ytd == null ? 'mut' : R.cresc_ytd >= 0 ? 'pos' : 'neg'), td(''), td('', 'o'));
    const r2 = el('tr');
    r2.append(td(M.filtro ? 'Período filtrado / projecção' : 'Ano completo / projecção'), td(kz(R.total1)), td(R.projeccao != null ? '≈ ' + kz(R.projeccao) : '—'), td(''), td(pct(R.cresc_proj)), td(''), td(M.meta ? 'Meta: ' + kz(M.meta) : '', 'o'));
    tf.replaceChildren(r1, r2);
  }
  function correctedValue(chave, M) {
    const parts = String(chave).split(':'); const k = parts[0], arg = parts[1];
    const A = S.years[M.ano], B = S.years[M.comp];
    const vals = (Y) => (Y && Y.meses ? Y.meses : []).map((v) => v == null ? null : Number(v));
    const tot = (Y) => vals(Y).reduce((s, v) => s + (v || 0), 0);
    const cnt = (Y) => vals(Y).filter((v) => v != null).length;
    const upto = (Y, n) => vals(Y).slice(0, n).reduce((s, v) => s + (v || 0), 0);
    if (k === 'total_comp') return tot(B);
    if (k === 'total_ano') return tot(A);
    if (k === 'media_comp') return cnt(B) ? tot(B) / cnt(B) : null;
    if (k === 'media_ano') return M.R.media2;
    if (k === 'previsao') return M.R.projeccao;
    if (k === 'soma_ate') return upto(A, Number(arg));
    if (k === 'cresc_mes') { const i = Number(arg) - 1; const a = vals(A)[i], b = vals(B)[i]; return a != null && b ? a / b - 1 : null; }
    if (k === 'cresc_ate') { const n = Number(arg); const b = upto(B, n); return b ? upto(A, n) / b - 1 : null; }
    return null;
  }
  function fillConf(M) {
    const sec = $('conferencia'), N = S.note;
    if (!N || !Array.isArray(N.itens) || Number(N.ano) !== M.ano || Number(N.comparar) !== M.comp) { sec.hidden = true; return; }
    sec.hidden = false;
    const td = (txt, cls) => el('td', cls, txt);
    root.querySelector('#tbl-conf tbody').replaceChildren(...N.itens.map((it) => {
      const c = correctedValue(it.chave, M), a = Number(it.anterior);
      const isP = it.tipo === 'pct';
      const f = isP ? pct : kz;
      const d = c != null ? c - a : null;
      const small = d == null || Math.abs(d) < (isP ? 0.0005 : 1);
      const dTxt = d == null ? '—' : isP ? ((d >= 0 ? '+' : '−') + Math.abs(d * 100).toFixed(1).replace('.', ',') + ' p.p.') : (small ? '0 Kz' : kzs(d));
      const tr = el('tr');
      tr.append(td(it.indicador), td(it.documento || '', 'mut'), td(f(a), 'mut'), td(f(c), 'pos'), td(dTxt, small ? 'mut' : ''));
      return tr;
    }));
  }

  // ---------- Mês em destaque ----------
  function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; if (S.raf) cancelAnimationFrame(S.raf); S.raf = null; }
  const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));
  function select(mes, animate) {
    const M = S.model; if (!M) return;
    clearTimers();
    S.sel = mes;
    const r = M.rows.find((q) => q.mes === mes);
    const elMes = $('sp-mes'); elMes.textContent = mes;
    elMes.classList.remove('swap'); void elMes.offsetWidth; if (animate) elMes.classList.add('swap');
    $('sp-estado').textContent = r.estado;
    $('sp-obs').textContent = r.obs ? '“' + r.obs + '”' : '';
    $('sp-mA').textContent = kz(M.R.media1); $('sp-mB').textContent = kz(M.R.media2);
    fillPeriodo(M, r);
    const b1 = $('sp-b1'), b2 = $('sp-b2'), v1 = $('sp-v1'), v2 = $('sp-v2'), g = $('sp-g'), dd = $('sp-d');
    const sq = [1, 2, 3].map((i) => $('sq' + i));
    const val2 = r.v2 != null ? r.v2 : r.est;
    b2.classList.toggle('partial', r.estado === 'Em curso');
    b2.classList.toggle('est', r.estado === 'Por preencher');
    const maxV = d3.max(M.rows, (q) => Math.max(q.v1 || 0, q.v2 || 0, q.est || 0)) || 1;
    const h = (v) => v == null ? '0' : (v / maxV * 90) + '%';
    const f2 = (v) => (r.v2 == null && v != null ? '≈ ' : '') + kz(v);
    const step = (n, anim) => {
      sq.forEach((li, i) => li.classList.toggle('on', i < n));
      if (n >= 1) { b1.classList.add('on'); b1.querySelector('.b').style.height = h(r.v1); countUp(v1, r.v1, kz, anim ? 700 : 0); }
      if (n >= 2) { b2.classList.add('on'); b2.querySelector('.b').style.height = h(val2); countUp(v2, val2, f2, anim ? 700 : 0); }
      if (n >= 3) {
        g.classList.add('on'); g.classList.remove('ok', 'bad', 'na');
        if (r.cresc != null) { g.classList.add(r.cresc >= 0 ? 'ok' : 'bad'); countUp(g, r.cresc, pct, anim ? 900 : 0); }
        else { g.classList.add('na'); g.textContent = r.estado === 'Por preencher' ? 'Por preencher' : 'Sem comparação'; }
        if (anim) { g.classList.remove('pulse'); void g.offsetWidth; g.classList.add('pulse'); }
        dd.textContent = r.dif != null ? kzs(r.dif) + ' face a ' + short(mes) + ' ' + M.comp + (r.estado === 'Em curso' ? ' · mês em curso' : '')
          : (r.estado === 'Por preencher' && r.est != null ? 'Estimativa pelo critério: ' + CRIT[M.crit] : ' ');
      }
    };
    if (animate && !reduce) {
      [b1, b2].forEach((b) => { b.classList.remove('on'); b.querySelector('.b').style.height = '0'; });
      contagens.set(v1, {}); contagens.set(v2, {}); v1.textContent = kz(0); v2.textContent = kz(0);
      g.classList.remove('on', 'ok', 'bad', 'na'); contagens.set(g, {}); g.textContent = pct(0); dd.textContent = ' ';
      sq.forEach((li) => li.classList.remove('on'));
      later(() => step(1, true), 150); later(() => step(2, true), 1050); later(() => step(3, true), 1950);
    } else { step(1, false); step(2, false); step(3, false); }
    highlight();
  }
  /** O período até ao mês: vendas e médias de cada ano, crescimento e diferenças (como no PowerPoint). */
  function fillPeriodo(M, r) {
    const P = periodoAte(M, r.i);
    const A = M.ano, B = M.comp;
    $('sp-ate').textContent = P.ate;
    root.querySelectorAll('.lgAB').forEach((e) => { e.textContent = B != null ? `${B}/${String(A).slice(-2)}` : String(A); });
    $('sp-pA').textContent = B != null ? kz(P.venda1) : '—';
    $('sp-pB').textContent = kz(P.venda2);
    $('sp-pmA').textContent = B != null ? kz(P.media1) : '—';
    $('sp-pmB').textContent = kz(P.media2);
    const sinal = (e, v, txt) => { e.textContent = txt; e.classList.remove('ok', 'bad'); if (v != null) e.classList.add(v >= 0 ? 'ok' : 'bad'); };
    sinal($('sp-pG'), P.crescimento, pct(P.crescimento));
    sinal($('sp-dM'), P.difMensal, P.difMensal != null ? kzs(P.difMensal) : '—');
    sinal($('sp-dP'), P.difPeriodica, P.difPeriodica != null ? kzs(P.difPeriodica) : '—');
    $('sp-pG').title = P.comparaveis ? `${P.comparaveis} ${P.comparaveis === 1 ? 'mês' : 'meses'} com valor nos dois anos` : '';
  }
  function runTimer(ms) {
    const e = $('sp-timer'); const t0 = performance.now();
    const tick = (now) => { const t = Math.min(1, (now - t0) / ms); e.style.width = (t * 100) + '%'; if (t < 1 && S.playing) S.raf = requestAnimationFrame(tick); };
    S.raf = requestAnimationFrame(tick);
  }
  function playFrom(mes) {
    S.playing = true; setPlayIcon();
    const go = (m) => { if (!S.playing) return; select(m, true); runTimer(5200); later(() => go(MESES[(MESES.indexOf(m) + 1) % 12]), 5200); };
    go(mes);
  }
  function stopPlay() { S.playing = false; setPlayIcon(); $('sp-timer').style.width = '0'; }
  function setPlayIcon() {
    $('sp-play').setAttribute('aria-label', S.playing ? 'Pausar sequência' : 'Reproduzir sequência');
    $('sp-play-ico').innerHTML = S.playing ? '<path d="M2 1h3v10H2zM7 1h3v10H7z"/>' : '<path d="M2 1l9 5-9 5z"/>';
  }
  $('sp-play').addEventListener('click', () => {
    if (!S.model) return;
    if (S.playing) { clearTimers(); stopPlay(); select(S.sel, false); } else playFrom(S.sel || MESES[0]);
  });
  const stepMonth = (k) => { if (!S.model) return; stopPlay(); select(MESES[(MESES.indexOf(S.sel) + k + 12) % 12], true); };
  $('sp-prev').addEventListener('click', () => stepMonth(-1));
  $('sp-next').addEventListener('click', () => stepMonth(1));
  $('sp-chips').addEventListener('click', (ev) => { const b = ev.target.closest('.chip'); if (!b) return; stopPlay(); select(b.dataset.mes, true); });
  root.querySelector('#tbl-quadro tbody').addEventListener('click', (ev) => {
    const tr = ev.target.closest('tr[data-key]'); if (!tr) return;
    stopPlay(); select(tr.dataset.key, true);
    $('apresentacao').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });

  // ---------- Render geral ----------
  function yearsList() { return Object.keys(S.years).map(Number).sort((a, b) => a - b); }
  function fillSelectors() {
    const ys = yearsList();
    const sa = $('sel-ano'), sc = $('sel-comp');
    sa.replaceChildren(...ys.map((y) => new Option(String(y), String(y))));
    sc.replaceChildren(new Option('Nenhum', ''), ...ys.filter((y) => y !== S.ano).map((y) => new Option(String(y), String(y))));
    sa.value = S.ano != null ? String(S.ano) : ''; sc.value = S.comp != null ? String(S.comp) : '';
    sa.disabled = !ys.length; sc.disabled = !ys.length;
    $('btn-pres').disabled = !ys.length;
    $('btn-exp').disabled = !ys.length;
  }
  function defaultYears() {
    const ys = yearsList();
    if (S.ano == null || !S.years[S.ano]) {
      const withData = ys.filter((y) => (S.years[y].meses || []).some((v) => v != null));
      S.ano = withData.length ? withData[withData.length - 1] : (ys.length ? ys[ys.length - 1] : null);
      S.comp = S.ano != null && S.years[S.ano - 1] ? S.ano - 1 : null;
    }
    if (S.comp != null && (!S.years[S.comp] || S.comp === S.ano)) S.comp = null;
  }
  function render(animate) {
    defaultYears(); fillSelectors();
    if (S.ano == null) { showEmpty(); return; }
    S.modelAno = build(S.ano, S.comp);
    S.model = filtrar(S.modelAno);
    const M = S.model;
    fillKpis(M, animate);
    // O acumulado é sempre o do ano inteiro (com a projecção do ano); o resto segue o filtro.
    drawMensal(M, animate); drawAcum(S.modelAno, animate); drawVar(M, animate);
    fillQuadro(M); fillConf(M); videoLabels(M); topoCapas(M.ano);
    $('sp-chips').replaceChildren(...M.rows.map((r) => { const b = el('button', 'chip' + (r.v2 == null ? ' miss' : '') + (r.fora ? ' fora' : ''), short(r.mes)); b.type = 'button'; b.dataset.mes = r.mes; b.setAttribute('aria-pressed', 'false'); return b; }));
    const naSel = S.sel ? M.rows.find((q) => q.mes === S.sel) : null;
    if (!S.sel || (naSel && naSel.fora)) S.sel = (M.R.ultimoFech || M.R.ultimo || M.rows.find((q) => !q.fora) || M.rows[0]).mes;
    if (!S.playing) select(S.sel, animate); else highlight();
  }
  const grpUn = (n) => { const v = Number(n) || 0; return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  /** As capas do topo: os mais vendidos da loja no ano e, a completar, as do catálogo. */
  function topoCapas(ano) {
    const pintar = (itens) => {
      if (dead) return;
      const n = window.innerWidth < 700 ? 12 : 20;
      pintarParede($('hero-capas'), capasParaFundo(itens, { n, chave: `${S.store ? S.store.name : ''}:${ano}` }), { colunas: n > 12 ? 5 : 3 });
    };
    pintar([]);
    $('mv').hidden = true;
    if (S.extras) {
      extrasDe(ano).then((x) => {
        if (dead || S.ano !== ano) return;
        const itens = x && x.destaques ? x.destaques.ano || [] : [];
        pintar(itens);
        maisVendidos(itens, ano);
        S.mv = { ano, itens };
        PRES.actualizar();
      });
    }
  }
  function maisVendidos(itens, ano) {
    $('mv-ano').textContent = String(ano);
    pintarMaisVendidos($('mv-lista'), itens, { n: 6, fmt: { unid: (n) => `${grpUn(n)} ${Number(n) === 1 ? 'unidade' : 'unidades'}`, kz } });
    $('mv').hidden = !itens.length;
  }
  function showEmpty(msg) {
    S.model = null;
    topoCapas(new Date().getFullYear());
    $('takeaway').textContent = msg || 'Ainda não há anos registados. Entre na Administração para adicionar o primeiro ano.';
    ['k1', 'k2', 'k3', 'k4', 'k5'].forEach((id) => { $(id).textContent = '—'; });
    ['chart-mensal', 'chart-acum', 'chart-var'].forEach((id) => clearBox($(id), 'Sem dados para mostrar.'));
  }
  $('sel-ano').addEventListener('change', (e) => {
    S.ano = Number(e.target.value);
    S.comp = S.years[S.ano - 1] ? S.ano - 1 : null;
    S.sel = null; clearTimers(); stopPlay(); render(true);
  });
  $('sel-comp').addEventListener('change', (e) => { S.comp = e.target.value ? Number(e.target.value) : null; clearTimers(); stopPlay(); render(true); });
  let rz; listen(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.model) { drawMensal(S.model, false); drawAcum(S.model, false); drawVar(S.model, false); } }, 150); });

  // ---------- Palavra-passe de administrador ----------
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  async function derive(pass, saltHex, iter) {
    const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
  }
  const SESSION_KEY = 'hb-admin';
  const IDLE_MS = 30 * 60 * 1000;
  let idleT = null;
  function touchIdle() {
    if (!S.admin) return;
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (S.ed.dirty) { touchIdle(); return; } setAdmin(false); }, IDLE_MS);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ h: S.cfg && S.cfg.hash, t: Date.now() })); } catch (e) {}
  }
  ['pointerdown', 'keydown'].forEach((ev) => listen(document, ev, touchIdle, { passive: true }));
  function setAdmin(on) {
    S.admin = on;
    $('adm-badge').hidden = !on;
    $('btn-admin-t').textContent = on ? 'Editar dados' : 'Administração';
    $('ed-pass').hidden = !(on && S.isOwner);
    if (!on) { $('editar').hidden = true; clearTimeout(idleT); try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
    else touchIdle();
  }
  $('btn-lock').addEventListener('click', () => {
    if (S.ed.dirty) { $('editar').hidden = false; edStatus('Guarde ou descarte as alterações antes de bloquear.', 'err'); $('editar').scrollIntoView({ block: 'end' }); return; }
    setAdmin(false);
  });
  let mdlMode = 'login';
  function openModal(mode) {
    mdlMode = mode;
    const set = mode === 'set' || mode === 'change';
    $('mdl-t').textContent = mode === 'set' ? 'Definir palavra-passe de administrador' : mode === 'change' ? 'Nova palavra-passe de administrador' : 'Entrar como administrador';
    $('mdl-n').textContent = mode === 'set' ? 'Ainda não existe palavra-passe. Como dono do painel, defina a palavra-passe que dá acesso à edição dos dados (mínimo 6 caracteres).'
      : mode === 'change' ? 'Escreva a nova palavra-passe duas vezes. A palavra-passe anterior deixa de funcionar.'
      : (S.cfg && S.cfg.hash ? 'Introduza a palavra-passe de administrador para editar os dados.' : 'O dono do painel ainda não definiu a palavra-passe de administrador.');
    $('mdl-l1').textContent = set ? 'Nova palavra-passe' : 'Palavra-passe';
    $('mdl-f2').hidden = !set;
    $('mdl-ok').textContent = set ? 'Guardar palavra-passe' : 'Entrar';
    $('mdl-reset').hidden = !(mode === 'login' && S.isOwner);
    $('mdl-p1').value = ''; $('mdl-p2').value = ''; $('mdl-st').textContent = ''; $('mdl-st').className = 'st';
    $('modal').hidden = false;
    setTimeout(() => $('mdl-p1').focus(), 30);
  }
  const closeModal = () => { $('modal').hidden = true; };
  $('mdl-no').addEventListener('click', closeModal);
  $('modal').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); if (e.key === 'Enter') $('mdl-ok').click(); });
  $('mdl-reset').addEventListener('click', () => openModal('change'));
  $('mdl-ok').addEventListener('click', async () => {
    const st = $('mdl-st'); const p1 = $('mdl-p1').value, p2 = $('mdl-p2').value;
    const err = (t) => { st.textContent = t; st.className = 'st err'; };
    if (!(window.crypto && crypto.subtle)) { err('Este navegador não suporta a verificação da palavra-passe.'); return; }
    if (mdlMode === 'login') {
      if (!S.cfg || !S.cfg.hash) { err('O administrador ainda não definiu a palavra-passe.'); return; }
      st.textContent = 'A verificar…'; st.className = 'st';
      const h = await derive(p1, S.cfg.salt, S.cfg.iter || 150000);
      if (h === S.cfg.hash) { closeModal(); setAdmin(true); openEditor(); }
      else { err('Palavra-passe incorrecta.'); $('mdl-p1').select(); }
      return;
    }
    if (p1.length < 6) { err('A palavra-passe precisa de pelo menos 6 caracteres.'); return; }
    if (p1 !== p2) { err('As duas palavras-passe não coincidem.'); return; }
    st.textContent = 'A guardar…'; st.className = 'st';
    try {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      const iter = 150000;
      const hash = await derive(p1, salt, iter);
      const body = { salt, iter, hash, definido_em: new Date().toISOString() };
      await S.db.doc('config/admin').set(body);
      const wasSet = mdlMode === 'set';
      S.cfg = body; closeModal(); setAdmin(true); openEditor();
      logHist(null, wasSet ? 'Palavra-passe de administrador definida' : 'Palavra-passe de administrador alterada', '');
      edStatus(wasSet ? 'Palavra-passe definida. Está agora como administrador.' : 'Palavra-passe alterada.', 'okk');
    } catch (e) { err(e && e.code === 'invalid_argument' ? 'Só o dono do painel pode definir a palavra-passe.' : 'Não foi possível guardar a palavra-passe. Tente de novo.'); }
  });
  // A edição usa a sessão de administrador da livraria; o servidor (RLS) recusa escritas de outros papéis.
  $('btn-admin').addEventListener('click', () => {
    if (S.admin) { openEditor(); return; }
    if (S.canWrite) { setAdmin(true); openEditor(); }
  });
  $('ed-pass').addEventListener('click', () => openModal('change'));

  // ---------- Editor ----------
  const edStatus = (t, cls) => { const e = $('ed-status'); e.textContent = t || ''; e.className = 'st' + (cls ? ' ' + cls : ''); };
  function edTabs() {
    const ys = yearsList();
    $('ed-tabs').replaceChildren(...ys.map((y) => {
      const b = el('button', 'tab', String(y)); b.type = 'button'; b.setAttribute('role', 'tab');
      b.dataset.ano = String(y); b.setAttribute('aria-selected', String(y === S.ed.ano)); return b;
    }));
    const next = ys.length ? ys[ys.length - 1] + 1 : new Date().getFullYear();
    $('ed-add').textContent = '+ Adicionar ' + next;
    $('ed-add').dataset.ano = String(next);
  }
  function edFill() {
    S.ed.sysUsed = false;
    S.ed.avisos = null;
    sysSubstituirCancelar();
    const Y = S.years[S.ed.ano] || {};
    const grid = $('ed-grid');
    grid.replaceChildren(...MESES.map((mes, i) => {
      const w = el('div', 'mcard' + (Y.mes_em_curso === i + 1 ? ' cur' : ''));
      const v = Y.meses ? Y.meses[i] : null;
      const hd = el('label', 'mh'); hd.htmlFor = 'ed-m' + i; hd.appendChild(el('b', null, mes)); hd.appendChild(el('span', null, v == null ? 'vazio' : Y.mes_em_curso === i + 1 ? 'em curso' : ''));
      const inp = el('input', 'v'); inp.id = 'ed-m' + i; inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
      inp.placeholder = 'vazio'; inp.value = inField(v == null ? null : Number(v)); inp.dataset.orig = inp.value; inp.dataset.i = String(i); inp.setAttribute('aria-label', 'Vendas de ' + mes + ' em Kz');
      const ob = el('input', 'ob'); ob.id = 'ed-o' + i; ob.type = 'text'; ob.autocomplete = 'off'; ob.maxLength = 200; ob.placeholder = 'Observação (opcional)';
      ob.value = Array.isArray(Y.observacoes) ? (Y.observacoes[i] || '') : ''; ob.dataset.orig = ob.value; ob.dataset.i = String(i); ob.setAttribute('aria-label', 'Observação de ' + mes);
      if (S.readOnly) { inp.disabled = true; ob.disabled = true; }
      const sv = el('button', 'sysv'); sv.type = 'button'; sv.dataset.i = String(i); sv.hidden = true;
      w.append(hd, inp, ob, sv); return w;
    }));
    const sc = $('ed-curso');
    sc.replaceChildren(new Option('Nenhum (todos fechados)', ''), ...MESES.map((m, i) => new Option(m, String(i + 1))));
    sc.value = Y.mes_em_curso ? String(Y.mes_em_curso) : ''; sc.dataset.orig = sc.value;
    $('ed-meta').value = inField(Y.meta_anual == null ? null : Number(Y.meta_anual)); $('ed-meta').dataset.orig = $('ed-meta').value;
    $('ed-crit').value = Y.criterio || 'media'; $('ed-crit').dataset.orig = $('ed-crit').value;
    $('ed-fonte').value = Y.fonte || ''; $('ed-fonte').dataset.orig = $('ed-fonte').value;
    [sc, $('ed-meta'), $('ed-crit'), $('ed-fonte')].forEach((c) => { c.disabled = S.readOnly; c.classList.remove('changed', 'invalid'); });
    S.ed.dirty = false;
    edStatus(Y.actualizado ? 'Última gravação de ' + S.ed.ano + ': ' + new Date(Y.actualizado).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '');
    $('ed-save').disabled = true;
    $('ed-del').textContent = 'Apagar ' + S.ed.ano; $('ed-del-confirm').hidden = true;
    sysHints();
  }
  function edCheckDirty() {
    let dirty = false, bad = false;
    root.querySelectorAll('#ed-grid input.v, #ed-meta').forEach((inp) => {
      const ch = inp.value.trim() !== inp.dataset.orig.trim(); const p = parseKz(inp.value);
      inp.classList.toggle('changed', ch && p.ok); inp.classList.toggle('invalid', !p.ok);
      dirty = dirty || ch; bad = bad || !p.ok;
    });
    root.querySelectorAll('#ed-grid input.ob, #ed-fonte').forEach((inp) => { const ch = inp.value !== inp.dataset.orig; inp.classList.toggle('changed', ch); dirty = dirty || ch; });
    [$('ed-curso'), $('ed-crit')].forEach((s) => { dirty = dirty || s.value !== s.dataset.orig; });
    const needMeta = $('ed-crit').value === 'meta' && !parseKz($('ed-meta').value).v;
    S.ed.dirty = dirty;
    $('ed-save').disabled = !dirty || bad || needMeta || S.readOnly;
    edStatus(needMeta ? 'Para usar o critério “Meta anual”, escreva a meta.' : bad ? 'Há valores inválidos (marcados a vermelho).' : dirty ? 'Alterações por guardar.' : '', bad || needMeta ? 'err' : '');
  }
  function openEditor(ano) {
    if (!S.admin) { $('btn-admin').click(); return; }
    $('editar').hidden = false;
    const ys = yearsList();
    S.ed.ano = ano != null ? ano : (S.ano != null ? S.ano : (ys.length ? ys[ys.length - 1] : null));
    edTabs();
    if (S.ed.ano != null) edFill(); else { $('ed-grid').replaceChildren(el('p', 'note', 'Ainda não há anos. Carregue em “+ Adicionar” para criar o primeiro.')); }
    renderHist();
    $('editar').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  $('ed-close').addEventListener('click', () => { if (S.ed.dirty) { edStatus('Guarde ou descarte as alterações antes de fechar.', 'err'); return; } $('editar').hidden = true; });
  $('ed-cancel').addEventListener('click', () => { if (S.ed.ano != null) edFill(); });
  $('editar').addEventListener('input', (ev) => { if (ev.target.closest('#ed-grid, .ed-set')) { S.ed.avisos = null; sysSubstituirCancelar(); edCheckDirty(); } });
  $('editar').addEventListener('change', (ev) => { if (ev.target.closest('.ed-set')) edCheckDirty(); });
  $('editar').addEventListener('blur', (ev) => {
    const inp = ev.target; if (!(inp.matches && inp.matches('#ed-grid input.v, #ed-meta'))) return;
    const p = parseKz(inp.value); if (p.ok) { inp.value = inField(p.v); edCheckDirty(); }
  }, true);
  $('ed-tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('.tab'); if (!b) return;
    if (S.ed.dirty) { edStatus('Guarde ou descarte as alterações antes de mudar de ano.', 'err'); return; }
    S.ed.ano = Number(b.dataset.ano); edTabs(); edFill();
  });
  $('ed-paste-go').addEventListener('click', () => {
    const st = $('ed-paste-st');
    if (S.ed.ano == null) { st.textContent = 'Adicione primeiro um ano.'; return; }
    const lines = $('ed-paste').value.replace(/\r/g, '').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    const vals = lines.map((l) => { const cell = l.split('\t').map((c) => c.trim()).filter(Boolean); return cell.length ? cell[cell.length - 1] : ''; });
    if (!vals.length) { st.textContent = 'Nada para colar.'; return; }
    let bad = 0;
    vals.slice(0, 12).forEach((v, i) => { const p = parseKz(v); if (!p.ok) bad++; $('ed-m' + i).value = p.ok ? inField(p.v) : v; });
    st.textContent = (vals.length > 12 ? 'Só usei as primeiras 12 linhas. ' : '') + (bad ? bad + ' valores não foram reconhecidos. ' : '') + 'Valores aplicados à grelha. Reveja e carregue em Guardar.';
    edCheckDirty();
  });
  // `esperado` = o `actualizado` do ano quando o editor o leu (null para um ano novo): se outra
  // pessoa o gravou entretanto, o servidor recusa (código `conflict`) em vez de repor por cima os
  // meses dela. Devolve { actualizado } do servidor, o `esperado` da gravação seguinte.
  async function writeYear(ano, body, esperado) {
    if (!S.db) throw { code: 'unavailable' };
    return (await S.db.doc('anos/' + ano).set(body, { esperado: esperado || null })) || null;
  }
  // De onde vieram os números (o servidor guarda-o no histórico): sistema, se todos os meses com
  // valor são os das vendas do sistema; misto, se só alguns; manual, se não se usou o sistema.
  function origemDe(ano, meses) {
    const D = S.sys.data;
    if (!S.ed.sysUsed || !D || S.sys.ano !== ano) return 'manual';
    const todos = meses.every((v, i) => v == null || (D.counts[i] && Math.round(v * 100) === Math.round(D.months[i] * 100)));
    return todos ? 'sistema' : 'misto';
  }
  function errMsg(e) {
    if (e && e.code === 'conflict') return (e.message || 'Outra pessoa gravou este ano entretanto.') + ' Copie o que escreveu antes de recarregar a página.';
    if (e && e.code === 'invalid_argument') { S.readOnly = true; return 'Não tem permissão para editar estes dados. Peça a um administrador a permissão «Editar relatórios de vendas».'; }
    if (e && e.code === 'quota_exceeded') return 'O espaço de dados do painel está cheio.';
    return 'Não foi possível guardar agora. Tente de novo dentro de instantes.';
  }
  $('ed-save').addEventListener('click', async () => {
    if (!S.admin || S.ed.ano == null) return;
    const ano = S.ed.ano; const cur = S.years[ano] || {};
    const meses = [], obs = [];
    for (const inp of root.querySelectorAll('#ed-grid input.v')) { const p = parseKz(inp.value); if (!p.ok) { edCheckDirty(); return; } meses[Number(inp.dataset.i)] = p.v; }
    root.querySelectorAll('#ed-grid input.ob').forEach((o) => { obs[Number(o.dataset.i)] = o.value.trim(); });
    const metaP = parseKz($('ed-meta').value);
    const body = Object.assign({}, cur, { ano, meses, observacoes: obs, mes_em_curso: $('ed-curso').value ? Number($('ed-curso').value) : null,
      meta_anual: metaP.ok ? metaP.v : null, criterio: $('ed-crit').value, fonte: $('ed-fonte').value.trim(), actualizado: new Date().toISOString(),
      origem: origemDe(ano, meses) });
    const changes = [];
    MESES.forEach((m, i) => {
      const a = cur.meses ? cur.meses[i] : null, b = meses[i];
      if ((a == null ? null : Number(a)) !== b) changes.push(short(m) + ': ' + (a == null ? 'vazio' : kz(Number(a))) + ' → ' + (b == null ? 'vazio' : kz(b)));
      const oa = Array.isArray(cur.observacoes) ? (cur.observacoes[i] || '') : '';
      if (oa !== obs[i]) changes.push(short(m) + ': observação ' + (obs[i] ? 'actualizada' : 'removida'));
    });
    if ((cur.mes_em_curso || null) !== body.mes_em_curso) changes.push('Mês em curso: ' + (body.mes_em_curso ? MESES[body.mes_em_curso - 1] : 'nenhum'));
    if ((cur.meta_anual == null ? null : Number(cur.meta_anual)) !== body.meta_anual) changes.push('Meta anual: ' + (body.meta_anual ? kz(body.meta_anual) : 'sem meta'));
    if ((cur.criterio || 'media') !== body.criterio) changes.push('Critério: ' + CRIT[body.criterio]);
    if ((cur.fonte || '') !== body.fonte) changes.push('Fonte: ' + (body.fonte || '—'));
    // Valores invulgares nos meses mudados (plausibilidade.js): mostram-se uma vez; a segunda carga
    // em Guardar grava-os. Não são erros — podem estar certos —, mas mudam o crescimento e a projecção.
    const mudados = MESES.map((_, i) => i).filter((i) => (cur.meses && cur.meses[i] != null ? Number(cur.meses[i]) : null) !== meses[i]);
    const ant = S.years[ano - 1];
    const avisos = avisosDePlausibilidade(meses, ant ? ant.meses : null, mudados).map((a) => textoDoAviso(a, ano - 1));
    if (avisos.length && S.ed.avisos !== avisos.join('|')) {
      S.ed.avisos = avisos.join('|');
      edStatus('Confirme estes valores invulgares antes de gravar — ' + avisos.join(' · ') + '. Se estão certos, carregue outra vez em Guardar e, se puder, explique-os na observação do mês.', 'err');
      return;
    }
    $('ed-save').disabled = true; edStatus('A guardar…');
    try {
      const feito = await writeYear(ano, body, cur.actualizado);
      if (feito && feito.actualizado) body.actualizado = feito.actualizado;
      S.years[ano] = body; S.ed.dirty = false; S.ed.avisos = null;
      edFill(); edStatus('Guardado. O painel foi actualizado.', 'okk');
      logHist(ano, 'Dados de ' + ano + ' actualizados', changes.join(' · '));
      if (ano === S.ano || ano === S.comp) render(false); else fillSelectors();
    } catch (e) { edStatus(errMsg(e), 'err'); if (S.readOnly) edFill(); else $('ed-save').disabled = false; }
  });
  $('ed-add').addEventListener('click', async () => {
    if (!S.admin) return;
    if (S.ed.dirty) { edStatus('Guarde ou descarte as alterações antes de adicionar um ano.', 'err'); return; }
    const ano = Number($('ed-add').dataset.ano);
    if (S.years[ano]) { S.ed.ano = ano; edTabs(); edFill(); return; }
    const body = { ano, meses: MESES.map(() => null), observacoes: MESES.map(() => ''), mes_em_curso: null, meta_anual: null, criterio: 'media', fonte: '', actualizado: new Date().toISOString() };
    $('ed-add').disabled = true; edStatus('A criar ' + ano + '…');
    try {
      const feito = await writeYear(ano, body, null);
      if (feito && feito.actualizado) body.actualizado = feito.actualizado;
      S.years[ano] = body; S.ed.ano = ano; edTabs(); edFill(); fillSelectors();
      edStatus(ano + ' adicionado. Preencha os meses e carregue em Guardar.', 'okk');
      logHist(ano, 'Ano ' + ano + ' adicionado', '');
    } catch (e) { edStatus(errMsg(e), 'err'); }
    $('ed-add').disabled = false;
  });
  $('ed-del').addEventListener('click', () => { if (S.ed.ano == null) return; $('ed-del-confirm').hidden = false; $('ed-del-txt').value = ''; $('ed-del-txt').focus(); });
  $('ed-del-no').addEventListener('click', () => { $('ed-del-confirm').hidden = true; });
  $('ed-del-go').addEventListener('click', async () => {
    const ano = S.ed.ano, ms = $('ed-misc-st');
    if ($('ed-del-txt').value.trim() !== String(ano)) { ms.textContent = 'Escreva exactamente ' + ano + ' para confirmar.'; ms.className = 'st err'; return; }
    try {
      await S.db.doc('anos/' + ano).delete();
      delete S.years[ano];
      logHist(ano, 'Ano ' + ano + ' apagado', '');
      ms.textContent = ano + ' foi apagado.'; ms.className = 'st okk';
      if (S.ano === ano) { S.ano = null; S.sel = null; }
      const ys = yearsList(); S.ed.ano = ys.length ? ys[ys.length - 1] : null;
      S.ed.dirty = false; edTabs(); if (S.ed.ano != null) edFill(); render(false);
    } catch (e) { ms.textContent = errMsg(e); ms.className = 'st err'; }
  });
  $('ed-export').addEventListener('click', () => doExport('xlsx', $('ed-misc-st')));

  // ---------- Vendas registadas no sistema ----------
  function sysHints() {
    const D = S.sys.data, ok = !!D && S.sys.ano === S.ed.ano;
    root.querySelectorAll('#ed-grid .sysv').forEach((b) => {
      const i = Number(b.dataset.i);
      const n = ok ? D.counts[i] : 0;
      b.hidden = !n;
      if (n) b.textContent = 'Sistema: ' + kz(D.months[i]) + ' · ' + n + (n === 1 ? ' encomenda' : ' encomendas') + ' — usar';
      b.disabled = S.readOnly;
    });
    $('ed-sys-fill').disabled = !ok || S.readOnly;
    $('ed-sys-all').disabled = !ok || S.readOnly;
  }
  async function sysLoad() {
    const st = $('ed-sys-st');
    if (!S.sales || !S.sales.available) { st.textContent = (S.sales && S.sales.reason) || 'As vendas do sistema não estão disponíveis nesta vista.'; st.className = 'st err'; return; }
    if (S.ed.ano == null) { st.textContent = 'Adicione primeiro um ano.'; st.className = 'st err'; return; }
    const ano = S.ed.ano;
    st.textContent = 'A ler as encomendas de ' + ano + '…'; st.className = 'st';
    $('ed-sys-load').disabled = true;
    try {
      const D = await S.sales.fetch(ano, { paidOnly: $('ed-sys-modo').value === 'paid' });
      if (dead) return;
      S.sys = { ano, data: D };
      const n = D.counts.reduce((a, b) => a + b, 0);
      const tot = D.months.reduce((t, v) => t + Math.round(v * 100), 0) / 100;
      st.textContent = n
        ? n + (n === 1 ? ' encomenda' : ' encomendas') + ' de ' + S.sales.storeName + ' em ' + ano + ': ' + kz(tot) + ' (sem portes). Use os botões por mês ou preencha de uma vez; nada é gravado até carregar em Guardar.'
        : 'Não há encomendas de ' + S.sales.storeName + ' em ' + ano + ' com este critério.';
      if (n) st.textContent += ' Só o site: as vendas ao balcão (KiGest) não entram, por isso o registado da loja é normalmente maior.';
      st.className = 'st' + (n ? ' okk' : '');
      sysHints();
    } catch (e) {
      st.textContent = 'Não foi possível ler as encomendas agora. Tente de novo.'; st.className = 'st err';
    } finally { $('ed-sys-load').disabled = false; }
  }
  function sysSubstituirCancelar() {
    if (!S.ed.substituir) return;
    S.ed.substituir = false;
    $('ed-sys-all').textContent = 'Substituir meses com vendas';
  }
  function sysApply(onlyEmpty) {
    const D = S.sys.data;
    if (!D || S.sys.ano !== S.ed.ano || S.readOnly) return;
    // As vendas do sistema são só as do site: trocar por elas um mês já registado (que inclui o
    // balcão) quase sempre o baixa. Primeiro diz-se o que muda; só a segunda carga aplica.
    if (!onlyEmpty && !S.ed.substituir) {
      const trocas = [];
      D.months.forEach((v, i) => {
        if (!D.counts[i]) return;
        const p = parseKz($('ed-m' + i).value);
        if (p.ok && p.v != null && Math.round(p.v * 100) !== Math.round(v * 100)) trocas.push(short(MESES[i]) + ': ' + kz(p.v) + ' → ' + kz(v));
      });
      if (trocas.length) {
        S.ed.substituir = true;
        $('ed-sys-all').textContent = 'Confirmar: substituir ' + trocas.length + (trocas.length === 1 ? ' mês registado' : ' meses registados');
        $('ed-sys-st').textContent = 'Atenção: o sistema só conhece as encomendas do site; as vendas ao balcão (KiGest) ficam de fora. Vai trocar ' + trocas.join(' · ') + '. Carregue outra vez para confirmar.';
        $('ed-sys-st').className = 'st err';
        return;
      }
    }
    sysSubstituirCancelar();
    let n = 0;
    D.months.forEach((v, i) => {
      if (!D.counts[i]) return; // meses sem encomendas ficam como estão (podem ter valores manuais)
      const inp = $('ed-m' + i);
      if (onlyEmpty && inp.value.trim()) return;
      inp.value = inField(v); n++;
    });
    if (n) S.ed.sysUsed = true;
    $('ed-sys-st').textContent = n ? n + (n === 1 ? ' mês preenchido' : ' meses preenchidos') + ' com as vendas do sistema. Reveja e carregue em Guardar.' : 'Nenhum mês alterado.';
    $('ed-sys-st').className = 'st';
    edCheckDirty();
  }
  $('ed-sys-load').addEventListener('click', sysLoad);
  $('ed-sys-modo').addEventListener('change', () => { S.sys = { ano: null, data: null }; sysHints(); $('ed-sys-st').textContent = ''; });
  $('ed-sys-fill').addEventListener('click', () => { sysSubstituirCancelar(); sysApply(true); });
  $('ed-sys-all').addEventListener('click', () => sysApply(false));
  $('ed-grid').addEventListener('click', (ev) => {
    const b = ev.target.closest('.sysv'); if (!b || S.readOnly) return;
    const D = S.sys.data, i = Number(b.dataset.i);
    if (!D || S.sys.ano !== S.ed.ano) return;
    $('ed-m' + i).value = inField(D.months[i]);
    edCheckDirty();
  });

  // ---------- Exportar ----------
  const lojaNome = () => (S.store && S.store.name) || 'Loja do Huambo';
  const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const estadoDe = (Y, i) => { const v = Y.meses ? Y.meses[i] : null; return v == null ? 'Por preencher' : (Y.mes_em_curso === i + 1 ? 'Em curso' : 'Fechado'); };
  function exportData() {
    const M = S.model;
    return {
      loja: lojaNome(), ano: M.ano, comp: M.comp, crit: M.crit, critTxt: CRIT[M.crit], meta: M.meta,
      fonte: (S.years[M.ano] && S.years[M.ano].fonte) || '',
      geradoEm: new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }),
      logo: logoSrc(), logoClaro: $('logo-claro') ? $('logo-claro').src : '', rows: M.rows, R: M.R,
      filtro: M.filtro ? M.filtro.texto || M.filtro.rotulo : '',
      sys: S.sys.data && S.sys.ano === M.ano ? { counts: S.sys.data.counts } : null,
    };
  }
  function allYearsRows() {
    const rows = [['Loja', 'Ano', 'Mês nº', 'Mês', 'Vendas (Kz)', 'Estado', 'Observação']];
    yearsList().forEach((y) => { const Y = S.years[y]; MESES.forEach((m, i) => {
      const v = Y.meses ? Y.meses[i] : null;
      rows.push([lojaNome(), y, i + 1, m, v == null ? null : Number(v), estadoDe(Y, i), Array.isArray(Y.observacoes) ? (Y.observacoes[i] || '') : '']);
    }); });
    return rows;
  }
  function xlsxSheets(d) {
    const R = d.R, A = d.ano, B = d.comp;
    const resumo = [
      ['Indicador', 'Valor', 'Notas'],
      ['Loja', d.loja, ''],
      ['Ano', String(A), B ? 'comparado com ' + B : 'sem comparação'],
      ...(d.filtro ? [['Filtro', d.filtro, 'os totais contam só os meses do filtro']] : []),
      ['Vendas ' + A + (R.ultimo ? ' (até ' + R.ultimo.mes + ')' : ''), R.ytd2, ''],
      ['Período comparável ' + A, R.ytd2c, 'meses com valor nos dois anos'],
      ['Período comparável ' + (B || '—'), R.ytd1, ''],
      ['Diferença no período comparável', R.dif_ytd, ''],
      ['Crescimento no período comparável', R.cresc_ytd, ''],
      ['Meses fechados ' + A, R.fech2, R.nfech + ' meses'],
      ['Média mensal ' + A + ' (meses fechados)', R.media2, ''],
      ['Média mensal ' + (B || '—'), R.media1, ''],
      ['Melhor mês ' + A, R.melhor ? R.melhor.v2 : null, R.melhor ? R.melhor.mes : ''],
      ['Total registado ' + (B || '—'), R.total1, ''],
      ['Projecção anual ' + A, R.projeccao, 'critério: ' + d.critTxt],
      ['Crescimento da projecção', R.cresc_proj, ''],
      ['Falta para a projecção', R.falta, ''],
      ['Meta anual', d.meta, d.meta ? Math.round((R.metaPct || 0) * 100) + '% atingido' : 'sem meta'],
      ['Fonte', d.fonte || '—', ''],
      ['Gerado em', d.geradoEm, ''],
    ];
    const meses = [['Mês', B ? String(B) : 'Comparação', String(A), 'Estimativa', 'Diferença', 'Crescimento', 'Acumulado ' + (B || ''), 'Acumulado ' + A, 'Estado', 'Observação']];
    d.rows.forEach((r) => meses.push([r.mes, r.v1, r.v2, r.est, r.dif, r.cresc, r.acum1, r.acum2, r.estado, r.obs || '']));
    meses.push(['Total', R.total1, R.ytd2, null, null, null, null, null, '', '']);
    return [
      { name: 'Resumo ' + A, rows: resumo, money: [1], widths: [42, 22, 34], pctRows: [7, 14] },
      { name: 'Meses ' + A, rows: meses, money: [1, 2, 3, 4, 6, 7], pct: [5], widths: [12, 18, 18, 18, 16, 12, 18, 18, 14, 40], boldRows: [meses.length - 1] },
      { name: 'Todos os anos', rows: allYearsRows(), money: [4], widths: [30, 8, 8, 12, 18, 14, 40] },
    ];
  }
  let exporting = false;
  let videoAbort = null;
  async function doExport(fmt, statusEl, opts = {}) {
    const st = statusEl || $('exp-st');
    const say = (t, cls) => { st.textContent = t; st.className = 'st' + (statusEl ? '' : ' exp-st') + (cls ? ' ' + cls : ''); };
    if (!S.model) { say('Ainda não há dados para exportar.', 'err'); return; }
    if (!S.downloads) { say('A exportação não está disponível nesta vista.', 'err'); return; }
    if (exporting) return;
    exporting = true;
    root.querySelectorAll('#exp-menu button').forEach((b) => { b.disabled = true; });
    const d = exportData();
    const base = 'vendas-' + slug(d.loja) + '-' + d.ano;
    try {
      if (fmt === 'xlsx') {
        const sheets = xlsxSheets(d).map((sh) => {
          // Na folha Resumo as linhas de crescimento são percentagens, não Kz.
          if (!sh.pctRows) return sh;
          const rows = sh.rows.map((r, i) => (sh.pctRows.includes(i) && typeof r[1] === 'number' ? [r[0], pct(r[1]), r[2]] : r));
          return { ...sh, rows };
        });
        await S.downloads.save({ filename: base + '.xlsx', data: buildXlsx(sheets) });
        say('Ficheiro Excel pronto.', 'okk');
      } else if (fmt === 'csv') {
        await S.downloads.save({ filename: 'vendas-' + slug(d.loja) + '-todos-os-anos.csv', data: toCsv(allYearsRows()) });
        say('Ficheiro CSV pronto.', 'okk');
      } else if (fmt === 'json') {
        const anos = yearsList().map((y) => ({ ...S.years[y] }));
        const body = { loja: d.loja, gerado_em: new Date().toISOString(), anos, resumo: { ano: d.ano, comparar: d.comp, criterio: d.crit, ...d.R } };
        await S.downloads.save({ filename: base + '.json', data: JSON.stringify(body, null, 2) });
        say('Ficheiro JSON pronto.', 'okk');
      } else if (fmt === 'png') {
        say('A desenhar a imagem…');
        await S.downloads.save({ filename: base + '.png', data: await renderSummaryPng(d) });
        say('Imagem pronta.', 'okk');
      } else if (fmt === 'pdf') {
        await printReport(d);
        say('Relatório aberto noutra janela: escolha “Guardar como PDF” na impressão.', 'okk');
      } else if (fmt === 'video') {
        // O Estúdio de vídeo (estudio-video.js): pré-visualizar com som, a narração e as legendas, e gravar.
        say('A abrir o Estúdio de vídeo…');
        Object.assign(d, await extrasDe(d.ano));
        $('exp-menu').hidden = true; $('btn-exp').setAttribute('aria-expanded', 'false');
        abrirEstudio(root, {
          tipo: 'loja', dados: d, ritmo: opts.ritmo, fundo: $('vid-fundo').value,
          titulo: lojaDe(S.store) + ' · ' + d.ano + (d.comp ? ' vs ' + d.comp : ''),
          guardar: ({ blob, ext, ritmo }) => S.downloads.save({ filename: base + '-video-' + ritmo + '.' + ext, data: blob }),
          aoMudarFundo: (v) => { $('vid-fundo').value = v; },
          aoFechar: () => { if (!dead) $('btn-exp').focus(); },
        });
        say('');
      }
    } catch (e) {
      say((e && e.message) || 'Não foi possível exportar agora.', e && e.name === 'AbortError' ? '' : 'err');
    } finally {
      exporting = false;
      videoAbort = null;
      $('exp-cancel').hidden = true;
      root.querySelectorAll('#exp-menu button').forEach((b) => { b.disabled = false; });
    }
  }
  // Os mais vendidos da loja e as fotografias da biblioteca (para os vídeos), uma vez por ano.
  const extrasCache = {};
  const destaquesPorAno = {};
  async function extrasDe(ano) {
    if (!S.extras) return { destaques: null, fotos: [] };
    if (!extrasCache[ano]) extrasCache[ano] = S.extras(ano).catch(() => ({ destaques: null, fotos: [] }));
    return extrasCache[ano];
  }
  // A duração de cada vídeo, calculada do plano (o lento tem um quadro por mês, de Janeiro a Dezembro).
  function videoLabels(M, destaques = destaquesPorAno[M.ano] || null) {
    const d = { rows: M.rows, destaques };
    const n = M.rows.length;
    $('vid-lento').textContent = fmtDuracao(duracaoPlano(planoVideo(d, 'lento'))) + ' · para analisar: os ' + n + ' meses, um a um';
    $('vid-normal').textContent = fmtDuracao(duracaoPlano(planoVideo(d, 'normal'))) + ' · os mesmos quadros, mais depressa';
    $('vid-curto').textContent = fmtDuracao(duracaoPlano(planoVideo(d, 'curto'))) + ' · só o resumo do ano';
  }
  $('exp-cancel').addEventListener('click', () => { if (videoAbort) videoAbort.abort(); });
  $('btn-exp').addEventListener('click', () => {
    const menu = $('exp-menu'); menu.hidden = !menu.hidden;
    $('btn-exp').setAttribute('aria-expanded', String(!menu.hidden));
    // Ao abrir, a duração dos vídeos passa a contar com os quadros dos mais vendidos (se os houver).
    if (!menu.hidden && S.model) {
      const M = S.model;
      extrasDe(M.ano).then((x) => { destaquesPorAno[M.ano] = x.destaques; if (S.model === M) videoLabels(M); });
    }
  });
  // O fundo dos vídeos fica lembrado neste aparelho.
  try { const f = localStorage.getItem('relatorios:video:fundo'); if (f) $('vid-fundo').value = f; } catch (e) { /* sem armazenamento */ }
  $('vid-fundo').addEventListener('change', () => { try { localStorage.setItem('relatorios:video:fundo', $('vid-fundo').value); } catch (e) { /* idem */ } });
  $('exp-menu').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-fmt]'); if (!b) return;
    doExport(b.dataset.fmt, null, { ritmo: b.dataset.ritmo });
  });

  // ---------- Histórico ----------
  let histWriting = Promise.resolve();
  function logHist(ano, accao, detalhe) {
    if (!S.db) return;
    // Com o histórico do servidor (vendas_alteracoes), quem gravou e o que mudou ficam lá, escritos
    // pelo gatilho na mesma transacção. O documento <loja>/historico/registo, que este painel
    // escrevia, podia ser reescrito por quem grava: deixou de ser escrito e de ser mostrado.
    if (S.historico) { renderHist(); return; }
    const entry = { em: new Date().toISOString(), por: S.uid || null, ano: ano || null, accao, detalhe: String(detalhe || '').slice(0, 900) };
    S.hist = [entry].concat(S.hist || []).slice(0, 150); renderHist();
    const list = S.hist;
    histWriting = histWriting.then(() => S.db.doc('historico/registo').set({ entradas: list })).catch(() => {});
  }
  async function renderHistServidor() {
    const ul = $('ed-hist');
    let lista = null;
    try { lista = await S.historico(null); } catch (e) { lista = null; }
    if (dead) return;
    if (lista == null) { ul.replaceChildren(el('li', null, 'Não foi possível ler o histórico agora.')); return; }
    if (!lista.length) { ul.replaceChildren(el('li', null, 'Sem gravações registadas no servidor para esta loja.')); return; }
    const accao = { insert: 'Criou', update: 'Alterou', delete: 'Apagou' };
    const origem = { manual: 'à mão', sistema: 'do sistema', misto: 'várias origens', importacao: 'importação' };
    const nomes = { mes_em_curso: 'mês em curso', meta_anual: 'meta', criterio: 'critério', fonte: 'fonte', observacoes: 'observações' };
    ul.replaceChildren(...lista.slice(0, 40).map((h) => {
      const li = el('li');
      li.appendChild(el('span', null, new Date(h.em).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })));
      const t = el('span');
      t.appendChild(el('b', null, (accao[h.accao] || h.accao) + ' ' + h.ano));
      t.appendChild(document.createTextNode(' · ' + h.quem + (h.origem && origem[h.origem] ? ' · ' + origem[h.origem] : '')));
      li.appendChild(t);
      const det = (h.meses || []).map((m) => short(MESES[m.mes - 1]) + ': ' + (m.de == null ? 'vazio' : kz(Number(m.de))) + ' → ' + (m.para == null ? 'vazio' : kz(Number(m.para))))
        .concat(Object.keys(h.outros || {}).map((k) => (nomes[k] || k) + ' alterado'));
      if (det.length) li.appendChild(el('span', 'd', det.join(' · ')));
      return li;
    }));
  }
  async function renderHist() {
    if (S.historico) return renderHistServidor();
    const ul = $('ed-hist');
    const items = (S.hist || []).slice(0, 40);
    if (!items.length) { ul.replaceChildren(el('li', null, 'Sem alterações registadas.')); return; }
    let names = {};
    try { const ids = [...new Set(items.map((h) => h.por).filter(Boolean))]; if (S.user && ids.length) names = (await S.user.profiles(ids)) || {}; } catch (e) { names = {}; }
    ul.replaceChildren(...items.map((h) => {
      const li = el('li');
      li.appendChild(el('span', null, new Date(h.em).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })));
      const who = (h.por && names[h.por] && names[h.por].name) || 'Administrador';
      const t = el('span'); t.appendChild(el('b', null, h.accao)); t.appendChild(document.createTextNode(' · ' + who)); li.appendChild(t);
      if (h.detalhe) li.appendChild(el('span', 'd', h.detalhe));
      return li;
    }));
  }

  // ---------- Modo apresentação ----------
  // Os controlos (botões, teclado, toque, ecrã inteiro, reprodução) estão em apresentacao.js, iguais
  // aos de Todas as livrarias; aqui fica a lista dos diapositivos e o desenho de cada um.
  const logoSrc = () => $('logo-img').src;
  const mvDoAno = (ano) => (S.mv && S.mv.ano === ano ? S.mv.itens : []);
  function slideList(M) {
    return diapositivos(M.rows, { fotos: fotosDaLoja(S.store).length, maisVendidos: mvDoAno(M.ano).length });
  }
  function abs(cls, css, text) { const e = el('div', cls, text); if (css) Object.assign(e.style, css); return e; }
  function head(s, M, sub) {
    const terra = S.store ? cidadeDaLoja(S.store) || S.store.name : 'Huambo';
    s.append(abs('s-h', null, 'PAINEL DE VENDAS — ' + terra.toUpperCase()), abs('s-sub', null, sub));
    const lg = el('img', 's-logo'); lg.src = logoSrc(); lg.alt = ''; s.appendChild(lg);
    s.appendChild(abs('s-foot', null, 'Livraria e Editora Adventista · ' + lojaDe(S.store) + ' · ' + M.ano));
  }
  function desenharDiapositivo(s, it, { depois }) {
    const M = S.model;
    const B = M.comp, A = M.ano, R = M.R;
    if (it.k === 'capa') {
      s.classList.add('dark');
      s.appendChild(abs('s-cover-glow'));
      // A capa é escura: o logótipo branco (PNG transparente), sem caixa.
      const lg = el('div', 's-cover-logo'); const im = el('img'); im.src = $('logo-claro') ? $('logo-claro').src : logoSrc(); im.alt = ''; lg.appendChild(im); s.appendChild(lg);
      // À direita, a parede de capas do topo do painel: os mais vendidos e, a completar, o catálogo.
      const parede = abs('s-cover-capas'); parede.setAttribute('aria-hidden', 'true');
      pintarParede(parede, capasParaFundo(mvDoAno(A), { n: 16, chave: `${S.store ? S.store.name : ''}:${A}` }), { colunas: 4 });
      s.append(parede, abs('s-cover-fade'));
      s.append(abs('s-cover-eye', null, lojaDe(S.store).toUpperCase()), abs('s-cover-t', null, 'PAINEL DE VENDAS ' + A),
        abs('s-cover-s', null, (B != null ? 'Comparativo ' + B + ' vs ' + A + ' · ' : '') + 'Livraria e Editora Adventista, S.A.'));
    } else if (it.k === 'loja') {
      s.classList.add('dark');
      const fotos = fotosDaLoja(S.store);
      s.append(abs('s-loja-eye', null, 'A LOJA'), abs('s-loja-t', null, lojaDe(S.store)));
      const lg = el('img', 's-logo'); lg.src = $('logo-claro') ? $('logo-claro').src : logoSrc(); lg.alt = ''; s.appendChild(lg);
      const grade = abs('s-loja-grade s-n' + Math.min(fotos.length, 3));
      fotos.slice(0, 3).forEach((f, i) => {
        const c = el('figure', 's-foto'); c.style.animationDelay = (0.15 + i * 0.18) + 's';
        fotoEm(c, f.url, i);
        if (f.caption) c.appendChild(el('figcaption', null, f.caption));
        grade.appendChild(c);
      });
      s.appendChild(grade);
      s.appendChild(abs('s-foot', null, 'Livraria e Editora Adventista, S.A. — ' + lojaDe(S.store)));
    } else if (it.k === 'mv') {
      head(s, M, 'Os mais vendidos de ' + A + ' · unidades vendidas no ano');
      const itens = mvDoAno(A).slice(0, 6);
      const lista = el('ol', 's-mv'); lista.style.setProperty('--n', String(itens.length));
      pintarMaisVendidos(lista, itens, { n: 6, fmt: { unid: (n) => `${grpUn(n)} ${Number(n) === 1 ? 'unidade' : 'unidades'}`, kz } });
      lista.querySelectorAll('.mv-i').forEach((li, i) => { li.style.animationDelay = (0.2 + i * 0.12) + 's'; });
      s.appendChild(lista);
    } else if (it.k === 'resumo') {
      head(s, M, 'Resumo do ano · ' + (R.ultimo ? 'até ' + R.ultimo.mes + (R.ultimo.estado === 'Em curso' ? ' (em curso)' : '') : 'sem dados'));
      const tiles = el('div', 's-tiles');
      const T = (k, d) => { const t = el('div', 's-tile'); t.append(el('div', 'k', k)); const vv = el('div', 'v', '—'); t.append(vv); t.append(el('div', 'd', d)); tiles.appendChild(t); return vv; };
      const vs = [
        [T('Vendas ' + A, R.cresc_ytd != null ? pct(R.cresc_ytd) + ' vs mesmos meses de ' + B : ''), R.ytd2],
        [T('Meses fechados', R.cresc_fech != null ? pct(R.cresc_fech) + ' vs ' + kz(R.fech1) : ''), R.fech2],
        [T('Média mensal ' + A, R.media1 != null ? 'vs ' + kz(R.media1) + ' em ' + B : ''), R.media2],
        [T('Melhor mês', R.melhor ? R.melhor.mes + (R.melhor.cresc != null ? ' · ' + pct(R.melhor.cresc) : '') : '—'), R.melhor ? R.melhor.v2 : null],
        [T('Projecção anual ' + A, 'Critério: ' + CRIT[M.crit]), R.projeccao],
        [T(B != null ? 'Total ' + B : (M.meta ? 'Meta anual' : 'Falta para a projecção'), B != null ? 'ano completo' : ''), B != null ? R.total1 : (M.meta || R.falta)],
      ];
      s.appendChild(tiles);
      vs.forEach(([e, v], i) => countUp(e, v, kz, 1200, 200 + i * 90));
      const sv = d3.select(s).append('svg').attr('width', 1184).attr('height', 176).style('position', 'absolute').style('left', '48px').style('bottom', '50px');
      const x = d3.scaleBand().domain(MESES).range([0, 1184]).paddingInner(0.3);
      const xi = d3.scaleBand().domain(['1', '2']).range([0, x.bandwidth()]).padding(0.1);
      const mx = d3.max(M.rows, (r) => Math.max(r.v1 || 0, r.v2 || 0, r.est || 0)) || 1;
      const y = d3.scaleLinear().domain([0, mx]).range([150, 6]);
      const g = sv.selectAll('g').data(M.rows).join('g').attr('transform', (r) => `translate(${x(r.mes)},0)`);
      const r1 = g.filter((r) => r.v1 != null).append('rect').attr('x', xi('1')).attr('width', xi.bandwidth()).attr('rx', 4).attr('fill', '#B5B7BA').attr('y', 150).attr('height', 0);
      const r2 = g.filter((r) => r.v2 != null || r.est != null).append('rect').attr('x', xi('2')).attr('width', xi.bandwidth()).attr('rx', 4)
        .attr('fill', (r) => r.v2 != null ? '#EF8DB8' : 'rgba(224,103,154,.1)').attr('stroke', (r) => r.v2 != null ? 'none' : C2).attr('stroke-dasharray', '4 3').attr('y', 150).attr('height', 0);
      const tr = (sel, f, d0) => sel.transition().delay((r) => (reduce ? 0 : d0 + r.i * 60)).duration(reduce ? 0 : 800).ease(d3.easeCubicOut).attr('y', (r) => y(f(r))).attr('height', (r) => 150 - y(f(r)));
      tr(r1, (r) => r.v1, 700); tr(r2, (r) => r.v2 != null ? r.v2 : r.est, 800);
      g.append('text').attr('x', x.bandwidth() / 2).attr('y', 170).attr('text-anchor', 'middle').style('font-size', '13px').style('fill', '#6A7076').style('font-family', 'var(--font)').text((r) => short(r.mes));
    } else if (it.k === 'mes') {
      const r = it.r;
      head(s, M, r.mes + ' · Comparativo ' + (B != null ? B + ' vs ' : '') + A);
      const kp = el('div', 's-kpis');
      const K = (k, v, cls) => { const c = el('div', 's-kpi ' + (cls || '')); c.append(el('div', 'k', k)); const vv = el('div', 'v', v); c.append(vv); kp.appendChild(c); return vv; };
      // Como no PowerPoint das lojas: o período até ao mês, em cima; o mês, no gráfico.
      const P = periodoAte(M, r.i);
      K('Período em apresentação até', r.mes, 'mes');
      const k1 = K('Venda periódica ' + (B != null ? B : '—'), '—');
      const k2 = K('Venda periódica ' + A, '—');
      const k3 = K('Crescimento periódico', '—');
      s.appendChild(kp);
      const card = abs('s-card', { left: '48px', top: '256px', width: '780px', height: '400px' });
      card.appendChild(abs('s-ct', null, 'Venda mensal'));
      const bars = el('div', 's-bars');
      const mx = d3.max(M.rows, (q) => Math.max(q.v1 || 0, q.v2 || 0, q.est || 0)) || 1;
      const mk = (cls, label, yr) => { const b = el('div', 's-bar ' + cls); const v = el('div', 'v', ''); const bb = el('div', 'b'); const l = el('div', 'l'); l.append(document.createTextNode(label + ' - ')); l.append(el('em', null, String(yr))); b.append(v, bb, l); bars.appendChild(b); return { b, v, bb }; };
      const b1 = mk('y1', r.mes, B != null ? B : '—');
      const b2 = mk('y2' + (r.estado === 'Em curso' ? ' partial' : r.estado === 'Por preencher' ? ' est' : ''), r.mes, A);
      card.appendChild(bars);
      const gr = el('div', 's-growth'); gr.append(el('div', 'k', 'Crescimento mensal')); const gv = el('div', 'g', '—'); gr.append(gv); const gd = el('div', 'd', ''); gr.append(gd); card.appendChild(gr);
      s.appendChild(card);
      const det = abs('s-card s-det', { left: '852px', top: '256px', width: '380px', height: '400px' });
      det.appendChild(abs('s-ct', null, 'Detalhe de ' + r.mes));
      const row2 = (top, k, v) => { const d = abs('row2', { top: top + 'px' }); d.append(el('span', null, k), el('b', null, v)); det.appendChild(d); };
      const ab = B != null ? `${String(B).slice(-2)}/${String(A).slice(-2)}` : String(A);
      row2(66, 'Média mensal ' + (B != null ? B : '—'), B != null ? kz(P.media1) : '—');
      row2(94, 'Média mensal ' + A, kz(P.media2));
      row2(122, 'Diferença mensal ' + ab, P.difMensal != null ? kzs(P.difMensal) : '—');
      row2(150, 'Diferença periódica ' + ab, P.difPeriodica != null ? kzs(P.difPeriodica) : '—');
      row2(178, 'Estado do mês', r.estado);
      const sq = el('div', 's-seq'); sq.append(el('div', 'h', 'Sequência de apresentação'));
      const i1 = el('div', 'i a', '1º  ' + (B != null ? B : '—')), i2 = el('div', 'i b', '2º  ' + A), i3 = el('div', 'i c', '3º  Crescimento');
      sq.append(i1, i2, i3); det.appendChild(sq);
      if (r.obs) det.appendChild(abs('s-obs', null, '“' + r.obs + '”'));
      s.appendChild(det);
      const val2 = r.v2 != null ? r.v2 : r.est;
      const hh = (v) => v == null ? '0' : (v / mx * 86) + '%';
      const f2 = (v) => (r.v2 == null && v != null ? '≈ ' : '') + kz(v);
      depois(() => { i1.classList.add('on'); b1.b.classList.add('on'); b1.bb.style.height = hh(r.v1); countUp(b1.v, r.v1, kz, 800); if (B != null) countUp(k1, P.venda1, kz, 800); }, 400);
      depois(() => { i2.classList.add('on'); b2.b.classList.add('on'); b2.bb.style.height = hh(val2); countUp(b2.v, val2, f2, 800); countUp(k2, P.venda2, kz, 800); }, 1400);
      depois(() => {
        i3.classList.add('on'); gr.classList.add('on');
        const cls = r.cresc == null ? 's-mut' : r.cresc >= 0 ? 's-ok' : 's-bad';
        gv.className = 'g ' + cls;
        k3.className = 'v ' + (P.crescimento == null ? 's-mut' : P.crescimento >= 0 ? 's-ok' : 's-bad');
        if (P.crescimento != null) countUp(k3, P.crescimento, pct, 1000); else k3.textContent = '—';
        if (r.cresc != null) countUp(gv, r.cresc, pct, 1000);
        else { gv.textContent = r.estado === 'Por preencher' ? 'Por preencher' : '—'; gv.style.fontSize = '30px'; }
        gd.textContent = r.dif != null ? kzs(r.dif) + (r.estado === 'Em curso' ? ' · mês em curso' : '') : (r.est != null ? 'Estimativa: ' + CRIT[M.crit] : '');
      }, 2400);
    } else if (it.k === 'quadro') {
      head(s, M, 'Quadro geral · valores em Kwanzas (AOA)');
      const box = el('div', 's-table'); const tb = el('table');
      const th = el('thead'); const hr = el('tr'); ['Mês', B != null ? String(B) : '—', String(A), 'Crescimento'].forEach((t) => hr.appendChild(el('th', null, t))); th.appendChild(hr);
      const body = el('tbody');
      M.rows.forEach((r, i) => {
        const tr = el('tr', 'r');
        tr.append(el('td', null, r.mes + (r.estado === 'Em curso' ? ' (em curso)' : '')), el('td', null, kz(r.v1)),
          el('td', r.v2 == null ? 's-mut' : null, r.v2 != null ? kz(r.v2) : (r.est != null ? '≈ ' + kz(r.est) : '—')),
          el('td', r.cresc == null ? 's-mut' : r.cresc >= 0 ? 's-ok' : 's-bad', r.cresc == null ? '—' : pct(r.cresc)));
        body.appendChild(tr);
        depois(() => tr.classList.add('on'), 200 + i * 90);
      });
      const tf = el('tfoot'); const fr = el('tr');
      fr.append(el('td', null, 'Total comparável'), el('td', null, kz(R.ytd1)), el('td', null, kz(R.ytd2c)), el('td', R.cresc_ytd == null ? 's-mut' : R.cresc_ytd >= 0 ? 's-ok' : 's-bad', pct(R.cresc_ytd)));
      tf.appendChild(fr);
      tb.append(th, body, tf); box.appendChild(tb); s.appendChild(box);
    } else if (it.k === 'acum') {
      head(s, M, 'Acumulado do ano e projecção · critério: ' + CRIT[M.crit]);
      const box = el('div', 's-chart'); s.appendChild(box);
      requestAnimationFrame(() => drawAcumInto(box, 1150, 500, S.modelAno || M, true, { fs: 15, sw: 3, grid: '#ECEAE6', axis: '#C9C7C2', muted: '#6A7076', fg: '#1E2124', ok: '#1E8449', dur: 2000 }));
    } else if (it.k === 'persp') {
      s.classList.add('dark');
      const fundo = fotosDaLoja(S.store)[0];
      if (fundo) s.append(fotoEm(abs('s-bg-foto'), fundo.url, 0), abs('s-bg-veu'));
      s.appendChild(abs('s-rem-t', null, 'REMARQUE:'));
      s.appendChild(abs('s-foot', null, 'Livraria e Editora Adventista, S.A. — ' + lojaDe(S.store)));
      const c1 = abs('s-rem-card', { left: '80px' }); c1.appendChild(abs('k', null, 'PERSPECTIVA ANUAL'));
      const bx1 = abs('s-rem-box pink'); const a = el('div', 'a');
      if (B != null) { a.append(document.createTextNode(B + ' – ')); a.append(el('b', null, grp(R.total1))); a.append(document.createTextNode(' AOA')); }
      bx1.append(a, el('div', 'a', 'Previsão para ' + A + ':')); const pv = el('div', 'big', '—'); bx1.append(pv);
      bx1.append(el('div', 'sm', (R.cresc_proj != null ? pct(R.cresc_proj) + ' face a ' + B + ' · ' : '') + CRIT[M.crit]));
      c1.appendChild(bx1); s.appendChild(c1);
      const c2 = abs('s-rem-card', { left: '680px' }); c2.appendChild(abs('k', null, M.meta ? 'META ' + A : 'SITUAÇÃO ACTUAL'));
      const bx2 = abs('s-rem-box'); bx2.append(el('div', 'a', 'VALOR ACTUAL' + (R.ultimo ? ' (JAN–' + short(R.ultimo.mes).toUpperCase() + ')' : '') + ':'));
      const va = el('div', 'big g', '—'); bx2.append(va);
      bx2.append(el('div', 'sm', M.meta ? Math.round(R.metaPct * 100) + '% da meta de ' + grp(M.meta) : (R.falta != null ? 'Faltam ' + grp(R.falta) + ' para a previsão' : '')));
      c2.appendChild(bx2); s.appendChild(c2);
      depois(() => { countUp(pv, R.projeccao, grp, 1400); }, 300);
      depois(() => { countUp(va, R.ytd2, grp, 1400); }, 700);
    }
  }
  const PRES = montarApresentacao({
    $, listen, reduce,
    lista: () => (S.model ? slideList(S.model) : []),
    desenhar: desenharDiapositivo,
    aoAbrir: () => { stopPlay(); clearTimers(); },
  });

  // ---------- Filtros avançados ----------
  FIL = montarFiltros(root, {
    chave: 'relatorios:filtros:loja',
    ultimo: () => ultimoDe(S.modelAno),
    onChange: () => { if (S.ano != null && $('pres').hidden) { clearTimers(); stopPlay(); render(true); } },
  });
  offs.push(() => FIL.desmontar());

  // ---------- Ligação aos dados ----------
  (async () => {
    const { db, user, downloads, store, sales, extras, historico } = api;
    S.historico = historico || null;
    S.downloads = downloads;
    S.extras = extras || null;
    S.store = store || null; S.sales = sales || null;
    if (S.store) $('eyebrow').textContent = 'Livraria e Editora Adventista · ' + S.store.name;
    $('foot').textContent = 'Livraria e Editora Adventista, S.A. · ' + lojaDe(S.store);
    if (!S.sales || !S.sales.available) $('ed-sys-note').textContent = (S.sales && S.sales.reason) || 'As vendas do sistema não estão disponíveis nesta vista.';
    S.db = db; S.user = user;
    try { S.uid = user ? await user.id() : null; } catch (e) { S.uid = null; }
    try { S.isOwner = user ? !!(await user.isOwner()) : false; } catch (e) { S.isOwner = false; }
    let can = null; try { can = user ? await user.can('data.write') : null; } catch (e) { can = null; }
    if (dead) return;
    S.canWrite = can;
    if (can === false) S.readOnly = true;
    $('btn-admin').hidden = can === false;
    let first = true;
    offs.push(db.collection('anos').onSnapshot((snap) => {
      const ys = {};
      snap.docs.forEach((d) => { if (!d.exists) return; const v = d.data(); const n = Number(v.ano || d.id); if (isFinite(n)) ys[n] = { ...v, ano: n, meses: Array.isArray(v.meses) ? v.meses.slice(0, 12).concat(Array(12).fill(null)).slice(0, 12) : MESES.map(() => null) }; });
      S.years = ys;
      if ($('pres').hidden) render(first); else { S.modelAno = build(S.ano, S.comp); S.model = filtrar(S.modelAno); }
      first = false;
      if (!$('editar').hidden) { edTabs(); if (!S.ed.dirty && S.ed.ano != null && S.years[S.ed.ano]) edFill(); }
    }, () => { if (!S.model) showEmpty('Não foi possível ler os dados agora. Recarregue a página.'); }));
    offs.push(db.doc('notas/relatorio-2025-26').onSnapshot((d) => { S.note = d.exists ? d.data() : null; if (S.model) fillConf(S.model); }, () => {}));
    if (!S.historico) offs.push(db.doc('historico/registo').onSnapshot((d) => { const v = d.exists ? d.data() : null; S.hist = v && Array.isArray(v.entradas) ? v.entradas : []; if (!$('editar').hidden) renderHist(); }, () => {}));
    offs.push(db.doc('config/admin').onSnapshot((d) => {
      S.cfg = d.exists ? d.data() : null;
      if (!S.admin && S.cfg && S.cfg.hash) {
        try { const t = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); if (t && t.h === S.cfg.hash && Date.now() - t.t < IDLE_MS) setAdmin(true); } catch (e) {}
      }
      if (S.admin && S.cfg && S.cfg.hash) touchIdle();
    }, () => { S.cfg = null; }));
  })();

  return () => {
    dead = true;
    clearTimers(); clearTimeout(rz); clearTimeout(idleT);
    PRES.desmontar();
    if (!$('pres').hidden) {
      document.documentElement.style.overflow = '';
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    }
    offs.forEach((off) => off());
  };
}
