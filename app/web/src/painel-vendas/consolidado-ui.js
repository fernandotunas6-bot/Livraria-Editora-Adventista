/**
 * O ecrã do relatório conjunto das livrarias (separador «Todas as livrarias» do Painel Admin).
 * mountConsolidado(root, api) desenha-o dentro de `root` (um Shadow DOM, como o painel de cada loja)
 * e devolve a função que o desmonta. `api` vem de createConsolidadoApi() (adapter.js).
 *
 * Os números vêm de buildConsolidado() (consolidado.js), os vídeos de video.js e o Excel/CSV de
 * exportar.js: aqui só se desenha, se exporta e se lança. Quem pode lançar (api.canEdit) vê a
 * grelha lojas × meses; quem só vê tem o resto, incluindo a conferência com as vendas do sistema.
 */
import * as d3 from 'd3';
import { MESES, MESES_CURTOS } from './modelo.js';
import { aplicarSistema, anosDisponiveis, buildConsolidado, linhasTodosOsAnos, matrizLojasMeses } from './consolidado.js';
import { buildXlsx, toCsv } from './exportar.js';
import { aplicarPptx, lerPainelPptx, lojaDoPptx } from './pptx.js';
import { RITMOS, duracaoPlano, fmtDuracao, planoVideoConjunto, quadroDoVideo, renderVideoConjunto } from './video.js';
import { estiloBaseImpressao } from '../lib/fontes.js';

export function mountConsolidado(root, api) {
  const $ = (id) => root.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C1 = '#9A9EA5';
  const C2 = '#E0679A';
  const offs = [];
  const listen = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); offs.push(() => target.removeEventListener(type, fn, opts)); };
  let dead = false;

  // ---------- Formatação (com cêntimos, como o painel de cada loja) ----------
  const grp = (n) => {
    if (n == null || !isFinite(n)) return '—';
    const [i, d] = (Math.round(Math.abs(n) * 100) / 100).toFixed(2).split('.');
    return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + d;
  };
  const kz = (n) => (n == null || !isFinite(n) ? '—' : grp(n) + ' Kz');
  const kzs = (n) => (n == null || !isFinite(n) ? '—' : (n >= 0 ? '+' : '') + grp(n) + ' Kz');
  const pct = (p) => (p == null || !isFinite(p) ? '—' : (p >= 0 ? '+' : '−') + Math.abs(p * 100).toFixed(1).replace('.', ',') + '%');
  const pctS = (p) => (p == null || !isFinite(p) ? '—' : (p * 100).toFixed(1).replace('.', ',') + '%');
  const mi = (n) => (n < 0 ? '−' : '') + (Math.abs(n) / 1e6).toFixed(1).replace('.', ',') + ' M';
  const inField = (n) => (n == null ? '' : (Math.round(n * 100) / 100).toFixed(Number.isInteger(n) ? 0 : 2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  function parseKz(s) {
    let t = String(s || '').trim().replace(/[\s  ]/g, '').replace(/kz$/i, '');
    if (!t) return { ok: true, v: null };
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const v = Number(t);
    return isFinite(v) && v >= 0 ? { ok: true, v: Math.round(v * 100) / 100 } : { ok: false };
  }
  const cls = (v) => (v == null || !isFinite(v) ? 'mut' : v >= 0 ? 'pos' : 'neg');
  const el = (tag, c, text) => { const e = document.createElement(tag); if (c) e.className = c; if (text != null) e.textContent = text; return e; };
  const dot = (cor) => { const d = el('span', 'dot'); d.style.background = cor; return d; };
  const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function countUp(e, to, fmt, dur = 900) {
    if (reduce || to == null || !isFinite(to)) { e.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (now) => {
      if (!e.isConnected || dead) return;
      const t = Math.min(1, (now - t0) / dur);
      e.textContent = fmt(to * easeOut(t));
      if (t < 1) requestAnimationFrame(tick); else e.textContent = fmt(to);
    };
    requestAnimationFrame(tick);
  }
  const logoSrc = () => $('logo-img').src;

  // ---------- Estado ----------
  const anoActual = new Date().getFullYear();
  const S = {
    lojas: [], anos: [], ano: null, comp: undefined, c: null, modo: 'valor',
    sys: { ano: null, modo: 'paid', data: null },
    nota: { ano: null, texto: '' },
    ed: { open: false, ano: null, dirty: false },
  };

  // ---------- Carregar ----------
  async function carregar() {
    try {
      S.lojas = await api.carregar();
    } catch (e) {
      if (dead) return;
      $('takeaway').textContent = 'Não foi possível ler as vendas agora. Recarregue a página dentro de instantes.';
      return;
    }
    if (dead) return;
    S.anos = anosDisponiveis(S.lojas);
    if (S.ano == null || (!S.anos.includes(S.ano) && S.ano !== anoActual)) {
      S.ano = S.anos.includes(anoActual) ? anoActual : (S.anos.length ? S.anos[S.anos.length - 1] : anoActual);
    }
    if (S.comp === undefined) S.comp = S.anos.includes(S.ano - 1) ? S.ano - 1 : null;
    fillSelectors();
    render(true);
    carregarNota();
    carregarHist();
  }

  function fillSelectors() {
    const anos = [...new Set([...S.anos, anoActual, S.ano])].filter((a) => a != null).sort((a, b) => b - a);
    const sa = $('sel-ano');
    sa.replaceChildren(...anos.map((a) => { const o = el('option', null, String(a)); o.value = a; o.selected = a === S.ano; return o; }));
    const sc = $('sel-comp');
    const none = el('option', null, 'Sem comparação'); none.value = '';
    sc.replaceChildren(none, ...anos.filter((a) => a !== S.ano).map((a) => { const o = el('option', null, String(a)); o.value = a; o.selected = a === S.comp; return o; }));
    if (S.comp == null) none.selected = true;
    sa.disabled = false; sc.disabled = false;
  }
  $('sel-ano').addEventListener('change', () => {
    S.ano = Number($('sel-ano').value);
    S.comp = S.anos.includes(S.ano - 1) ? S.ano - 1 : null;
    fillSelectors(); render(true); carregarNota(); carregarHist();
  });
  $('sel-comp').addEventListener('change', () => { S.comp = $('sel-comp').value ? Number($('sel-comp').value) : null; render(false); });

  // ---------- Desenhar tudo ----------
  function render(animate) {
    const c = buildConsolidado(S.lojas, S.ano, S.comp);
    c.geradoEm = new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
    c.logo = logoSrc();
    c.nota = S.nota.ano === S.ano ? S.nota.texto : '';
    S.c = c;
    root.querySelectorAll('.lgA').forEach((e) => { e.textContent = c.comp != null ? String(c.comp) : '—'; });
    root.querySelectorAll('.lgB').forEach((e) => { e.textContent = String(c.ano); });
    $('btn-exp').disabled = false;
    $('btn-edit').hidden = !api.canEdit;
    $('ro-badge').hidden = !!api.canEdit;
    fillTake(c); fillKpis(c, animate); fillPend(c);
    drawRede(c, animate); fillRank(c); drawAcum(c); drawCresc(c);
    fillMx(c); fillLojas(c); fillSys(); videoLabels(c);
    if (S.ed.open) edRender();
  }

  function fillTake(c) {
    const R = c.total.R;
    const t = $('takeaway');
    t.replaceChildren();
    if (!c.nComDados) {
      t.textContent = `Ainda não há vendas registadas em ${c.ano}.` + (api.canEdit ? ' Use «Lançar vendas» para as escrever à mão ou a partir das vendas do sistema.' : '');
      return;
    }
    const b = (s) => el('b', null, s);
    t.append(`Em ${c.ano}, ${c.nComDados === 1 ? 'a livraria registou' : `as ${c.nComDados} livrarias registaram`} `, b(kz(R.ytd2)));
    if (R.ultimo) t.append(` até ${R.ultimo.mes}`);
    if (R.cresc_ytd != null) {
      const s = el('span', R.cresc_ytd >= 0 ? 'up' : 'dn', ` ${pct(R.cresc_ytd)}`);
      t.append(',', s, ` nas lojas comparáveis face a ${c.comp}`);
    }
    t.append('. ');
    if (c.melhorLoja && c.nComDados > 1) t.append(b(c.melhorLoja.nome), ` lidera com ${pctS(c.melhorLoja.quota)} das vendas. `);
    if (R.projeccao != null) t.append('Projecção da rede: ', b(kz(R.projeccao)), '. ');
    if (c.pendentes.length) t.append(`Faltam registar meses em ${c.pendentes.length} ${c.pendentes.length === 1 ? 'loja' : 'lojas'}.`);
  }

  function setKpi(n, lab, val, delta, { animate, fmt = kz, raw = null, small = false } = {}) {
    $(`k${n}-lab`).textContent = lab;
    const v = $(`k${n}`);
    v.style.fontSize = small ? '19px' : '';
    if (animate && raw != null) countUp(v, raw, fmt); else v.textContent = val;
    const d = $(`k${n}-d`);
    d.replaceChildren(...(Array.isArray(delta) ? delta : [delta || ' ']));
  }
  const pill = (p) => el('span', 'pill ' + (p == null ? 'na' : p >= 0 ? 'ok' : 'bad'), pct(p));

  function fillKpis(c, animate) {
    const R = c.total.R;
    const B = c.comp;
    setKpi(1, 'Vendas da rede' + (R.ultimo ? ' · até ' + R.ultimo.mes : ''), kz(R.ytd2),
      R.cresc_ytd != null ? [pill(R.cresc_ytd), `vs ${B}, lojas comparáveis`] : (B != null ? `sem meses comparáveis com ${B}` : 'sem ano de comparação'),
      { animate, raw: R.ytd2 });
    setKpi(2, 'Diferença nas lojas comparáveis', kzs(R.dif_ytd), R.ytd1 != null ? `${kz(R.ytd2c)} contra ${kz(R.ytd1)} em ${B} · ${R.lojasComparaveis} ${R.lojasComparaveis === 1 ? 'loja' : 'lojas'}` : '—', { animate, raw: R.dif_ytd, fmt: kzs });
    setKpi(3, 'Média mensal da rede', kz(R.media2),
      [R.cresc_media != null ? pill(R.cresc_media) : '', `${R.nfech} ${R.nfech === 1 ? 'mês completo' : 'meses completos'}${R.media1 != null ? ' · ' + kz(R.media1) + ' em ' + B : ''}`],
      { animate, raw: R.media2 });
    const L = c.melhorLoja;
    setKpi(4, 'Livraria com mais vendas', L ? L.nome : '—', L ? `${kz(L.M.R.ytd2)} · ${pctS(L.quota)} da rede` : '—', { small: true });
    setKpi(5, 'Projecção da rede ' + c.ano, kz(R.projeccao),
      R.cresc_proj != null ? [pill(R.cresc_proj), `vs total de ${B} (${kz(R.total1)})`] : (R.falta != null ? `faltam ${kz(R.falta)}` : 'soma das projecções de cada loja'),
      { animate, raw: R.projeccao });
    $('proj-bar').style.width = Math.min(100, Math.round((R.progresso || 0) * 100)) + '%';
    // Linha pequena: a rede mês a mês.
    const sp = d3.select($('spark'));
    sp.selectAll('*').remove();
    const vals = c.total.rows.map((r) => r.v2);
    const mx = d3.max(vals) || 1;
    const x = (i) => (i / 11) * 200;
    const y = (v) => 32 - (v / mx) * 28;
    const pts = vals.map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length > 1) sp.append('path').attr('d', d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(pts)).attr('fill', 'none').attr('stroke', C2).attr('stroke-width', 2);
  }

  function fillPend(c) {
    $('pend').hidden = !c.pendentes.length;
    if (!c.pendentes.length) return;
    $('pend-note').textContent = `Até ${c.ultimoMesRede}, o último mês que alguma livraria já registou. Sem estes meses, os totais da rede ficam abaixo do real e os meses aparecem como parciais.`;
    $('pend-list').replaceChildren(...c.pendentes.map((p) => {
      const li = el('li');
      li.append(el('b', null, p.nome));
      p.meses.forEach((m) => li.append(el('span', 'm', m)));
      return li;
    }));
  }

  // ---------- Gráficos ----------
  function clearBox(box, msg) {
    box.querySelectorAll('svg, .empty').forEach((s) => s.remove());
    if (msg) box.appendChild(el('div', 'empty', msg));
  }
  function tip(box, lines, x, y) {
    const t = box.querySelector('.tip');
    if (!lines) { t.style.display = 'none'; return; }
    t.replaceChildren();
    lines.forEach((line, i) => {
      if (i === 0) { t.appendChild(el('div', 't', line)); return; }
      const d = el('div', 'l');
      const a = el('span');
      if (line[2]) { const sw = el('i'); sw.style.background = line[2]; a.appendChild(sw); }
      a.appendChild(document.createTextNode(line[0]));
      d.append(a, el('span', null, line[1]));
      t.appendChild(d);
    });
    t.style.display = 'block';
    const bw = box.clientWidth;
    const tw = t.offsetWidth;
    const th = t.offsetHeight;
    let left = x + 14; if (left + tw > bw) left = x - tw - 14; if (left < 0) left = 0;
    let top = y - th - 10; if (top < 0) top = y + 14;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function eixoY(svg, y, W, m) {
    const ticks = y.ticks(5);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d)).style('stroke', 'var(--grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => (d === 0 ? '0' : mi(d)));
  }

  function drawRede(c, animate) {
    const box = $('chart-rede');
    clearBox(box);
    const lojas = c.lojas.filter((l) => l.temDados);
    $('lg-lojas').replaceChildren(
      ...(c.comp != null ? [(() => { const s = el('span'); s.append(dot(C1), String(c.comp)); return s; })()] : []),
      ...lojas.map((l) => { const s = el('span'); s.append(dot(l.cor), l.nome); return s; }),
    );
    if (!lojas.length) { clearBox(box, `Ainda não há vendas registadas em ${c.ano}.`); return; }
    const rows = c.total.rows;
    const W = Math.max(280, box.clientWidth);
    const H = 300;
    const max = d3.max(rows, (r) => Math.max(r.v1 || 0, r.v2 || 0, r.projMes || 0, r.est || 0)) || 1;
    const y = d3.scaleLinear().domain([0, max]).nice(5);
    const m = { t: 10, r: 8, b: 26, l: 46 };
    y.range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Vendas por mês de todas as livrarias');
    eixoY(svg, y, W, m);
    const x = d3.scaleBand().domain(MESES).range([m.l, W - m.r]).paddingInner(0.22).paddingOuter(0.08);
    const xi = d3.scaleBand().domain(['1', '2']).range([0, x.bandwidth()]).padding(0.08);
    const bw = Math.min(30, xi.bandwidth());
    const off = (xi.bandwidth() - bw) / 2;
    const base = y(0);
    const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.mes)},0)`);
    // A animação é CSS (consolidado.css, .grow): o pacote d3 declara-se sem efeitos secundários e
    // o selection.transition() do d3-transition não vinha neste pedaço do site compilado.
    const grow = (sel, y0, y1, i) => {
      sel.attr('y', y1).attr('height', Math.max(0, y0 - y1));
      if (animate && !reduce) sel.attr('class', 'grow').style('animation-delay', i * 60 + 'ms');
    };
    g.each(function (r) {
      const gg = d3.select(this);
      if (c.comp != null && r.v1 != null) grow(gg.append('rect').attr('x', xi('1') + off).attr('width', bw).attr('rx', 3).attr('fill', C1), base, y(r.v1), r.i);
      let acc = 0;
      c.meses[r.i].porLoja.forEach((p) => {
        if (p.v2 == null) return;
        const y0 = y(acc);
        acc += p.v2;
        grow(gg.append('rect').attr('x', xi('2') + off).attr('width', bw).attr('fill', p.cor).attr('fill-opacity', p.estado === 'Em curso' ? 0.65 : 1), y0, y(acc), r.i);
      });
      const alvo = r.v2 == null ? r.est : (r.estado === 'Em curso' && r.projMes > r.v2 ? r.projMes : null);
      if (alvo != null) {
        gg.append('rect').attr('x', xi('2') + off + 1).attr('width', Math.max(1, bw - 2)).attr('y', y(alvo)).attr('height', Math.max(0, y(r.v2 || 0) - y(alvo)))
          .attr('fill', 'var(--c26-soft)').attr('stroke', C2).attr('stroke-width', 1.2).attr('stroke-dasharray', '4 3');
      }
      gg.append('text').attr('x', x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text(MESES_CURTOS[r.i]);
      gg.append('rect').attr('x', 0).attr('y', m.t).attr('width', x.bandwidth()).attr('height', H - m.t - m.b).attr('fill', 'transparent')
        .on('mousemove', (ev) => {
          const [px, py] = d3.pointer(ev, box);
          const lines = [`${r.mes} ${c.ano} · ${r.estado === 'Em curso' ? 'parcial' : r.estado.toLowerCase()}`];
          if (c.comp != null) lines.push([`Rede ${c.comp}`, kz(r.v1), C1]);
          c.meses[r.i].porLoja.forEach((p) => lines.push([p.nome, p.v2 != null ? kz(p.v2) : (p.est != null ? '≈ ' + kz(p.est) : 'por registar'), p.cor]));
          lines.push([`Rede ${c.ano}`, r.v2 != null ? kz(r.v2) : (r.est != null ? '≈ ' + kz(r.est) : '—')]);
          if (r.cresc != null) lines.push(['Crescimento', pct(r.cresc)]);
          tip(box, lines, px, py);
        })
        .on('mouseleave', () => tip(box, null));
    });
  }

  function fillRank(c) {
    const lista = c.lojas.filter((l) => l.temDados).sort((a, b) => a.posicao - b.posicao);
    const sem = c.lojas.filter((l) => !l.temDados);
    const max = lista.length ? lista[0].M.R.ytd2 || 1 : 1;
    $('note-rank').textContent = `Vendas registadas em ${c.ano}, quota na rede e crescimento no período comparável${c.comp != null ? ' face a ' + c.comp : ''}.`;
    const items = lista.map((l) => {
      const li = el('li');
      const nm = el('span', 'nm'); nm.append(dot(l.cor), l.nome);
      const bar = el('span', 'bar'); const fill = el('span'); fill.style.background = l.cor; bar.appendChild(fill);
      const sub = el('span', 'sub');
      sub.append(pctS(l.quota) + ' · ', el('span', cls(l.M.R.cresc_ytd), pct(l.M.R.cresc_ytd)));
      li.append(el('span', 'pos', l.posicao + 'º'), nm, el('span', 'vl', kz(l.M.R.ytd2)), el('span'), bar, sub);
      requestAnimationFrame(() => { fill.style.width = Math.max(1, (l.M.R.ytd2 / max) * 100) + '%'; });
      return li;
    });
    sem.forEach((l) => {
      const li = el('li');
      const nm = el('span', 'nm'); nm.append(dot(l.cor), l.nome);
      li.append(el('span', 'pos', '—'), nm, el('span', 'vl', '—'), el('span'), el('span', 'sem', `Sem vendas registadas em ${c.ano}`));
      items.push(li);
    });
    if (!items.length) items.push(el('li', 'sem', 'Ainda não há livrarias com vendas.'));
    $('rank').replaceChildren(...items);
  }

  function drawAcum(c) {
    const box = $('chart-acum');
    clearBox(box);
    const M = c.total;
    const R = M.R;
    if (!c.nComDados) { clearBox(box, 'Sem vendas para acumular.'); return; }
    const W = Math.max(280, box.clientWidth);
    const H = 280;
    const pts1 = c.comp != null ? M.rows.map((r) => ({ mes: r.mes, v: r.acum1 })) : [];
    const pts2 = M.rows.filter((r) => r.acum2 != null).map((r) => ({ mes: r.mes, v: r.acum2 }));
    let proj = [];
    if (R.projeccao != null && M.rows.some((r) => r.estado !== 'Fechado')) {
      const iF = R.ultimoFech ? R.ultimoFech.i : -1;
      let v = iF >= 0 ? M.rows[iF].acum2 : 0;
      proj = iF >= 0 ? [{ mes: MESES[iF], v }] : [];
      M.rows.slice(iF + 1).forEach((r) => { v += r.projMes || 0; proj.push({ mes: r.mes, v }); });
    }
    const max = Math.max(R.projeccao || 0, R.total1 || 0, R.ytd2 || 0) || 1;
    const y = d3.scaleLinear().domain([0, max]).nice(5);
    const m = { t: 14, r: 12, b: 26, l: 46 };
    y.range([H - m.b, m.t]);
    const x = d3.scalePoint().domain(MESES).range([m.l + 6, W - m.r]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Vendas acumuladas da rede');
    eixoY(svg, y, W, m);
    svg.append('g').selectAll('text').data(MESES).join('text').attr('x', (d) => x(d)).attr('y', H - 8).attr('text-anchor', 'middle').text((d) => d.slice(0, 3));
    const line = d3.line().x((d) => x(d.mes)).y((d) => y(d.v));
    if (R.total1 != null) svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(R.total1)).attr('y2', y(R.total1)).style('stroke', 'var(--axis)').attr('stroke-dasharray', '3 3');
    if (pts1.length) svg.append('path').datum(pts1.filter((p) => p.v != null)).attr('fill', 'none').attr('stroke', C1).attr('stroke-width', 2).attr('d', line);
    if (proj.length > 1) svg.append('path').datum(proj).attr('fill', 'none').attr('stroke', C2).attr('stroke-width', 2).attr('stroke-dasharray', '5 4').attr('d', line);
    if (pts2.length) {
      svg.append('path').datum(pts2).attr('fill', 'none').attr('stroke', C2).attr('stroke-width', 2.5).attr('d', line);
      const last = pts2[pts2.length - 1];
      svg.append('circle').attr('cx', x(last.mes)).attr('cy', y(last.v)).attr('r', 4).attr('fill', C2);
    }
    $('note-acum').textContent = `Vendas somadas mês a mês até Dezembro. A projecção (${kz(R.projeccao)}) é a soma das projecções de cada loja${R.falta != null ? '; faltam ' + kz(R.falta) : ''}.`;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px, py] = d3.pointer(ev, box);
        const i = Math.max(0, Math.min(11, Math.round(((px - m.l - 6) / (W - m.r - m.l - 6)) * 11)));
        const r = M.rows[i];
        const p = proj.find((q) => q.mes === r.mes);
        tip(box, [`Até ${r.mes}`, ...(c.comp != null ? [[String(c.comp), kz(r.acum1), C1]] : []), [String(c.ano), r.acum2 != null ? kz(r.acum2) : '—', C2], ...(p && r.acum2 == null ? [['Projecção', '≈ ' + kz(p.v)]] : [])], px, py);
      })
      .on('mouseleave', () => tip(box, null));
  }

  function drawCresc(c) {
    const box = $('chart-cresc');
    clearBox(box);
    const lista = c.lojas.filter((l) => l.temDados && l.M.R.cresc_ytd != null).sort((a, b) => b.M.R.cresc_ytd - a.M.R.cresc_ytd);
    if (!lista.length) { clearBox(box, c.comp == null ? 'Escolha um ano de comparação para ver o crescimento.' : `Nenhuma livraria tem meses comparáveis com ${c.comp}.`); return; }
    const W = Math.max(280, box.clientWidth);
    const rh = 34;
    const H = Math.max(120, lista.length * rh + 30);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Crescimento de cada livraria');
    const lw = Math.min(170, W * 0.36);
    const vals = lista.map((l) => l.M.R.cresc_ytd).concat([c.total.R.cresc_ytd || 0, 0]);
    const x = d3.scaleLinear().domain([Math.min(0, d3.min(vals)), Math.max(0, d3.max(vals))]).nice().range([lw + 10, W - 70]);
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 4).attr('y2', H - 20).style('stroke', 'var(--axis)');
    lista.forEach((l, i) => {
      const yy = 10 + i * rh;
      const v = l.M.R.cresc_ytd;
      svg.append('text').attr('x', lw).attr('y', yy + 14).attr('text-anchor', 'end').style('fill', 'var(--fg)').style('font-weight', 700).text(l.nome.length > 26 ? l.nome.slice(0, 25) + '…' : l.nome);
      svg.append('rect').attr('x', Math.min(x(0), x(v))).attr('y', yy + 2).attr('width', Math.max(1, Math.abs(x(v) - x(0)))).attr('height', 18).attr('rx', 4).attr('fill', v >= 0 ? 'var(--pos)' : 'var(--neg)');
      svg.append('text').attr('x', v >= 0 ? x(v) + 6 : x(v) - 6).attr('y', yy + 15).attr('text-anchor', v >= 0 ? 'start' : 'end').style('font-weight', 700).style('fill', v >= 0 ? 'var(--ok)' : 'var(--bad)').text(pct(v));
    });
    const R = c.total.R;
    if (R.cresc_ytd != null) {
      svg.append('line').attr('x1', x(R.cresc_ytd)).attr('x2', x(R.cresc_ytd)).attr('y1', 4).attr('y2', H - 20).style('stroke', 'var(--teal)').attr('stroke-dasharray', '4 3');
      svg.append('text').attr('x', x(R.cresc_ytd)).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--teal)').style('font-weight', 700).text('Rede ' + pct(R.cresc_ytd));
    }
  }

  // ---------- Quadros ----------
  function th(text, c2) { return el('th', c2 || null, text); }
  function td(text, c2, title) { const e = el('td', c2 || null, text); if (title) e.title = title; return e; }

  function fillMx(c) {
    const t = $('tbl-mx');
    const ultimo = c.ultimoMesRede ? MESES.indexOf(c.ultimoMesRede) : -1;
    const hr = el('tr');
    hr.append(th('Livraria'), ...MESES_CURTOS.map((m) => th(m)), th('Total ' + c.ano, 'tot'), th(c.comp != null ? 'Comparável ' + c.comp : 'Comparação', 'tot'), th('Cresc.'));
    t.tHead.replaceChildren(hr);
    const linhas = c.lojas.map((l) => {
      const tr = el('tr');
      const nm = el('span', 'lj'); nm.append(dot(l.cor), l.nome);
      const c0 = el('td'); c0.appendChild(nm); c0.title = l.nome; tr.appendChild(c0);
      l.M.rows.forEach((r) => {
        const mesRede = c.meses[r.i].porLoja.find((p) => p.id === l.id);
        if (S.modo === 'cresc') { tr.appendChild(td(r.cresc == null ? '—' : pct(r.cresc), cls(r.cresc))); return; }
        if (S.modo === 'quota') { tr.appendChild(td(mesRede && mesRede.quota != null ? pctS(mesRede.quota) : '—', 'mut')); return; }
        if (r.v2 != null) tr.appendChild(td(grp(r.v2), r.estado === 'Em curso' ? 'parc' : null, r.estado === 'Em curso' ? 'Mês em curso' : r.obs || null));
        else if (l.temDados && r.i <= ultimo) tr.appendChild(td('por registar', 'falta'));
        else tr.appendChild(td(r.est != null && l.temDados ? '≈ ' + grp(r.est) : '—', 'est'));
      });
      tr.append(td(l.temDados ? grp(l.M.R.ytd2) : '—', 'tot'), td(l.M.R.ytd1 != null ? grp(l.M.R.ytd1) : '—', 'tot'), td(pct(l.M.R.cresc_ytd), cls(l.M.R.cresc_ytd)));
      return tr;
    });
    t.tBodies[0].replaceChildren(...linhas);
    const R = c.total.R;
    const rede = el('tr');
    rede.append(td('Rede ' + c.ano));
    c.total.rows.forEach((r) => {
      if (S.modo === 'cresc') rede.append(td(r.cresc == null ? '—' : pct(r.cresc), cls(r.cresc)));
      else if (S.modo === 'quota') rede.append(td(r.v2 != null ? '100%' : '—', 'mut'));
      else rede.append(td(r.v2 != null ? grp(r.v2) : (r.est != null ? '≈ ' + grp(r.est) : '—'), r.v2 == null ? 'est' : (r.estado === 'Em curso' ? 'parc' : null), r.estado === 'Em curso' ? `Parcial: ${c.meses[r.i].registadas} de ${c.meses[r.i].de} lojas` : null));
    });
    rede.append(td(grp(R.ytd2), 'tot'), td(R.ytd1 != null ? grp(R.ytd1) : '—', 'tot'), td(pct(R.cresc_ytd), cls(R.cresc_ytd)));
    const foot = [rede];
    if (c.comp != null && S.modo === 'valor') {
      const r2 = el('tr');
      r2.append(td('Rede ' + c.comp), ...c.total.rows.map((r) => td(r.v1 != null ? grp(r.v1) : '—')), td(grp(R.total1), 'tot'), td('', 'tot'), td(''));
      foot.push(r2);
    }
    t.tFoot.replaceChildren(...foot);
  }
  root.querySelectorAll('#quadro .tab').forEach((b) => b.addEventListener('click', () => {
    S.modo = b.dataset.modo;
    root.querySelectorAll('#quadro .tab').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    if (S.c) fillMx(S.c);
  }));

  function fillLojas(c) {
    const t = $('tbl-lojas');
    t.tBodies[0].replaceChildren(...c.lojas.map((l) => {
      const R = l.M.R;
      const tr = el('tr', l.temDados ? null : 'semdados');
      const nm = el('span', 'lj'); nm.append(dot(l.cor), l.nome);
      const c0 = el('td'); c0.appendChild(nm);
      const meses = el('td', l.atrasados ? 'neg' : 'mut', `${R.nregistados}/12`);
      if (l.atrasados) meses.title = 'Por registar: ' + l.atrasados.join(', ');
      const fonte = [l.fonte, l.actualizado ? 'actualizado ' + quando(l.actualizado) : ''].filter(Boolean).join(' · ');
      tr.append(c0, td(l.temDados ? kz(R.ytd2) : '—'), td(R.ytd1 != null ? kz(R.ytd1) : '—'), td(pct(R.cresc_ytd), cls(R.cresc_ytd)),
        td(kz(R.media2)), td(R.melhor ? `${R.melhor.mes.slice(0, 3)} · ${grp(R.melhor.v2)}` : '—'), td(kz(R.projeccao)), td(pctS(l.quota)), meses, td(fonte || '—', 'o'));
      if (l.temDados || l.temComp) {
        tr.title = 'Abrir o painel de ' + l.nome;
        tr.addEventListener('click', () => api.abrirLoja?.(l.id));
      }
      return tr;
    }));
    const R = c.total.R;
    const f = el('tr');
    f.append(td('Rede'), td(kz(R.ytd2)), td(R.ytd1 != null ? kz(R.ytd1) : '—'), td(pct(R.cresc_ytd), cls(R.cresc_ytd)), td(kz(R.media2)),
      td(R.melhor ? `${R.melhor.mes.slice(0, 3)} · ${grp(R.melhor.v2)}` : '—'), td(kz(R.projeccao)), td(c.nComDados ? '100%' : '—'), td(`${R.nregistados}/12`), td('soma das lojas', 'o'));
    t.tFoot.replaceChildren(f);
  }

  // ---------- Vendas do sistema (conferir e preencher) ----------
  async function sysLoad() {
    const ano = S.ed.open ? S.ed.ano : S.ano;
    const modo = $('sys-modo').value;
    $('sys-load').disabled = true;
    $('sys-st').className = 'st';
    $('sys-st').textContent = `A somar as encomendas de ${ano}…`;
    try {
      const data = await api.sistema(ano, { paidOnly: modo === 'paid' });
      if (dead) return;
      if (!data) {
        $('sys-st').textContent = 'As vendas do sistema por loja ficam disponíveis depois de aplicada a migração «relatorios_de_todas_as_livrarias».';
        $('sys-st').className = 'st err';
        return;
      }
      S.sys = { ano, modo, data };
      $('sys-st').textContent = `${data.orders} ${data.orders === 1 ? 'encomenda' : 'encomendas'} em ${ano}. A vermelho, os meses em que o registado não bate com o sistema.`;
      fillSys();
      edSysButtons();
    } catch (e) {
      $('sys-st').textContent = (e && e.message && /permiss/i.test(e.message)) ? 'Sem permissão para ver as vendas do sistema.' : 'Não foi possível somar as encomendas agora.';
      $('sys-st').className = 'st err';
    } finally {
      $('sys-load').disabled = false;
    }
  }
  $('sys-load').addEventListener('click', sysLoad);
  $('sys-modo').addEventListener('change', () => { S.sys = { ano: null, modo: $('sys-modo').value, data: null }; fillSys(); edSysButtons(); $('sys-st').textContent = ''; });

  function fillSys() {
    const D = S.sys.data;
    $('sys-box').hidden = !D;
    if (!D) return;
    const ano = S.sys.ano;
    const t = $('tbl-sys');
    const hr = el('tr');
    hr.append(th(`Livraria · ${ano}`), ...MESES_CURTOS.map((m) => th(m)), th('Sistema', 'tot'), th('Registado', 'tot'), th('Diferença'));
    t.tHead.replaceChildren(hr);
    const totM = Array(12).fill(0);
    let totS = 0;
    let totR = 0;
    const rows = S.lojas.filter((l) => l.active || D.porLoja[l.id] || (l.years || {})[ano]).map((l) => {
      const s = D.porLoja[l.id] || { months: Array(12).fill(0), counts: Array(12).fill(0) };
      const reg = ((l.years || {})[ano] || {}).meses || [];
      const tr = el('tr');
      const nm = el('span', 'lj'); nm.append(dot(S.c.lojas.find((x) => x.id === l.id)?.cor || '#9AA8BC'), l.name);
      const c0 = el('td'); c0.appendChild(nm); tr.appendChild(c0);
      let sumS = 0; let sumR = 0;
      s.months.forEach((v, i) => {
        const r = reg[i] == null ? null : Number(reg[i]);
        sumS += v; sumR += r || 0; totM[i] += v;
        const igual = r != null && Math.round(r * 100) === Math.round(v * 100);
        const diff = s.counts[i] && r != null && !igual;
        const cell = td(s.counts[i] ? grp(v) : '—', diff ? 'dif' : (igual && s.counts[i] ? 'igual' : 'mut'),
          `${s.counts[i]} ${s.counts[i] === 1 ? 'encomenda' : 'encomendas'} · registado: ${r == null ? 'vazio' : kz(r)}`);
        tr.appendChild(cell);
      });
      totS += sumS; totR += sumR;
      tr.append(td(grp(sumS), 'tot'), td(grp(sumR), 'tot'), td(kzs(Math.round((sumR - sumS) * 100) / 100), Math.round(sumR * 100) === Math.round(sumS * 100) ? 'igual' : 'mut'));
      return tr;
    });
    if (D.semLoja.counts.some(Boolean)) {
      const tr = el('tr');
      tr.append(td('Sem loja (entregas noutras províncias)', 'mut'));
      D.semLoja.months.forEach((v, i) => { totM[i] += v; tr.appendChild(td(D.semLoja.counts[i] ? grp(v) : '—', 'mut')); });
      const s2 = D.semLoja.months.reduce((a, b) => a + b, 0);
      totS += s2;
      tr.append(td(grp(s2), 'tot'), td('—', 'tot'), td('—'));
      rows.push(tr);
    }
    t.tBodies[0].replaceChildren(...rows);
    const f = el('tr');
    f.append(td('Total do sistema'), ...totM.map((v) => td(grp(v))), td(grp(totS), 'tot'), td(grp(totR), 'tot'), td(''));
    t.tFoot.replaceChildren(f);
  }

  // ---------- Lançar vendas (grelha lojas × meses) ----------
  const ED = { lojas: [] };
  function lojasDoEditor(ano) {
    return S.lojas.filter((l) => l.active || (l.years || {})[ano] || Object.keys(l.years || {}).length);
  }
  function edOpen() {
    if (!api.canEdit) return;
    S.ed.open = true;
    S.ed.ano = S.ano;
    $('editar').hidden = false;
    edRender();
    $('editar').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  $('btn-edit').addEventListener('click', edOpen);

  function edTabs() {
    const anos = [...new Set([...S.anos, anoActual, S.ed.ano])].sort((a, b) => a - b);
    $('ed-tabs').replaceChildren(...anos.map((a) => {
      const b = el('button', 'tab', String(a));
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(a === S.ed.ano));
      b.addEventListener('click', () => edSwitch(a));
      return b;
    }));
  }
  function edSwitch(ano) {
    if (S.ed.dirty) { edStatus('Guarde ou descarte as alterações antes de mudar de ano.', 'err'); return; }
    S.ed.ano = ano;
    edRender();
  }
  $('ed-novo-go').addEventListener('click', () => {
    const a = Number($('ed-novo').value);
    if (!Number.isInteger(a) || a < 2000 || a > 2100) { edStatus('Escreva um ano entre 2000 e 2100.', 'err'); return; }
    $('ed-novo').value = '';
    edSwitch(a);
  });

  function edRender() {
    const ano = S.ed.ano;
    $('ed-ano').textContent = String(ano);
    edTabs();
    ED.lojas = lojasDoEditor(ano);
    const t = $('ed-grid');
    const hr = el('tr');
    hr.append(th('Livraria'), ...MESES_CURTOS.map((m) => th(m)), th('Mês em curso'), th('Total', 'tot'));
    t.tHead.replaceChildren(hr);
    t.tBodies[0].replaceChildren(...ED.lojas.map((l, li) => {
      const Y = (l.years || {})[ano] || {};
      const meses = Array.isArray(Y.meses) ? Y.meses : [];
      const tr = el('tr');
      const nm = el('span', 'lj'); nm.append(dot(S.c?.lojas.find((x) => x.id === l.id)?.cor || '#9AA8BC'), l.name + (l.active ? '' : ' (inactiva)'));
      const c0 = el('td'); c0.appendChild(nm); tr.appendChild(c0);
      MESES.forEach((m, i) => {
        const v = meses[i] == null ? null : Number(meses[i]);
        const inp = el('input', 'v');
        inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
        inp.value = inField(v);
        inp.dataset.l = li; inp.dataset.i = i; inp.dataset.orig = v == null ? '' : String(v);
        inp.setAttribute('aria-label', `${l.name}, ${m} de ${ano}`);
        const cell = el('td');
        cell.append(inp, el('span', 'hint'));
        tr.appendChild(cell);
      });
      const sel = el('select');
      sel.dataset.l = li;
      sel.setAttribute('aria-label', `${l.name}: mês em curso`);
      const o0 = el('option', null, '—'); o0.value = ''; sel.appendChild(o0);
      MESES.forEach((m, i) => { const o = el('option', null, m.slice(0, 3)); o.value = i + 1; sel.appendChild(o); });
      sel.value = Y.mes_em_curso ? String(Y.mes_em_curso) : '';
      sel.dataset.orig = sel.value;
      const cs = el('td'); cs.appendChild(sel); tr.appendChild(cs);
      tr.appendChild(el('td', 'tot', '—'));
      return tr;
    }));
    S.ed.dirty = false;
    edStatus('');
    $('ed-sys-st').textContent = '';
    edHints();
    edCheck();
    edSysButtons();
    if (typeof pptEstado === 'function' && PPT.r) pptEstado();
  }

  function edInputs() { return [...root.querySelectorAll('#ed-grid input.v')]; }
  function edCheck() {
    let dirty = false;
    let bad = 0;
    const tot = Array(12).fill(0);
    const totL = ED.lojas.map(() => 0);
    edInputs().forEach((inp) => {
      const p = parseKz(inp.value);
      inp.classList.toggle('invalid', !p.ok);
      if (!p.ok) { bad++; return; }
      const orig = inp.dataset.orig === '' ? null : Number(inp.dataset.orig);
      const changed = (p.v == null ? null : Math.round(p.v * 100)) !== (orig == null ? null : Math.round(orig * 100));
      inp.classList.toggle('changed', changed);
      if (!changed) inp.classList.remove('sis');
      if (changed) dirty = true;
      if (p.v != null) { tot[Number(inp.dataset.i)] += Math.round(p.v * 100); totL[Number(inp.dataset.l)] += Math.round(p.v * 100); }
    });
    root.querySelectorAll('#ed-grid select').forEach((s) => { const ch = s.value !== s.dataset.orig; s.classList.toggle('changed', ch); if (ch) dirty = true; });
    root.querySelectorAll('#ed-grid tbody tr').forEach((tr, i) => { tr.lastElementChild.textContent = grp(totL[i] / 100); });
    const f = el('tr');
    f.append(td('Total da rede'), ...tot.map((c) => td(c ? grp(c / 100) : '—')), td(''), td(grp(tot.reduce((a, b) => a + b, 0) / 100), 'tot'));
    $('ed-grid').tFoot.replaceChildren(f);
    S.ed.dirty = dirty;
    $('ed-save').disabled = !dirty || bad > 0;
    if (bad) edStatus(`${bad} ${bad === 1 ? 'valor não é' : 'valores não são'} um número válido (ex.: 2 171 368 ou 2.171.368,50).`, 'err');
    else if (dirty) edStatus('Alterações por guardar.');
    else edStatus('');
  }
  $('ed-grid').addEventListener('input', (e) => {
    if (e.target.matches && e.target.matches('input.v')) e.target.classList.remove('sis');
    edCheck();
  });
  $('ed-grid').addEventListener('change', edCheck);
  $('ed-grid').addEventListener('blur', (e) => {
    if (!(e.target.matches && e.target.matches('input.v'))) return;
    const p = parseKz(e.target.value);
    if (p.ok) e.target.value = inField(p.v);
  }, true);

  function edStatus(t, c2) { const s = $('ed-status'); s.textContent = t; s.className = 'st' + (c2 ? ' ' + c2 : ''); }

  /** Debaixo de cada mês, o valor do sistema (quando carregado para este ano). */
  function edHints() {
    const D = S.sys.data && S.sys.ano === S.ed.ano ? S.sys.data : null;
    edInputs().forEach((inp) => {
      const hint = inp.nextElementSibling;
      const l = ED.lojas[Number(inp.dataset.l)];
      const s = D && l ? D.porLoja[l.id] : null;
      const i = Number(inp.dataset.i);
      if (!s || !s.counts[i]) { hint.textContent = ''; hint.className = 'hint'; return; }
      const p = parseKz(inp.value);
      const igual = p.ok && p.v != null && Math.round(p.v * 100) === Math.round(s.months[i] * 100);
      hint.textContent = 'sist. ' + grp(s.months[i]);
      hint.className = 'hint' + (igual ? '' : ' dif');
      hint.title = `${s.counts[i]} ${s.counts[i] === 1 ? 'encomenda' : 'encomendas'} no sistema`;
    });
  }
  function edSysButtons() {
    const ok = !!(S.sys.data && S.ed.open && S.sys.ano === S.ed.ano);
    $('ed-fill').disabled = !ok;
    $('ed-all').disabled = !ok;
    if (S.ed.open) {
      edHints();
      if (!ok) $('ed-sys-st').textContent = S.sys.data ? `As vendas do sistema carregadas são de ${S.sys.ano}; carregue as de ${S.ed.ano}.` : 'Carregue primeiro as vendas do sistema (secção acima).';
      else $('ed-sys-st').textContent = '';
    }
  }
  function edAplicarSistema(modo) {
    const D = S.sys.data;
    if (!D || S.sys.ano !== S.ed.ano) return;
    let n = 0;
    ED.lojas.forEach((l, li) => {
      const s = D.porLoja[l.id];
      if (!s) return;
      const inps = edInputs().filter((x) => Number(x.dataset.l) === li).sort((a, b) => a.dataset.i - b.dataset.i);
      const atual = inps.map((x) => { const p = parseKz(x.value); return p.ok ? p.v : null; });
      const sistema = s.months.map((v, i) => (s.counts[i] ? v : null));
      const { meses, mudou } = aplicarSistema(atual, sistema, modo);
      mudou.forEach((m) => { inps[m.i].value = inField(meses[m.i]); inps[m.i].classList.add('sis'); n++; });
    });
    edCheck();
    edHints();
    root.querySelectorAll('#ed-grid input.v.sis').forEach((x) => { if (!x.classList.contains('changed')) x.classList.remove('sis'); });
    $('ed-sys-st').textContent = n ? `${n} ${n === 1 ? 'mês preenchido' : 'meses preenchidos'} com as vendas do sistema (a azul). Reveja e carregue em Guardar.` : 'Nenhum mês mudou.';
  }
  $('ed-fill').addEventListener('click', () => edAplicarSistema('vazios'));
  $('ed-all').addEventListener('click', () => edAplicarSistema('todos'));

  $('ed-paste-go').addEventListener('click', () => {
    const linhas = $('ed-paste').value.replace(/\r/g, '').split('\n').filter((x, i, a) => x.trim() || i < a.length - 1);
    let bad = 0;
    let n = 0;
    linhas.slice(0, ED.lojas.length).forEach((linha, li) => {
      const cells = linha.split(/\t|;/);
      const inps = edInputs().filter((x) => Number(x.dataset.l) === li).sort((a, b) => a.dataset.i - b.dataset.i);
      cells.slice(0, 12).forEach((c, i) => {
        const p = parseKz(c);
        if (!p.ok) { bad++; inps[i].value = c; return; }
        inps[i].value = inField(p.v);
        inps[i].classList.remove('sis');
        n++;
      });
    });
    $('ed-paste-st').textContent = (linhas.length > ED.lojas.length ? `Só usei as primeiras ${ED.lojas.length} linhas (uma por loja). ` : '')
      + (bad ? `${bad} valores não foram reconhecidos. ` : '') + `${n} meses aplicados à grelha. Reveja e carregue em Guardar.`;
    edCheck();
    edHints();
  });

  // ---------- Importar o PowerPoint da loja ----------
  const PPT = { r: null, nome: '' };
  function pptEstado() {
    const r = PPT.r;
    const go = $('ed-ppt-go');
    if (!r) { go.disabled = true; return; }
    const loja = lojaDoPptx(r.loja, ED.lojas);
    const anos = Object.keys(r.anos).map(Number);
    const temAno = anos.includes(S.ed.ano) && r.anos[S.ed.ano].some((v) => v != null);
    go.disabled = !loja || !temAno;
    go.textContent = `Aplicar ${S.ed.ano} à grelha`;
    const ate = (a) => (r.ultimo[a] >= 0 ? `até ${MESES[r.ultimo[a]]}` : 'sem valores');
    const partes = [`«${PPT.nome}»: ${r.loja ? 'Loja ' + (/^d[eoa]s?\s/i.test(r.loja) ? '' : 'do ') + r.loja : 'loja sem nome'}`, anos.map((a) => `${a} ${ate(a)}`).join(', ')];
    if (!loja) partes.push(r.loja ? `não há no painel uma loja com o nome «${r.loja}»` : 'não consegui ler o nome da loja');
    else if (!temAno) partes.push(`não tem ${S.ed.ano}: abra ${anos.join(' ou ')} nos separadores acima`);
    $('ed-ppt-st').textContent = partes.join(' · ') + '.';
    $('ed-ppt-st').className = 'st' + (!loja ? ' err' : '');
    const av = $('ed-ppt-av');
    av.replaceChildren(...r.avisos.map((a) => el('li', null, a)));
    av.hidden = !r.avisos.length;
  }
  $('ed-ppt').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    PPT.r = null; PPT.nome = f.name;
    $('ed-ppt-st').textContent = 'A ler o PowerPoint…'; $('ed-ppt-st').className = 'st';
    $('ed-ppt-av').hidden = true;
    try {
      if (f.size > 40 * 1024 * 1024) throw new Error('O ficheiro passa de 40 MB.');
      PPT.r = await lerPainelPptx(await f.arrayBuffer());
    } catch (e) {
      if (dead) return;
      $('ed-ppt-st').textContent = (e && e.message) || 'Não foi possível ler este ficheiro.';
      $('ed-ppt-st').className = 'st err';
      $('ed-ppt-go').disabled = true;
      return;
    }
    if (dead) return;
    pptEstado();
    ev.target.value = '';
  });
  $('ed-ppt-go').addEventListener('click', () => {
    const r = PPT.r;
    if (!r || !r.anos[S.ed.ano]) return;
    const loja = lojaDoPptx(r.loja, ED.lojas);
    const li = ED.lojas.indexOf(loja);
    if (li < 0) return;
    const inps = edInputs().filter((x) => Number(x.dataset.l) === li).sort((a, b) => a.dataset.i - b.dataset.i);
    const atual = inps.map((x) => { const p = parseKz(x.value); return p.ok ? p.v : null; });
    const { meses, mudou } = aplicarPptx(atual, r.anos[S.ed.ano]);
    mudou.forEach((m) => { inps[m.i].value = inField(meses[m.i]); inps[m.i].classList.remove('sis'); inps[m.i].classList.add('ppt'); });
    edCheck();
    edHints();
    $('ed-ppt-st').textContent = mudou.length
      ? `${loja.name}, ${S.ed.ano}: ${mudou.length} ${mudou.length === 1 ? 'mês mudou' : 'meses mudaram'} (${mudou.map((m) => MESES_CURTOS[m.i]).join(', ')}). Reveja a verde e carregue em Guardar.`
      : `${loja.name}, ${S.ed.ano}: a grelha já tem os valores do PowerPoint. Nada a mudar.`;
    $('ed-ppt-st').className = 'st' + (mudou.length ? ' okk' : '');
  });

  $('ed-cancel').addEventListener('click', () => { edRender(); edStatus('Alterações descartadas.'); });
  $('ed-close').addEventListener('click', () => {
    if (S.ed.dirty) { edStatus('Tem alterações por guardar: guarde-as ou descarte-as antes de fechar.', 'err'); return; }
    S.ed.open = false;
    $('editar').hidden = true;
  });

  $('ed-save').addEventListener('click', async () => {
    if (!api.canEdit || !S.ed.dirty) return;
    const ano = S.ed.ano;
    const linhas = [];
    let invalido = false;
    ED.lojas.forEach((l, li) => {
      const inps = edInputs().filter((x) => Number(x.dataset.l) === li).sort((a, b) => a.dataset.i - b.dataset.i);
      const sel = root.querySelector(`#ed-grid select[data-l="${li}"]`);
      const meses = inps.map((x) => { const p = parseKz(x.value); if (!p.ok) invalido = true; return p.ok ? p.v : null; });
      const mudados = inps.filter((x) => x.classList.contains('changed'));
      if (!mudados.length && sel.value === sel.dataset.orig) return;
      const doSistema = mudados.filter((x) => x.classList.contains('sis')).length;
      const origem = !mudados.length ? 'manual' : doSistema === mudados.length ? 'sistema' : doSistema ? 'misto' : 'manual';
      linhas.push({ lojaId: l.id, meses, mes_em_curso: sel.value ? Number(sel.value) : null, origem, nome: l.name });
    });
    if (invalido) { edCheck(); return; }
    $('ed-save').disabled = true;
    edStatus(`A guardar ${linhas.length} ${linhas.length === 1 ? 'loja' : 'lojas'}…`);
    try {
      await api.gravarMeses(ano, linhas);
    } catch (e) {
      edStatus(e && e.code === 'invalid_argument'
        ? 'Não tem permissão para gravar. Peça a um administrador a permissão «Editar relatórios de vendas».'
        : 'Não foi possível guardar agora. Tente de novo dentro de instantes.', 'err');
      $('ed-save').disabled = false;
      return;
    }
    if (dead) return;
    const feito = `Guardado: ${linhas.map((l) => l.nome).join(', ')}.`;
    S.ed.dirty = false;
    await carregar();
    if (dead) return;
    S.ed.ano = ano;
    edRender();
    edStatus(feito + ' O relatório foi actualizado.', 'okk');
  });

  // ---------- Nota do relatório ----------
  async function carregarNota() {
    const ano = S.ano;
    let n = { texto: '' };
    try { n = await api.lerNota(ano); } catch (e) { n = { texto: '' }; }
    if (dead || ano !== S.ano) return;
    S.nota = { ano, texto: n.texto || '' };
    if (S.c) S.c.nota = S.nota.texto;
    // Quem lê vê o texto; quem edita vê-o na caixa (não duas vezes).
    const p = $('nota-txt');
    p.hidden = !!api.canEdit;
    p.textContent = S.nota.texto || 'Sem nota para este ano.';
    p.classList.toggle('vazia', !S.nota.texto);
    $('nota-ed').hidden = !api.canEdit;
    $('nota-in').value = S.nota.texto;
    $('nota-save').disabled = true;
    $('nota-st').textContent = '';
  }
  $('nota-in').addEventListener('input', () => { $('nota-save').disabled = $('nota-in').value.trim() === S.nota.texto.trim(); });
  $('nota-save').addEventListener('click', async () => {
    const ano = S.ano;
    const texto = $('nota-in').value.trim();
    $('nota-save').disabled = true;
    $('nota-st').textContent = 'A guardar…';
    try {
      await api.gravarNota(ano, texto);
      if (dead) return;
      $('nota-st').textContent = 'Nota guardada.';
      $('nota-st').className = 'st okk';
      await carregarNota();
    } catch (e) {
      $('nota-st').textContent = 'Não foi possível guardar a nota.';
      $('nota-st').className = 'st err';
      $('nota-save').disabled = false;
    }
  });

  // ---------- Histórico (no servidor) ----------
  async function carregarHist() {
    const ano = S.ano;
    const ul = $('hist');
    let lista = null;
    try { lista = await api.historico(ano); } catch (e) { lista = null; }
    if (dead || ano !== S.ano) return;
    if (lista == null) {
      ul.replaceChildren(el('li', null, 'O histórico no servidor fica disponível depois de aplicada a migração «relatorios_de_todas_as_livrarias».'));
      return;
    }
    if (!lista.length) { ul.replaceChildren(el('li', null, `Sem gravações registadas para ${ano}.`)); return; }
    const nome = (id) => (S.lojas.find((l) => l.id === id) || {}).name || 'Loja ' + id;
    const accao = { insert: 'Criou', update: 'Alterou', delete: 'Apagou' };
    const origem = { manual: ['à mão', 'm'], sistema: ['do sistema', 's'], misto: ['sistema e à mão', 's'], importacao: ['importação', 'm'] };
    ul.replaceChildren(...lista.map((h) => {
      const li = el('li');
      li.appendChild(el('span', null, quando(h.em)));
      const t = el('span');
      t.append(el('b', null, `${accao[h.accao] || h.accao} ${nome(h.loja_id)} ${h.ano}`), document.createTextNode(' · ' + h.quem + ' '));
      if (h.origem && origem[h.origem]) t.append(el('span', 'tag ' + origem[h.origem][1], origem[h.origem][0]));
      li.appendChild(t);
      const ms = el('span', 'meses');
      (h.meses || []).forEach((m) => {
        const de = m.de == null ? 'vazio' : grp(Number(m.de));
        const para = m.para == null ? 'vazio' : grp(Number(m.para));
        ms.appendChild(el('span', null, `${MESES_CURTOS[m.mes - 1]}: ${de} → ${para}`));
      });
      Object.keys(h.outros || {}).forEach((k) => {
        const nomes = { mes_em_curso: 'mês em curso', meta_anual: 'meta', criterio: 'critério', fonte: 'fonte', observacoes: 'observações' };
        ms.appendChild(el('span', null, (nomes[k] || k) + ' alterado'));
      });
      if (ms.childNodes.length) li.appendChild(ms);
      return li;
    }));
  }

  // ---------- Exportar ----------
  // Os mais vendidos de todas as lojas e as fotografias da biblioteca (para os vídeos), uma vez por ano.
  const extrasCache = {};
  function extrasDe(ano) {
    if (!api.extras) return Promise.resolve({ destaques: null, fotos: [] });
    if (!extrasCache[ano]) extrasCache[ano] = api.extras(ano).catch(() => ({ destaques: null, fotos: [] }));
    return extrasCache[ano];
  }
  function videoLabels(c) {
    $('vid-lento').textContent = `${fmtDuracao(duracaoPlano(planoVideoConjunto(c, 'lento')))} · para analisar: cada loja e cada mês`;
    $('vid-normal').textContent = `${fmtDuracao(duracaoPlano(planoVideoConjunto(c, 'normal')))} · os mesmos quadros, mais depressa`;
    $('vid-curto').textContent = `${fmtDuracao(duracaoPlano(planoVideoConjunto(c, 'curto')))} · só o resumo da rede`;
  }

  function xlsxSheets(c) {
    const R = c.total.R;
    const A = c.ano;
    const B = c.comp;
    const resumo = [
      ['Indicador', 'Valor', 'Notas'],
      ['Relatório', 'Todas as livrarias', c.nComDados + (c.nComDados === 1 ? ' loja com vendas' : ' lojas com vendas')],
      ['Ano', String(A), B != null ? 'comparado com ' + B : 'sem comparação'],
      ['Vendas da rede ' + A + (R.ultimo ? ' (até ' + R.ultimo.mes + ')' : ''), R.ytd2, ''],
      ['Lojas comparáveis ' + A, R.ytd2c, `lojas e meses com valor nos dois anos (${R.lojasComparaveis || 0} lojas)`],
      ['Lojas comparáveis ' + (B ?? '—'), R.ytd1, ''],
      ['Diferença nas lojas comparáveis', R.dif_ytd, ''],
      ['Crescimento das lojas comparáveis', pct(R.cresc_ytd), 'uma loja nova entra nas vendas, não no crescimento'],
      ['Média mensal da rede (meses completos)', R.media2, R.nfech + ' meses completos'],
      ['Melhor mês da rede', R.melhor ? R.melhor.v2 : null, R.melhor ? R.melhor.mes : ''],
      ['Total da rede ' + (B ?? '—'), R.total1, ''],
      ['Projecção da rede ' + A, R.projeccao, 'soma das projecções de cada loja'],
      ['Crescimento da projecção', pct(R.cresc_proj), ''],
      ['Falta para a projecção', R.falta, ''],
      ['Livraria com mais vendas', c.melhorLoja ? c.melhorLoja.nome : '—', c.melhorLoja ? pctS(c.melhorLoja.quota) + ' da rede' : ''],
      ['Meses por registar', c.pendentes.length ? c.pendentes.map((p) => p.nome + ': ' + p.meses.join(', ')).join(' · ') : 'nenhum', ''],
      ['Nota', c.nota || '—', ''],
      ['Gerado em', c.geradoEm, ''],
    ];
    const mx = matrizLojasMeses(c);
    const lojas = [['Livraria', 'Província', 'Vendas ' + A, 'Comparável ' + (B ?? '—'), 'Diferença', 'Crescimento', 'Média mensal', 'Melhor mês', 'Valor do melhor mês', 'Projecção', 'Critério', 'Quota', 'Meses registados', 'Por registar', 'Fonte', 'Actualizado']];
    c.lojas.forEach((l) => {
      const L = l.M.R;
      lojas.push([l.nome, l.provincia, L.ytd2, L.ytd1, L.dif_ytd, L.cresc_ytd, L.media2, L.melhor ? L.melhor.mes : '', L.melhor ? L.melhor.v2 : null, L.projeccao, l.M.critTxt, l.quota, L.nregistados, l.atrasados ? l.atrasados.join(', ') : '', l.fonte || '', l.actualizado ? quando(l.actualizado) : '']);
    });
    const mes = [['Mês', 'Rede ' + (B ?? '—'), 'Rede ' + A, 'Estimativa', 'Diferença', 'Crescimento', 'Acumulado ' + (B ?? ''), 'Acumulado ' + A, 'Estado', 'Lojas com o mês', 'Observações']];
    c.total.rows.forEach((r) => mes.push([r.mes, r.v1, r.v2, r.est, r.dif, r.cresc, r.acum1, r.acum2, r.estado === 'Em curso' ? 'Parcial' : r.estado, `${c.meses[r.i].registadas} de ${c.meses[r.i].de}`, r.obs || '']));
    const sheets = [
      { name: 'Resumo ' + A, rows: resumo, money: [1], widths: [44, 26, 60] },
      { name: 'Lojas × meses ' + A, rows: mx, money: [...Array(14).keys()].slice(1).concat([14, 17]), pct: [15, 16], widths: [32, ...Array(12).fill(14), 16, 16, 12, 10, 16], boldRows: [mx.findIndex((r) => r[0] === 'Total da rede')] },
      { name: 'Por livraria', rows: lojas, money: [2, 3, 4, 6, 8, 9], pct: [5, 11], widths: [32, 14, 18, 18, 16, 12, 16, 12, 16, 18, 30, 10, 10, 26, 30, 18] },
      { name: 'Rede mês a mês ' + A, rows: mes, money: [1, 2, 3, 4, 6, 7], pct: [5], widths: [12, 18, 18, 18, 16, 12, 18, 18, 12, 14, 60] },
    ];
    if (c.pendentes.length) sheets.push({ name: 'Por registar', rows: [['Livraria', 'Meses'], ...c.pendentes.map((p) => [p.nome, p.meses.join(', ')])], widths: [32, 80] });
    sheets.push({ name: 'Todos os anos', rows: linhasTodosOsAnos(S.lojas), money: [5], widths: [32, 14, 8, 8, 12, 18, 14, 40] });
    return sheets;
  }

  const htmlEsc = (s) => String(s ?? '').replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  async function quadroPng(c, k) {
    const plano = planoVideoConjunto(c, 'lento');
    let acc = 0;
    for (const cena of plano) { if (cena.k === k) break; acc += cena.dur; }
    const alvo = plano.find((x) => x.k === k);
    const { canvas } = await quadroDoVideo('conjunto', c, acc + (alvo ? alvo.dur - 0.2 : 0));
    return canvas;
  }
  async function imprimir(c) {
    const win = window.open('', '_blank');
    if (!win) throw new Error('O navegador bloqueou a janela do relatório. Permita janelas pop-up para este site e tente de novo.');
    const img1 = (await quadroPng(c, 'resumo')).toDataURL('image/png');
    const img2 = (await quadroPng(c, 'mensal')).toDataURL('image/png');
    const R = c.total.R;
    const lojas = c.lojas.map((l) => `<tr><td>${htmlEsc(l.nome)}</td><td class="n">${kz(l.M.R.ytd2)}</td><td class="n">${kz(l.M.R.ytd1)}</td><td class="n">${pct(l.M.R.cresc_ytd)}</td><td class="n">${kz(l.M.R.media2)}</td><td class="n">${kz(l.M.R.projeccao)}</td><td class="n">${pctS(l.quota)}</td><td>${l.M.R.nregistados}/12${l.atrasados ? ' · falta ' + htmlEsc(l.atrasados.join(', ')) : ''}</td></tr>`).join('');
    const mx = c.lojas.map((l) => `<tr><td>${htmlEsc(l.nome)}</td>${l.M.rows.map((r) => `<td class="n">${r.v2 != null ? grp(r.v2) : '—'}</td>`).join('')}<td class="n b">${grp(l.M.R.ytd2)}</td></tr>`).join('');
    const rede = `<tr class="t"><td>Rede ${c.ano}</td>${c.total.rows.map((r) => `<td class="n">${r.v2 != null ? grp(r.v2) : (r.est != null ? '≈ ' + grp(r.est) : '—')}</td>`).join('')}<td class="n b">${grp(R.ytd2)}</td></tr>`
      + (c.comp != null ? `<tr><td>Rede ${c.comp}</td>${c.total.rows.map((r) => `<td class="n">${r.v1 != null ? grp(r.v1) : '—'}</td>`).join('')}<td class="n b">${grp(R.total1)}</td></tr>` : '');
    win.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>Relatório conjunto das livrarias — ${c.ano}</title>
<style>
  ${estiloBaseImpressao()}
  body{color:#111;margin:24px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:18px 0 6px} p{margin:2px 0;color:#555;font-size:12px}
  img{width:100%;margin:10px 0;border-radius:8px;break-inside:avoid}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-top:6px}
  th,td{border-bottom:1px solid #ddd;padding:4px 5px;text-align:left;vertical-align:top}
  th{background:#f3f4f6} td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} .b{font-weight:700}
  tr.t td{font-weight:700;border-top:2px solid #999}
  .nota{border-left:3px solid #E0679A;padding:6px 10px;background:#fafafa;white-space:pre-wrap;font-size:12px}
  @page{size:A4 landscape;margin:12mm}
</style></head><body>
<h1>Relatório conjunto das livrarias · ${c.ano}${c.comp != null ? ' vs ' + c.comp : ''}</h1>
<p>Vendas da rede: <b>${kz(R.ytd2)}</b>${R.ultimo ? ' até ' + R.ultimo.mes : ''} · crescimento comparável ${pct(R.cresc_ytd)} · projecção ${kz(R.projeccao)} (soma das projecções de cada loja) · gerado em ${htmlEsc(c.geradoEm)}</p>
${c.nota ? `<h2>Nota</h2><div class="nota">${htmlEsc(c.nota)}</div>` : ''}
<img alt="Resumo da rede" src="${img1}">
<h2>Cada livraria</h2>
<table><thead><tr><th>Livraria</th><th>Vendas ${c.ano}</th><th>Comparável ${c.comp ?? '—'}</th><th>Crescimento</th><th>Média mensal</th><th>Projecção</th><th>Quota</th><th>Meses</th></tr></thead><tbody>${lojas}</tbody></table>
${c.pendentes.length ? `<h2>Meses por registar</h2><p>${c.pendentes.map((p) => htmlEsc(p.nome) + ': ' + htmlEsc(p.meses.join(', '))).join(' · ')}</p>` : ''}
<img alt="Vendas por mês" src="${img2}">
<h2>Lojas × meses (Kz)</h2>
<table><thead><tr><th>Livraria</th>${MESES_CURTOS.map((m) => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead><tbody>${mx}${rede}</tbody></table>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`);
    win.document.close();
  }

  let exporting = false;
  let videoAbort = null;
  async function doExport(fmt, opts = {}) {
    const st = $('exp-st');
    const say = (t, c2) => { st.textContent = t; st.className = 'st exp-st' + (c2 ? ' ' + c2 : ''); };
    if (!S.c) { say('Ainda não há dados para exportar.', 'err'); return; }
    if (exporting) return;
    exporting = true;
    root.querySelectorAll('#exp-menu button').forEach((b) => { b.disabled = true; });
    const c = S.c;
    c.geradoEm = new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
    const base = 'relatorio-livrarias-' + c.ano + (c.comp != null ? '-vs-' + c.comp : '');
    try {
      if (fmt === 'xlsx') {
        await api.downloads.save({ filename: base + '.xlsx', data: buildXlsx(xlsxSheets(c)) });
        say('Ficheiro Excel pronto.', 'okk');
      } else if (fmt === 'csv') {
        await api.downloads.save({ filename: 'vendas-todas-as-livrarias.csv', data: toCsv(linhasTodosOsAnos(S.lojas)) });
        say('Ficheiro CSV pronto.', 'okk');
      } else if (fmt === 'json') {
        const body = {
          relatorio: 'Todas as livrarias', gerado_em: new Date().toISOString(), ano: c.ano, comparar: c.comp, nota: c.nota || '',
          rede: { ...c.total.R, melhor: c.total.R.melhor?.mes || null, pior: c.total.R.pior?.mes || null, ultimo: c.total.R.ultimo?.mes || null, ultimoFech: c.total.R.ultimoFech?.mes || null },
          meses: c.total.rows.map((r) => ({ mes: r.mes, rede: r.v2, comparacao: r.v1, estimativa: r.est, estado: r.estado, lojas: c.meses[r.i].porLoja.map((p) => ({ loja: p.nome, valor: p.v2, comparacao: p.v1, estado: p.estado })) })),
          lojas: c.lojas.map((l) => ({ id: l.id, nome: l.nome, provincia: l.provincia, quota: l.quota, posicao: l.posicao, por_registar: l.atrasados || [], meses: l.M.rows.map((r) => r.v2), resumo: { vendas: l.M.R.ytd2, comparavel: l.M.R.ytd1, crescimento: l.M.R.cresc_ytd, media: l.M.R.media2, projeccao: l.M.R.projeccao, criterio: l.M.critTxt } })),
          pendentes: c.pendentes,
          todos_os_anos: S.lojas.map((l) => ({ loja: l.name, provincia: l.province, anos: l.years })),
        };
        await api.downloads.save({ filename: base + '.json', data: JSON.stringify(body, null, 2) });
        say('Ficheiro JSON pronto.', 'okk');
      } else if (fmt === 'png') {
        say('A desenhar a imagem…');
        const canvas = await quadroPng(c, 'resumo');
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        await api.downloads.save({ filename: base + '.png', data: blob });
        say('Imagem pronta.', 'okk');
      } else if (fmt === 'pdf') {
        await imprimir(c);
        say('Relatório aberto noutra janela: escolha «Guardar como PDF» na impressão.', 'okk');
      } else if (fmt === 'video') {
        const ritmo = RITMOS[opts.ritmo] ? opts.ritmo : 'lento';
        videoAbort = new AbortController();
        $('exp-cancel').hidden = false;
        say('A preparar o vídeo (capas e imagens)… mantenha este separador aberto até ao fim.');
        Object.assign(c, await extrasDe(c.ano), { fundo: $('vid-fundo').value });
        const { blob, ext, duracao } = await renderVideoConjunto(c, (t, total, cena) => say(`A gravar o vídeo ${RITMOS[ritmo].nome.replace('Vídeo ', '')}: ${fmtDuracao(t)} de ${fmtDuracao(total)}${cena ? ' · ' + cena.nome : ''}. Mantenha este separador aberto.`), { ritmo, signal: videoAbort.signal });
        await api.downloads.save({ filename: `${base}-video-${ritmo}.${ext}`, data: blob });
        say(`Vídeo pronto (${ext.toUpperCase()}, ${fmtDuracao(duracao)}).`, 'okk');
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
  $('btn-exp').addEventListener('click', () => {
    const menu = $('exp-menu');
    menu.hidden = !menu.hidden;
    $('btn-exp').setAttribute('aria-expanded', String(!menu.hidden));
    // Ao abrir, a duração dos vídeos passa a contar com os quadros dos mais vendidos (se os houver).
    if (!menu.hidden && S.c) {
      const c = S.c;
      extrasDe(c.ano).then((x) => { if (S.c === c) { c.destaques = x.destaques; videoLabels(c); } });
    }
  });
  try { const f = localStorage.getItem('relatorios:video:fundo'); if (f) $('vid-fundo').value = f; } catch (e) { /* sem armazenamento */ }
  $('vid-fundo').addEventListener('change', () => { try { localStorage.setItem('relatorios:video:fundo', $('vid-fundo').value); } catch (e) { /* idem */ } });
  $('exp-menu').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-fmt]');
    if (b) doExport(b.dataset.fmt, { ritmo: b.dataset.ritmo });
  });
  $('exp-cancel').addEventListener('click', () => { if (videoAbort) videoAbort.abort(); });

  // Redesenhar os gráficos quando a largura muda.
  let rz = null;
  listen(window, 'resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.c && !dead) { drawRede(S.c, false); drawAcum(S.c); drawCresc(S.c); } }, 150); });
  // Aviso ao sair com lançamentos por guardar.
  listen(window, 'beforeunload', (e) => { if (S.ed.dirty) { e.preventDefault(); e.returnValue = ''; } });

  carregar();

  return () => {
    dead = true;
    clearTimeout(rz);
    if (videoAbort) videoAbort.abort();
    offs.forEach((off) => off());
  };
}
