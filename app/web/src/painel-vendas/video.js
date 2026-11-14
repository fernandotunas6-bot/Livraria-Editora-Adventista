/**
 * Os vídeos dos relatórios de vendas: o de uma loja (Vendas por loja) e o de todas as livrarias
 * (Relatório conjunto). Desenhados num <canvas> a partir dos números do painel e gravados com
 * MediaRecorder, sem bibliotecas.
 *
 * Feitos para ANALISAR, não só para mostrar: no ritmo lento (o de omissão) cada quadro anima
 * durante pouco mais de um segundo e depois fica parado o tempo de ler todos os números. Há um
 * quadro por mês, de Janeiro a Dezembro — os meses por preencher aparecem com a estimativa e o
 * critério —, cada um com tudo o que o mês tem: as vendas dos dois anos, a diferença, o
 * crescimento, o acumulado dos dois anos até esse mês, o peso no ano, a posição entre os meses
 * fechados, a comparação com a média e a observação. Em baixo, o número do quadro e o tempo
 * (Quadro 6 de 20 · 0:52 de 2:59), para se poder parar e voltar a um ponto concreto.
 *
 * O plano de cada vídeo (que quadros, por que ordem e quanto tempo) é uma função pura
 * (`planoVideo`, `planoVideoConjunto`), testada em video.test.js sem canvas.
 * A gravação é em tempo real: um vídeo de 3 minutos demora 3 minutos a gravar.
 */
import { MESES_CURTOS } from './modelo.js';

// ---------- Ritmos e planos ----------

/** Os ritmos que se podem escolher no menu Exportar. `fator` multiplica as durações de DUR. */
export const RITMOS = {
  lento: { id: 'lento', nome: 'Vídeo lento', descricao: 'para analisar: cada quadro fica parado o tempo de ler os números', fator: 1, detalhe: true },
  normal: { id: 'normal', nome: 'Vídeo normal', descricao: 'os mesmos quadros, mais depressa', fator: 0.6, detalhe: true },
  curto: { id: 'curto', nome: 'Vídeo curto', descricao: 'só o resumo, sem os quadros um a um', fator: 0.5, detalhe: false },
};

/** Segundos de cada quadro no ritmo lento. */
export const DUR = {
  capa: 5, resumo: 12, mensal: 11, mes: 9, quadro: 14, acum: 10, ranking: 11, fecho: 8,
  lojas: 12, loja: 10, mesRede: 10, pendentes: 9,
};

const durDe = (k, ritmo) => Math.round(DUR[k] * ritmo.fator * 10) / 10;
const ritmoDe = (id) => RITMOS[id] || RITMOS.lento;

/** O plano do vídeo de uma loja: capa, resumo, vendas por mês, os 12 meses, quadro, acumulado, ranking e fecho. */
export function planoVideo(d, ritmoId = 'lento') {
  const ritmo = ritmoDe(ritmoId);
  const cenas = [
    { k: 'capa', nome: 'Capa' },
    { k: 'resumo', nome: 'Resumo do ano' },
    { k: 'mensal', nome: 'Vendas por mês' },
  ];
  if (ritmo.detalhe) d.rows.forEach((r) => cenas.push({ k: 'mes', nome: r.mes, r }));
  cenas.push(
    { k: 'quadro', nome: 'Quadro geral' },
    { k: 'acum', nome: 'Acumulado e projecção' },
    { k: 'ranking', nome: 'Meses do melhor ao pior' },
    { k: 'fecho', nome: 'Perspectiva do ano' },
  );
  return cenas.map((c) => ({ ...c, dur: durDe(c.k, ritmo) }));
}

/**
 * O plano do vídeo de todas as livrarias: capa, resumo da rede, ranking das lojas, vendas por
 * mês, um quadro por loja, um quadro por mês (com o que cada loja vendeu nesse mês), o quadro
 * das lojas, o acumulado, os meses por registar (se os houver) e o fecho.
 */
export function planoVideoConjunto(c, ritmoId = 'lento') {
  const ritmo = ritmoDe(ritmoId);
  const comDados = c.lojas.filter((l) => l.temDados);
  const cenas = [
    { k: 'capa', nome: 'Capa' },
    { k: 'resumo', nome: 'Resumo da rede' },
    { k: 'lojas', nome: 'Ranking das livrarias' },
    { k: 'mensal', nome: 'Vendas por mês' },
  ];
  if (ritmo.detalhe) {
    comDados.forEach((l) => cenas.push({ k: 'loja', nome: l.nome, l }));
    c.total.rows.forEach((r) => cenas.push({ k: 'mesRede', nome: r.mes, r }));
  }
  cenas.push({ k: 'quadro', nome: 'Quadro das livrarias' }, { k: 'acum', nome: 'Acumulado e projecção' });
  if (c.pendentes && c.pendentes.length) cenas.push({ k: 'pendentes', nome: 'Meses por registar' });
  cenas.push({ k: 'fecho', nome: 'Perspectiva do ano' });
  return cenas.map((x) => ({ ...x, dur: durDe(x.k, ritmo) }));
}

export const duracaoPlano = (plano) => Math.round(plano.reduce((s, c) => s + c.dur, 0) * 10) / 10;

/** 179 → "2 min 59 s"; 35 → "35 s". */
export function fmtDuracao(sec) {
  const t = Math.round(sec);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m ? `${m} min${s ? ' ' + String(s).padStart(2, '0') + ' s' : ''}` : `${s} s`;
}
/** 52 → "0:52". */
const relogio = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Em que quadro está o segundo `sec` do plano, e quanto dele já passou. */
export function cenaNoTempo(plano, sec) {
  let acc = 0;
  for (let i = 0; i < plano.length; i++) {
    const c = plano[i];
    if (sec < acc + c.dur) return { i, cena: c, s: sec - acc, p: (sec - acc) / c.dur };
    acc += c.dur;
  }
  const i = plano.length - 1;
  return { i, cena: plano[i], s: plano[i].dur, p: 1 };
}

// ---------- Formatação (com cêntimos: o vídeo serve para conferir) ----------
const fmt2 = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const grp = (n) => fmt2.format(Math.abs(n)).replace(/\s/g, ' ');
const kz = (n) => (n == null || !isFinite(n) ? '—' : (n < 0 ? '−' : '') + grp(n) + ' Kz');
const kzs = (n) => (n == null || !isFinite(n) ? '—' : (n >= 0 ? '+' : '−') + grp(n) + ' Kz');
const pct = (p) => (p == null || !isFinite(p) ? '—' : (p >= 0 ? '+' : '−') + Math.abs(p * 100).toFixed(1).replace('.', ',') + '%');
const pctSimples = (p) => (p == null || !isFinite(p) ? '—' : (p * 100).toFixed(1).replace('.', ',') + '%');
const mi = (n) => (n < 0 ? '−' : '') + (Math.abs(n) / 1e6).toFixed(1).replace('.', ',') + ' M';
const ord = (n) => n + 'º';

// ---------- Desenho ----------
const W = 1280;
const H = 720;
const COL = {
  bg: '#0F1B2D', card: '#16263D', card2: '#1C3050', fg: '#F4F6FA', mut: '#9AA8BC', dim: '#5F6E84',
  comp: '#9A9EA5', main: '#E0679A', mainSoft: 'rgba(224,103,154,.35)', pos: '#3DBA82', neg: '#E86060',
  teal: '#22A6A9', amber: '#F2B705', line: 'rgba(255,255,255,.12)',
};
// As cores das lojas vêm de consolidado.js (CORES_LOJAS), já atribuídas a cada loja em `c.lojas[].cor`.
const FONT = (w, px) => `${w} ${px}px Manrope, "Segoe UI", Arial, sans-serif`;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// A animação de cada quadro dura no máximo 1,4 s (ou 30% de um quadro curto); o resto é para ler.
const animDe = (cena) => Math.min(1.4, cena.dur * 0.3);
const corDe = (v) => (v == null || !isFinite(v) ? COL.mut : v >= 0 ? COL.pos : COL.neg);

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Escreve `text` reduzindo a letra até caber em `max` px. */
function txt(ctx, text, x, y, { w = 600, size = 16, color = COL.fg, align = 'left', max = 0 } = {}) {
  const s = String(text ?? '');
  let px = size;
  ctx.font = FONT(w, px);
  if (max) while (px > 10 && ctx.measureText(s).width > max) { px -= 1; ctx.font = FONT(w, px); }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
  return px;
}

function card(ctx, x, y, w, h, fill = COL.card) {
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
}

/** Fundo, logótipo (numa pastilha branca: é azul-escuro sobre transparente), título e subtítulo. */
function cabecalho(ctx, f, titulo, sub) {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
  if (f.logo) {
    const h = 40;
    const w = (f.logo.width / f.logo.height) * h;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 40, 26, w + 20, h + 12, 8);
    ctx.fill();
    ctx.drawImage(f.logo, 50, 32, w, h);
  }
  txt(ctx, f.etiqueta, W - 48, 56, { w: 600, size: 17, color: COL.mut, align: 'right', max: 640 });
  if (titulo) txt(ctx, titulo, 48, 128, { w: 800, size: 36, max: W - 96 });
  if (sub) txt(ctx, sub, 48, 158, { w: 600, size: 18, color: COL.mut, max: W - 96 });
}

/** Rodapé: o quadro, o tempo e a barra de progresso do vídeo — para parar e voltar a um ponto. */
function rodape(ctx, f, at) {
  const y = H - 30;
  txt(ctx, `Quadro ${at.i + 1} de ${f.plano.length} · ${at.cena.nome}`, 48, y, { w: 600, size: 14, color: COL.mut, max: 560 });
  txt(ctx, `${relogio(at.t)} de ${relogio(f.total)}`, W - 48, y, { w: 700, size: 14, color: COL.mut, align: 'right' });
  txt(ctx, f.fonteTxt, W / 2, y, { w: 500, size: 13, color: COL.dim, align: 'center', max: 420 });
  ctx.fillStyle = COL.line;
  ctx.fillRect(0, H - 6, W, 6);
  ctx.fillStyle = COL.main;
  ctx.fillRect(0, H - 6, W * clamp01(at.t / f.total), 6);
}

function kpiCard(ctx, x, y, w, h, label, value, delta, deltaColor, k = 1) {
  card(ctx, x, y, w, h);
  txt(ctx, label, x + 22, y + 36, { w: 700, size: 15, color: COL.mut, max: w - 44 });
  ctx.globalAlpha = 0.25 + 0.75 * k;
  txt(ctx, value, x + 22, y + 82, { w: 800, size: 30, max: w - 44 });
  ctx.globalAlpha = 1;
  if (delta) txt(ctx, delta, x + 22, y + 116, { w: 700, size: 15, color: deltaColor || COL.mut, max: w - 44 });
}

/** Linhas «rótulo …… valor» de um cartão de detalhe. */
function linhas(ctx, x, y, w, rows, { step = 30, size = 17 } = {}) {
  rows.forEach(([k, v, c], i) => {
    const yy = y + i * step;
    txt(ctx, k, x, yy, { w: 600, size: size - 1, color: COL.mut, max: w * 0.55 });
    txt(ctx, v, x + w, yy, { w: 800, size, color: c || COL.fg, align: 'right', max: w * 0.45 });
    if (i < rows.length - 1) { ctx.fillStyle = COL.line; ctx.fillRect(x, yy + step / 2 - 2, w, 1); }
  });
}

/** O máximo do eixo arredondado para cima, para as quatro marcas caírem em valores redondos. */
export function maxRedondo(max) {
  if (!(max > 0)) return 1;
  const passo = max / 4;
  const p10 = Math.pow(10, Math.floor(Math.log10(passo)));
  const n = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((m) => m * p10 >= passo - 1e-9);
  return n * p10 * 4;
}

function eixos(ctx, x, y, w, h, max, { rotulos = true } = {}) {
  ctx.strokeStyle = COL.line;
  ctx.lineWidth = 1;
  if (!rotulos) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke(); return; }
  for (let g = 0; g <= 4; g++) {
    const gy = y + h - (h * g) / 4;
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
    txt(ctx, g === 0 ? '0' : mi((max * g) / 4), x - 8, gy + 4, { w: 500, size: 13, color: COL.mut, align: 'right' });
  }
}

/** Barras dos 12 meses (comparação a cinzento, o ano a rosa; estimativa esbatida). `foco` realça um mês. */
function barrasMensais(ctx, f, rows, x, y, w, h, prog, { foco = -1, valores = true, legenda = true, rotulos = true } = {}) {
  const max = maxRedondo(Math.max(1, ...rows.map((r) => Math.max(r.v1 || 0, r.v2 ?? r.est ?? 0))));
  const step = w / 12;
  const bw = step * 0.34;
  eixos(ctx, x, y, w, h, max, { rotulos });
  rows.forEach((r, i) => {
    const local = ease(prog * 1.6 - i * 0.05);
    const cx = x + step * i + step / 2;
    const dim = foco >= 0 && foco !== i ? 0.35 : 1;
    if (f.comp && r.v1 != null) {
      const bh = (r.v1 / max) * h * local;
      ctx.globalAlpha = dim;
      ctx.fillStyle = COL.comp;
      ctx.fillRect(cx - bw - 2, y + h - bh, bw, bh);
    }
    const val = r.v2 ?? r.est;
    if (val != null) {
      const bh = (val / max) * h * local;
      ctx.globalAlpha = dim * (r.v2 == null ? 0.35 : r.estado === 'Em curso' ? 0.65 : 1);
      ctx.fillStyle = COL.main;
      ctx.fillRect(cx + 2, y + h - bh, bw, bh);
      if (r.v2 == null) {
        ctx.globalAlpha = dim; ctx.strokeStyle = COL.main; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 2, y + h - bh, bw, bh); ctx.setLineDash([]);
      }
      ctx.globalAlpha = dim * clamp01(prog * 2 - 0.6);
      if (valores && local >= 0.99) {
        txt(ctx, (r.v2 == null ? '≈' : '') + mi(val).replace(' M', 'M'), cx + 2 + bw / 2, y + h - bh - 8, { w: 700, size: 13, color: r.v2 == null ? COL.mut : COL.fg, align: 'center' });
      }
    }
    ctx.globalAlpha = 1;
    if (foco === i) {
      ctx.strokeStyle = COL.amber; ctx.lineWidth = 2;
      roundRect(ctx, x + step * i + 3, y - 6, step - 6, h + 34, 8); ctx.stroke();
    }
    txt(ctx, MESES_CURTOS[i], cx, y + h + 22, { w: foco === i ? 800 : 600, size: 14, color: foco === i ? COL.fg : COL.mut, align: 'center' });
  });
  if (!legenda) return;
  const ly = y - 18;
  let lx = x;
  const item = (cor, nome, alpha = 1) => {
    ctx.globalAlpha = alpha; ctx.fillStyle = cor; ctx.fillRect(lx, ly - 11, 14, 14); ctx.globalAlpha = 1;
    txt(ctx, nome, lx + 20, ly, { w: 600, size: 15, color: COL.mut });
    lx += 24 + ctx.measureText(nome).width + 22;
  };
  if (f.comp) item(COL.comp, String(f.comp));
  item(COL.main, String(f.ano));
  item(COL.main, 'em curso', 0.65);
  item(COL.main, 'estimativa', 0.35);
}

/** Acumulado dos dois anos e a linha da projecção. */
function linhaAcumulada(ctx, f, M, x, y, w, h, prog) {
  const rows = M.rows;
  const proj = M.R.projeccao || 0;
  const max = maxRedondo(Math.max(1, M.R.total1 || 0, proj, ...rows.map((r) => r.acum2 || 0)));
  const px = (i) => x + (w * i) / 11;
  const py = (v) => y + h - (v / max) * h;
  eixos(ctx, x, y, w, h, max);
  rows.forEach((r, i) => txt(ctx, MESES_CURTOS[i], px(i), y + h + 22, { w: 600, size: 14, color: COL.mut, align: 'center' }));
  const upto = prog * 11;
  const draw = (vals, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.beginPath();
    let started = false;
    vals.forEach((v, i) => {
      if (v == null || i > upto + 1) return;
      const t = Math.min(1, Math.max(0, upto - i + 1));
      const prev = i > 0 ? vals[i - 1] : null;
      const xx = prev != null && t < 1 ? px(i - 1) + (px(i) - px(i - 1)) * t : px(i);
      const yy = prev != null && t < 1 ? py(prev) + (py(v) - py(prev)) * t : py(v);
      if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
  };
  if (f.comp) draw(rows.map((r) => r.acum1), COL.comp);
  draw(rows.map((r) => r.acum2), COL.main);
  if (prog >= 1) {
    const last = [...rows].reverse().find((r) => r.acum2 != null);
    if (last) {
      ctx.fillStyle = COL.main; ctx.beginPath(); ctx.arc(px(last.i), py(last.acum2), 6, 0, Math.PI * 2); ctx.fill();
      txt(ctx, kz(last.acum2), px(last.i) + (last.i > 8 ? -12 : 12), py(last.acum2) - 14, { w: 800, size: 16, align: last.i > 8 ? 'right' : 'left' });
    }
    if (f.comp && M.R.total1) txt(ctx, `Total ${f.comp}: ${kz(M.R.total1)}`, x + w, py(M.R.total1) - 12, { w: 700, size: 14, color: COL.comp, align: 'right' });
    if (proj) {
      ctx.strokeStyle = COL.teal; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, py(proj)); ctx.lineTo(x + w, py(proj)); ctx.stroke(); ctx.setLineDash([]);
      txt(ctx, 'Projecção ' + kz(proj), x + w, py(proj) - 10, { w: 700, size: 15, color: COL.teal, align: 'right' });
    }
  }
}

// ---------- Quadros do vídeo de uma loja ----------

function cenaCapa(ctx, f, at, titulo, linha2, linha3) {
  cabecalho(ctx, f, '', '');
  const k = ease(at.s / animDe(at.cena));
  ctx.globalAlpha = k;
  txt(ctx, titulo, W / 2, 300, { w: 800, size: 60, align: 'center', max: W - 140 });
  txt(ctx, linha2, W / 2, 364, { w: 700, size: 32, color: COL.main, align: 'center', max: W - 140 });
  txt(ctx, linha3, W / 2, 414, { w: 600, size: 24, color: COL.mut, align: 'center', max: W - 140 });
  txt(ctx, 'Valores em Kwanzas (AOA), com cêntimos · Gerado em ' + f.geradoEm, W / 2, 470, { w: 500, size: 17, color: COL.dim, align: 'center', max: W - 140 });
  ctx.globalAlpha = 1;
}

function tilesResumo(ctx, at, tiles) {
  const cw = (W - 96 - 2 * 20) / 3;
  const ch = 150;
  tiles.forEach(([l, raw, fmtV, delta, c], i) => {
    const k = ease(at.s / animDe(at.cena) - i * 0.08);
    const v = raw == null ? '—' : fmtV(typeof raw === 'number' ? Math.round(raw * k * 100) / 100 : raw);
    kpiCard(ctx, 48 + (i % 3) * (cw + 20), 186 + Math.floor(i / 3) * (ch + 20), cw, ch, l, v, k >= 0.98 ? delta : '', c, k);
  });
}

function cenaResumo(ctx, f, at, M) {
  const R = M.R;
  const B = f.comp;
  cabecalho(ctx, f, 'Resumo do ano ' + f.ano, (R.ultimo ? `Registado até ${R.ultimo.mes}${R.ultimo.estado === 'Em curso' ? ' (em curso)' : ''} · ${R.nfech} ${R.nfech === 1 ? 'mês fechado' : 'meses fechados'}` : 'Ainda sem vendas registadas') + ' · projecção pela ' + f.critTxt);
  tilesResumo(ctx, at, [
    ['Vendas ' + f.ano + (R.ultimo ? ' · até ' + R.ultimo.mes : ''), R.ytd2, kz, R.cresc_ytd != null ? pct(R.cresc_ytd) + ' vs mesmos meses de ' + B : '', corDe(R.cresc_ytd)],
    ['Diferença no período comparável', R.dif_ytd, kzs, R.ytd1 != null ? kz(R.ytd1) + ' em ' + B : 'sem ano de comparação', corDe(R.dif_ytd)],
    ['Média mensal (meses fechados)', R.media2, kz, R.cresc_media != null ? pct(R.cresc_media) + ' vs ' + kz(R.media1) + ' em ' + B : '', corDe(R.cresc_media)],
    ['Melhor mês', R.melhor ? R.melhor.v2 : null, kz, R.melhor ? R.melhor.mes + (R.melhor.cresc != null ? ' · ' + pct(R.melhor.cresc) : '') : '', COL.mut],
    ['Projecção anual ' + f.ano, R.projeccao, kz, R.cresc_proj != null ? pct(R.cresc_proj) + ' vs total de ' + B : (R.falta != null ? 'faltam ' + kz(R.falta) : ''), corDe(R.cresc_proj)],
    M.meta
      ? ['Meta anual', M.meta, kz, Math.round((R.metaPct || 0) * 100) + '% atingido · faltam ' + kz(R.metaFalta), COL.teal]
      : (B != null ? ['Total ' + B + ' (ano completo)', R.total1, kz, R.ultrapassa ? 'ultrapassado em ' + R.ultrapassa : '', COL.mut]
        : ['Falta para a projecção', R.falta, kz, '', COL.mut]),
  ]);
  barrasMensais(ctx, f, M.rows, 64, 552, W - 112, 72, ease(at.s / (animDe(at.cena) * 1.5)), { valores: false, legenda: false, rotulos: false });
}

function cenaMensal(ctx, f, at, M, titulo) {
  cabecalho(ctx, f, titulo || 'Vendas por mês · Janeiro a Dezembro', f.comp ? `${f.ano} comparado com ${f.comp} · valores em milhões de Kz` : `${f.ano} · valores em milhões de Kz`);
  barrasMensais(ctx, f, M.rows, 110, 226, W - 158, 380, ease(at.s / (animDe(at.cena) * 1.4)));
}

/** Um mês com tudo o que tem. `M` é o modelo do ano; `extra` acrescenta linhas (encomendas, lojas). */
function cenaMes(ctx, f, at, M, r, { esquerda, extra = [] } = {}) {
  const R = M.R;
  const B = f.comp;
  const A = f.ano;
  const k = ease(at.s / animDe(at.cena));
  const estadoTxt = r.estado === 'Por preencher' ? 'Por preencher — estimativa pela ' + f.critTxt : r.estado;
  // Num mês por preencher: o crescimento e o acumulado que haveria se o mês chegasse à estimativa.
  const crescEst = r.v2 == null && r.est != null && r.v1 ? r.est / r.v1 - 1 : null;
  const acumEst = r.acum2 == null
    ? (M.rows.slice(0, r.i + 1).every((q) => q.v2 != null || q.est != null) ? M.rows.slice(0, r.i + 1).reduce((s2, q) => s2 + Math.round((q.v2 ?? q.est) * 100), 0) / 100 : null)
    : null;
  cabecalho(ctx, f, `${r.mes} de ${A}`, `Mês ${r.i + 1} de 12 · ${estadoTxt}`);
  const corEstado = r.estado === 'Fechado' ? COL.teal : r.estado === 'Em curso' ? COL.amber : COL.mut;
  ctx.fillStyle = corEstado;
  ctx.fillRect(48, 172, 64, 4);

  // Esquerda: as duas barras e o crescimento (ou o que a cena der, no vídeo conjunto).
  const lx = 48;
  const ly = 190;
  const lw = 520;
  const lh = 318;
  card(ctx, lx, ly, lw, lh);
  if (esquerda) esquerda(lx, ly, lw, lh, k);
  else {
    const val2 = r.v2 ?? r.est;
    const mx = Math.max(1, r.v1 || 0, val2 || 0);
    const base = ly + lh - 56;
    const altura = lh - 120;
    const bar = (cx, v, cor, alpha, etiqueta, valTxt) => {
      const bh = v == null ? 0 : (v / mx) * altura * k;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = cor;
      roundRect(ctx, cx, base - bh, 96, bh, 8); ctx.fill();
      ctx.globalAlpha = 1;
      if (r.v2 == null && cor === COL.main && v != null) {
        ctx.strokeStyle = COL.main; ctx.setLineDash([5, 4]); ctx.lineWidth = 2;
        roundRect(ctx, cx, base - bh, 96, bh, 8); ctx.stroke(); ctx.setLineDash([]);
      }
      txt(ctx, valTxt, cx + 48, base - bh - 12, { w: 800, size: 17, align: 'center', max: 200 });
      txt(ctx, etiqueta, cx + 48, base + 28, { w: 700, size: 17, color: COL.mut, align: 'center' });
    };
    bar(lx + 40, B != null ? r.v1 : null, COL.comp, 1, B != null ? String(B) : 'sem comparação', B != null ? kz(r.v1) : '');
    bar(lx + 190, val2, COL.main, r.v2 == null ? 0.35 : r.estado === 'Em curso' ? 0.7 : 1, String(A), (r.v2 == null && val2 != null ? '≈ ' : '') + kz(val2));
    const gx = lx + 330;
    const gmax = lw - (gx - lx) - 20;
    txt(ctx, r.v2 == null ? 'Crescimento estimado' : 'Crescimento', gx, ly + 70, { w: 700, size: 15, color: COL.mut, max: gmax });
    ctx.globalAlpha = clamp01(at.s / animDe(at.cena) * 1.5 - 0.4);
    if (r.cresc != null) {
      txt(ctx, pct(r.cresc), gx, ly + 122, { w: 800, size: 44, color: corDe(r.cresc), max: gmax });
      txt(ctx, kzs(r.dif), gx, ly + 156, { w: 700, size: 16, color: corDe(r.dif), max: gmax });
    } else if (crescEst != null) {
      txt(ctx, '≈ ' + pct(crescEst), gx, ly + 122, { w: 800, size: 36, color: COL.mut, max: gmax });
      txt(ctx, 'se o mês chegar à estimativa', gx, ly + 156, { w: 600, size: 14, color: COL.mut, max: gmax });
    } else {
      txt(ctx, r.estado === 'Por preencher' ? 'Por preencher' : 'Sem comparação', gx, ly + 116, { w: 800, size: 22, color: COL.mut, max: gmax });
    }
    if (r.estado === 'Em curso') txt(ctx, 'Mês em curso: o valor ainda pode subir', gx, ly + 186, { w: 600, size: 14, color: COL.amber, max: gmax });
    ctx.globalAlpha = 1;
  }

  // Direita: todos os números do mês.
  const rx = 588;
  const rw = W - 48 - rx;
  card(ctx, rx, ly, rw, lh);
  const ate = (v) => (v == null ? '—' : kz(v));
  const media = r.v2 != null && R.media2 ? r.v2 / R.media2 - 1 : null;
  const rows = [
    ['Vendas ' + A, r.v2 != null ? kz(r.v2) : (r.est != null ? '≈ ' + kz(r.est) + ' (estimativa)' : '—'), r.v2 == null ? COL.mut : COL.fg],
    ['Vendas ' + (B != null ? B : '— (sem comparação)'), B != null ? kz(r.v1) : '—'],
    // Na rede, o crescimento é das lojas comparáveis: quando o ano anterior comparável difere do
    // total (uma loja ainda não lançou o mês, ou é nova), mostra-se também o comparável.
    ...(B != null && r.v1c != null && r.v1c !== r.v1 ? [[`${B} nas mesmas lojas (comparável)`, kz(r.v1c)]] : []),
    ['Diferença', r.dif != null ? kzs(r.dif) : (crescEst != null ? '≈ ' + kzs(r.est - r.v1) : '—'), r.dif != null ? corDe(r.dif) : COL.mut],
    ['Crescimento', r.cresc != null ? pct(r.cresc) : (crescEst != null ? '≈ ' + pct(crescEst) : '—'), r.cresc != null ? corDe(r.cresc) : COL.mut],
    [`Acumulado ${A} até ${r.mes}`, r.acum2 != null ? kz(r.acum2) : (acumEst != null ? '≈ ' + kz(acumEst) + ' (com estimativas)' : '—'), r.acum2 != null ? COL.fg : COL.mut],
    [`Acumulado ${B != null ? B : '—'} até ${r.mes}`, B != null ? ate(r.acum1) : '—'],
    ['Peso no ano registado', r.peso == null ? '—' : pctSimples(r.peso) + ' de ' + kz(R.ytd2)],
    ['Posição', r.posicao ? `${ord(r.posicao)} de ${r.deMeses} meses fechados` : (r.estado === 'Em curso' ? 'mês em curso' : '—')],
    ['Face à média mensal de ' + A, media == null ? '—' : pct(media) + ' (média ' + kz(R.media2) + ')', corDe(media)],
    ...extra,
  ];
  const step = Math.min(30, (lh - 46) / rows.length);
  ctx.globalAlpha = clamp01(at.s / animDe(at.cena) * 2);
  linhas(ctx, rx + 22, ly + 40, rw - 44, rows, { step, size: step < 28 ? 15 : 16 });
  ctx.globalAlpha = 1;

  // Em baixo: a observação do mês e os 12 meses, com este em destaque.
  if (r.obs) txt(ctx, 'Observação: “' + r.obs + '”', 48, 538, { w: 600, size: 16, color: COL.amber, max: W - 96 });
  barrasMensais(ctx, f, M.rows, 64, r.obs ? 560 : 548, W - 112, r.obs ? 62 : 74, 1, { foco: r.i, valores: false, legenda: false, rotulos: false });
}

function cenaQuadro(ctx, f, at, M) {
  const R = M.R;
  const B = f.comp;
  cabecalho(ctx, f, 'Quadro geral · ' + f.ano + (B ? ' vs ' + B : ''), 'Valores em Kwanzas (AOA). ≈ = estimativa para os meses por preencher.');
  const cols = [
    { t: 'Mês', x: 64, a: 'left' },
    { t: B != null ? String(B) : '—', x: 420, a: 'right' },
    { t: String(f.ano), x: 640, a: 'right' },
    { t: 'Diferença', x: 840, a: 'right' },
    { t: 'Cresc.', x: 950, a: 'right' },
    { t: 'Acumulado', x: 1078, a: 'right' },
    { t: 'Estado', x: 1100, a: 'left' },
  ];
  const y0 = 196;
  const rh = 31;
  card(ctx, 48, y0 - 24, W - 96, rh * 14 + 18);
  cols.forEach((c) => txt(ctx, c.t.toUpperCase(), c.x, y0 + 4, { w: 700, size: 13, color: COL.mut, align: c.a }));
  M.rows.forEach((r, i) => {
    const k = clamp01((at.s - i * 0.07) / 0.4);
    if (k <= 0) return;
    ctx.globalAlpha = k;
    const y = y0 + rh * (i + 1);
    const est = r.v2 == null && r.est != null;
    txt(ctx, r.mes, 64, y, { w: 700, size: 15 });
    txt(ctx, B != null ? kz(r.v1) : '—', 420, y, { w: 600, size: 15, color: COL.mut, align: 'right' });
    txt(ctx, r.v2 != null ? kz(r.v2) : est ? '≈ ' + kz(r.est) : '—', 640, y, { w: 700, size: 15, color: est ? COL.mut : COL.fg, align: 'right' });
    txt(ctx, r.dif == null ? '—' : kzs(r.dif), 840, y, { w: 600, size: 15, color: corDe(r.dif), align: 'right' });
    txt(ctx, r.cresc == null ? '—' : pct(r.cresc), 950, y, { w: 700, size: 15, color: corDe(r.cresc), align: 'right' });
    txt(ctx, r.acum2 == null ? '—' : mi(r.acum2), 1078, y, { w: 600, size: 15, color: COL.mut, align: 'right' });
    txt(ctx, r.estado, 1100, y, { w: 700, size: 14, color: r.estado === 'Fechado' ? COL.teal : r.estado === 'Em curso' ? COL.amber : COL.mut, max: 120 });
    ctx.globalAlpha = 1;
  });
  const yt = y0 + rh * 13 + 4;
  ctx.fillStyle = COL.line; ctx.fillRect(64, yt - 22, W - 128, 2);
  txt(ctx, 'Comparável' + (R.ultimo ? ' (até ' + R.ultimo.mes + ')' : ''), 64, yt, { w: 800, size: 15, max: 250 });
  txt(ctx, kz(R.ytd1), 420, yt, { w: 800, size: 15, align: 'right' });
  txt(ctx, kz(R.ytd2c), 640, yt, { w: 800, size: 15, align: 'right' });
  txt(ctx, kzs(R.dif_ytd), 840, yt, { w: 800, size: 15, color: corDe(R.dif_ytd), align: 'right' });
  txt(ctx, pct(R.cresc_ytd), 950, yt, { w: 800, size: 15, color: corDe(R.cresc_ytd), align: 'right' });
  txt(ctx, `Total ${f.ano}: ${kz(R.ytd2)}${B != null ? ' · Total ' + B + ': ' + kz(R.total1) : ''} · Projecção: ${kz(R.projeccao)}`, 64, yt + 34, { w: 600, size: 15, color: COL.mut, max: W - 128 });
}

function cenaAcum(ctx, f, at, M) {
  const R = M.R;
  cabecalho(ctx, f, 'Acumulado do ano e projecção', `Critério da projecção: ${f.critTxt}` + (R.falta != null ? ` · faltam ${kz(R.falta)} para a projecção` : ''));
  linhaAcumulada(ctx, f, M, 110, 214, W - 158, 390, clamp01(at.s / Math.max(1, animDe(at.cena) * 2)));
}

function cenaRanking(ctx, f, at, M) {
  cabecalho(ctx, f, 'Meses do melhor ao pior · ' + f.ano, 'Meses fechados, pela venda. Entre parênteses, o crescimento face ao mesmo mês de ' + (f.comp ?? 'comparação') + '.');
  const lista = M.rows.filter((r) => r.estado === 'Fechado').sort((a, b) => b.v2 - a.v2);
  if (!lista.length) { txt(ctx, 'Ainda não há meses fechados.', 48, 240, { w: 600, size: 24, color: COL.mut }); return; }
  const max = lista[0].v2 || 1;
  const rh = Math.min(38, 420 / lista.length);
  lista.forEach((r, i) => {
    const y = 196 + i * rh;
    const k = ease((at.s - i * 0.08) / 0.8);
    txt(ctx, ord(i + 1), 64, y + rh * 0.62, { w: 800, size: 16, color: i < 3 ? COL.main : COL.mut });
    txt(ctx, r.mes, 110, y + rh * 0.62, { w: 700, size: 16 });
    const bw = 560 * (r.v2 / max) * k;
    ctx.fillStyle = i < 3 ? COL.main : COL.mainSoft;
    roundRect(ctx, 240, y + 6, Math.max(2, bw), rh - 12, 5); ctx.fill();
    txt(ctx, kz(r.v2), W - 220, y + rh * 0.62, { w: 800, size: 16, align: 'right' });
    txt(ctx, r.cresc == null ? '(—)' : '(' + pct(r.cresc) + ')', W - 64, y + rh * 0.62, { w: 700, size: 15, color: corDe(r.cresc), align: 'right' });
  });
}

function cenaFecho(ctx, f, at, M, titulo, nota) {
  const R = M.R;
  cabecalho(ctx, f, titulo || 'Perspectiva do ano ' + f.ano, '');
  const k = ease(at.s / animDe(at.cena));
  ctx.globalAlpha = k;
  const cw = (W - 96 - 20) / 2;
  card(ctx, 48, 190, cw, 320, COL.card2);
  txt(ctx, 'PROJECÇÃO ' + f.ano, 76, 236, { w: 800, size: 16, color: COL.main });
  txt(ctx, kz(R.projeccao), 76, 300, { w: 800, size: 40, max: cw - 56 });
  txt(ctx, R.cresc_proj != null ? pct(R.cresc_proj) + ' face ao total de ' + f.comp + ' (' + kz(R.total1) + ')' : 'sem ano de comparação', 76, 344, { w: 700, size: 17, color: corDe(R.cresc_proj), max: cw - 56 });
  txt(ctx, 'Critério: ' + f.critTxt, 76, 380, { w: 600, size: 16, color: COL.mut, max: cw - 56 });
  if (R.ultrapassa) txt(ctx, 'O total de ' + f.comp + ' foi ultrapassado em ' + R.ultrapassa + '.', 76, 416, { w: 600, size: 16, color: COL.pos, max: cw - 56 });
  const x2 = 48 + cw + 20;
  card(ctx, x2, 190, cw, 320, COL.card2);
  txt(ctx, M.meta ? 'META ' + f.ano : 'SITUAÇÃO ACTUAL', x2 + 28, 236, { w: 800, size: 16, color: COL.teal });
  txt(ctx, kz(R.ytd2), x2 + 28, 300, { w: 800, size: 40, max: cw - 56 });
  txt(ctx, 'Vendido' + (R.ultimo ? ' de Janeiro a ' + R.ultimo.mes : ''), x2 + 28, 344, { w: 700, size: 17, color: COL.mut, max: cw - 56 });
  txt(ctx, M.meta ? Math.round((R.metaPct || 0) * 100) + '% da meta de ' + kz(M.meta) + ' · faltam ' + kz(R.metaFalta) : (R.falta != null ? 'Faltam ' + kz(R.falta) + ' para a projecção' : ''), x2 + 28, 380, { w: 600, size: 16, color: COL.mut, max: cw - 56 });
  const pr = M.meta ? R.metaPct : R.progresso;
  if (pr != null) {
    ctx.fillStyle = COL.line; roundRect(ctx, x2 + 28, 410, cw - 56, 12, 6); ctx.fill();
    ctx.fillStyle = COL.teal; roundRect(ctx, x2 + 28, 410, (cw - 56) * clamp01(pr) * k, 12, 6); ctx.fill();
  }
  txt(ctx, `${f.fonte ? 'Fonte: ' + f.fonte + ' · ' : ''}Gerado em ${f.geradoEm}`, W / 2, 570, { w: 500, size: 16, color: COL.mut, align: 'center', max: W - 96 });
  if (nota) {
    // A nota do relatório (até duas linhas): o que explica os números.
    const linhasNota = partirTexto(ctx, 'Nota: ' + nota, W - 140, FONT(600, 16), 2);
    linhasNota.forEach((l, i) => txt(ctx, l, W / 2, 610 + i * 24, { w: 600, size: 16, color: COL.amber, align: 'center', max: W - 96 }));
  }
  ctx.globalAlpha = 1;
}

/** Parte um texto em linhas que cabem em `max` px (as que sobram acabam em «…»). */
function partirTexto(ctx, texto, max, font, nLinhas) {
  ctx.font = font;
  const palavras = String(texto).replace(/\s+/g, ' ').trim().split(' ');
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const tenta = atual ? atual + ' ' + p : p;
    if (ctx.measureText(tenta).width <= max || !atual) atual = tenta;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > nLinhas) {
    const corte = linhas.slice(0, nLinhas);
    corte[nLinhas - 1] = corte[nLinhas - 1].replace(/\s*\S*$/, '') + '…';
    return corte;
  }
  return linhas;
}

function desenharLoja(ctx, f, at, d) {
  const M = { rows: d.rows, R: d.R, meta: d.meta };
  const c = at.cena;
  if (c.k === 'capa') cenaCapa(ctx, f, at, 'Relatório de vendas ' + d.ano, d.loja, d.comp ? 'Comparado com ' + d.comp + ' · Janeiro a Dezembro' : 'Janeiro a Dezembro');
  else if (c.k === 'resumo') cenaResumo(ctx, f, at, M);
  else if (c.k === 'mensal') cenaMensal(ctx, f, at, M);
  else if (c.k === 'mes') {
    const n = d.sys && d.sys.counts ? d.sys.counts[c.r.i] : null;
    cenaMes(ctx, f, at, M, c.r, { extra: n != null ? [['Encomendas no sistema', String(n)]] : [] });
  } else if (c.k === 'quadro') cenaQuadro(ctx, f, at, M);
  else if (c.k === 'acum') cenaAcum(ctx, f, at, M);
  else if (c.k === 'ranking') cenaRanking(ctx, f, at, M);
  else cenaFecho(ctx, f, at, M);
  rodape(ctx, f, at);
}

// ---------- Quadros do vídeo de todas as livrarias ----------

function cenaLojas(ctx, f, at, c) {
  const B = c.comp;
  cabecalho(ctx, f, 'Ranking das livrarias · ' + c.ano, 'Vendas registadas no ano, a quota de cada loja na rede e o crescimento no período comparável' + (B ? ' face a ' + B : '') + '.');
  const lista = c.lojas.filter((l) => l.temDados);
  if (!lista.length) { txt(ctx, 'Nenhuma livraria tem vendas registadas em ' + c.ano + '.', 48, 240, { w: 600, size: 24, color: COL.mut }); return; }
  const max = Math.max(1, ...lista.map((l) => l.M.R.ytd2));
  const rh = Math.min(52, 430 / lista.length);
  lista.forEach((l, i) => {
    const y = 192 + i * rh;
    const k = ease((at.s - i * 0.1) / 0.9);
    const yy = y + rh * 0.6;
    txt(ctx, ord(l.posicao || i + 1), 64, yy, { w: 800, size: 18, color: l.cor });
    txt(ctx, l.nome, 112, yy, { w: 700, size: 17, max: 280 });
    const bw = 380 * (l.M.R.ytd2 / max) * k;
    ctx.fillStyle = l.cor; roundRect(ctx, 410, y + 8, Math.max(2, bw), rh - 16, 6); ctx.fill();
    txt(ctx, kz(l.M.R.ytd2), 1000, yy, { w: 800, size: 17, align: 'right' });
    txt(ctx, pctSimples(l.quota), 1100, yy, { w: 700, size: 16, color: COL.mut, align: 'right' });
    txt(ctx, pct(l.M.R.cresc_ytd), W - 64, yy, { w: 700, size: 16, color: corDe(l.M.R.cresc_ytd), align: 'right' });
  });
  const yh = 178;
  txt(ctx, 'VENDAS ' + c.ano, 1000, yh, { w: 700, size: 12, color: COL.mut, align: 'right' });
  txt(ctx, 'QUOTA', 1100, yh, { w: 700, size: 12, color: COL.mut, align: 'right' });
  txt(ctx, 'CRESC.', W - 64, yh, { w: 700, size: 12, color: COL.mut, align: 'right' });
}

/** Vendas por mês da rede, empilhadas por loja, com a rede do ano de comparação ao lado. */
function cenaMensalRede(ctx, f, at, c) {
  cabecalho(ctx, f, 'Vendas por mês · todas as livrarias', `${c.ano}${c.comp ? ' comparado com ' + c.comp : ''} · cada cor é uma loja · valores em milhões de Kz`);
  const rows = c.total.rows;
  const x = 110; const y = 232; const w = W - 158; const h = 360;
  const max = maxRedondo(Math.max(1, ...rows.map((r) => Math.max(r.v1 || 0, r.v2 ?? r.est ?? 0))));
  eixos(ctx, x, y, w, h, max);
  const step = w / 12;
  const bw = step * 0.36;
  const prog = ease(at.s / (animDe(at.cena) * 1.4));
  rows.forEach((r, i) => {
    const cx = x + step * i + step / 2;
    const local = ease(prog * 1.6 - i * 0.05);
    if (c.comp && r.v1 != null) {
      const bh = (r.v1 / max) * h * local;
      ctx.fillStyle = COL.comp; ctx.fillRect(cx - bw - 2, y + h - bh, bw, bh);
    }
    let acc = 0;
    c.meses[i].porLoja.forEach((p) => {
      if (p.v2 == null) return;
      const bh = (p.v2 / max) * h * local;
      ctx.fillStyle = p.cor;
      ctx.globalAlpha = p.estado === 'Em curso' ? 0.7 : 1;
      ctx.fillRect(cx + 2, y + h - acc - bh, bw, bh);
      ctx.globalAlpha = 1;
      acc += bh;
    });
    // Por preencher: a estimativa a tracejado; parcial: a parte que ainda falta, a tracejado.
    const alvo = r.v2 == null ? r.est : (r.estado === 'Em curso' && r.projMes > r.v2 ? r.projMes : null);
    if (alvo != null) {
      const topo = (alvo / max) * h * local;
      const fundo = r.v2 == null ? 0 : (r.v2 / max) * h * local;
      ctx.strokeStyle = COL.main; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.strokeRect(cx + 2, y + h - topo, bw, topo - fundo); ctx.setLineDash([]);
    }
    const val = r.v2 ?? r.est;
    if (val != null && local >= 0.99) txt(ctx, (r.v2 == null ? '≈' : '') + mi(val).replace(' M', 'M'), cx + 2 + bw / 2, y + h - (val / max) * h - 8, { w: 700, size: 13, color: r.v2 == null ? COL.mut : COL.fg, align: 'center' });
    txt(ctx, MESES_CURTOS[i], cx, y + h + 22, { w: 600, size: 14, color: COL.mut, align: 'center' });
  });
  // Legenda das lojas.
  let lx = x;
  const ly = y - 22;
  const itens = (c.comp ? [{ nome: String(c.comp), cor: COL.comp }] : []).concat(c.lojas.filter((l) => l.temDados));
  itens.forEach((l) => {
    ctx.font = FONT(600, 14);
    const tw = Math.min(170, ctx.measureText(l.nome).width);
    if (lx + 20 + tw > x + w) return;
    ctx.fillStyle = l.cor; ctx.fillRect(lx, ly - 11, 14, 14);
    txt(ctx, l.nome, lx + 20, ly, { w: 600, size: 14, color: COL.mut, max: 170 });
    lx += 20 + tw + 20;
  });
}

function cenaLoja(ctx, f, at, c, l) {
  const M = l.M;
  const R = M.R;
  const B = c.comp;
  cabecalho(ctx, f, l.nome, `${l.provincia ? l.provincia + ' · ' : ''}${ord(l.posicao)} de ${c.lojas.filter((x) => x.temDados).length} livrarias · ${pctSimples(l.quota)} das vendas da rede${l.fonte ? ' · Fonte: ' + l.fonte : ''}`);
  ctx.fillStyle = l.cor; ctx.fillRect(48, 172, 64, 4);
  tilesResumo(ctx, at, [
    ['Vendas ' + c.ano + (R.ultimo ? ' · até ' + R.ultimo.mes : ''), R.ytd2, kz, R.cresc_ytd != null ? pct(R.cresc_ytd) + ' vs mesmos meses de ' + B : 'sem comparação', corDe(R.cresc_ytd)],
    ['Média mensal (meses fechados)', R.media2, kz, R.media1 != null ? 'vs ' + kz(R.media1) + ' em ' + B : '', corDe(R.cresc_media)],
    ['Melhor mês', R.melhor ? R.melhor.v2 : null, kz, R.melhor ? R.melhor.mes : '', COL.mut],
    ['Projecção anual', R.projeccao, kz, 'critério: ' + M.critTxt, corDe(R.cresc_proj)],
    ['Total ' + (B ?? '—'), R.total1, kz, B ? 'ano completo' : '', COL.mut],
    ['Meses registados', R.nregistados, (n) => `${Math.round(n)} de 12`, `${R.nfech} fechados${l.atrasados ? ' · faltam ' + l.atrasados.join(', ') : ''}`, l.atrasados ? COL.amber : COL.mut],
  ]);
  barrasMensais(ctx, { ...f, comp: B }, M.rows, 64, 552, W - 112, 72, ease(at.s / (animDe(at.cena) * 1.5)), { valores: false, legenda: false, rotulos: false });
}

/** Um mês da rede: à esquerda o que cada loja vendeu nesse mês; à direita os números da rede. */
function cenaMesRede(ctx, f, at, c, r) {
  const mes = c.meses[r.i];
  const lojas = mes.porLoja;
  const comValor = lojas.filter((p) => p.v2 != null);
  const extra = [['Lojas com o mês registado', `${comValor.length} de ${lojas.length}`, comValor.length < lojas.length ? COL.amber : COL.fg]];
  cenaMes(ctx, f, at, c.total, r, {
    extra,
    esquerda: (x, y, w, h, k) => {
      txt(ctx, 'Por livraria', x + 22, y + 36, { w: 700, size: 15, color: COL.mut });
      txt(ctx, 'CRESC.', x + w - 22, y + 36, { w: 700, size: 12, color: COL.mut, align: 'right' });
      const max = Math.max(1, ...lojas.map((p) => Math.max(p.v2 ?? p.est ?? 0, p.v1 || 0)));
      const rh = Math.min(34, (h - 60) / Math.max(1, lojas.length));
      lojas.forEach((p, i) => {
        const yy = y + 56 + i * rh;
        txt(ctx, p.nome, x + 22, yy + rh * 0.62, { w: 700, size: 14, max: 150 });
        const v = p.v2 ?? p.est;
        const bw = v == null ? 0 : 150 * (v / max) * k;
        ctx.globalAlpha = p.v2 == null ? 0.35 : 1;
        ctx.fillStyle = p.cor; roundRect(ctx, x + 180, yy + 6, Math.max(2, bw), rh - 12, 4); ctx.fill();
        ctx.globalAlpha = 1;
        txt(ctx, p.v2 != null ? kz(p.v2) : (p.est != null ? '≈ ' + kz(p.est) : 'por registar'), x + w - 92, yy + rh * 0.62, { w: 700, size: 14, color: p.v2 == null ? COL.mut : COL.fg, align: 'right', max: 160 });
        txt(ctx, p.cresc == null ? '—' : pct(p.cresc), x + w - 22, yy + rh * 0.62, { w: 700, size: 13, color: corDe(p.cresc), align: 'right', max: 66 });
      });
    },
  });
}

function cenaQuadroRede(ctx, f, at, c) {
  const B = c.comp;
  const R = c.total.R;
  cabecalho(ctx, f, 'Quadro das livrarias · ' + c.ano + (B ? ' vs ' + B : ''), 'Comparável: as lojas e os meses com valor nos dois anos, loja a loja. Valores em Kwanzas (AOA).');
  const cols = [
    { t: 'Livraria', x: 64, a: 'left' },
    { t: B != null ? 'Comparável ' + B : '—', x: 470, a: 'right' },
    { t: 'Vendas ' + c.ano, x: 680, a: 'right' },
    { t: 'Cresc.', x: 790, a: 'right' },
    { t: 'Quota', x: 880, a: 'right' },
    { t: 'Projecção', x: 1090, a: 'right' },
    { t: 'Meses', x: W - 64, a: 'right' },
  ];
  const lista = c.lojas.filter((l) => l.temDados);
  const y0 = 200;
  const rh = Math.min(36, 360 / Math.max(1, lista.length));
  card(ctx, 48, y0 - 26, W - 96, rh * (lista.length + 1) + 124);
  cols.forEach((col) => txt(ctx, col.t.toUpperCase(), col.x, y0 + 2, { w: 700, size: 12, color: COL.mut, align: col.a }));
  lista.forEach((l, i) => {
    const k = clamp01((at.s - i * 0.08) / 0.4);
    if (k <= 0) return;
    ctx.globalAlpha = k;
    const y = y0 + rh * (i + 1);
    const LR = l.M.R;
    ctx.fillStyle = l.cor; ctx.fillRect(64, y - 12, 4, 14);
    txt(ctx, l.nome, 76, y, { w: 700, size: 15, max: 270 });
    txt(ctx, B != null ? kz(LR.ytd1) : '—', 470, y, { w: 600, size: 15, color: COL.mut, align: 'right' });
    txt(ctx, kz(LR.ytd2), 680, y, { w: 700, size: 15, align: 'right' });
    txt(ctx, pct(LR.cresc_ytd), 790, y, { w: 700, size: 15, color: corDe(LR.cresc_ytd), align: 'right' });
    txt(ctx, pctSimples(l.quota), 880, y, { w: 600, size: 15, color: COL.mut, align: 'right' });
    txt(ctx, kz(LR.projeccao), 1090, y, { w: 600, size: 15, align: 'right' });
    txt(ctx, `${LR.nregistados}/12`, W - 64, y, { w: 600, size: 15, color: l.atrasados ? COL.amber : COL.mut, align: 'right' });
    ctx.globalAlpha = 1;
  });
  const yt = y0 + rh * (lista.length + 1) + 18;
  ctx.fillStyle = COL.line; ctx.fillRect(64, yt - 24, W - 128, 2);
  txt(ctx, 'Rede', 76, yt, { w: 800, size: 16 });
  txt(ctx, B != null ? kz(R.ytd1) : '—', 470, yt, { w: 800, size: 16, align: 'right' });
  txt(ctx, kz(R.ytd2), 680, yt, { w: 800, size: 16, align: 'right' });
  txt(ctx, pct(R.cresc_ytd), 790, yt, { w: 800, size: 16, color: corDe(R.cresc_ytd), align: 'right' });
  txt(ctx, '100%', 880, yt, { w: 700, size: 16, color: COL.mut, align: 'right' });
  txt(ctx, kz(R.projeccao), 1090, yt, { w: 800, size: 16, align: 'right' });
  // O crescimento da rede é o das lojas comparáveis; as contas, à vista.
  if (B != null) {
    txt(ctx, R.ytd1 != null
      ? `Crescimento das lojas comparáveis: ${kz(R.ytd2c)} em ${c.ano} contra ${kz(R.ytd1)} em ${B} (${pct(R.cresc_ytd)}) · total da rede em ${B}: ${kz(R.total1)}`
      : `Nenhuma loja tem meses comparáveis com ${B}.`, 76, yt + 36, { w: 600, size: 15, color: COL.mut, max: W - 152 });
  }
}

function cenaPendentes(ctx, f, at, c) {
  cabecalho(ctx, f, 'Meses por registar', `Até ${c.ultimoMesRede || '—'}, o último mês que alguma livraria já registou. Sem estes meses os totais da rede ficam abaixo do real.`);
  const k = ease(at.s / animDe(at.cena));
  ctx.globalAlpha = k;
  const rh = Math.min(56, 420 / Math.max(1, c.pendentes.length));
  c.pendentes.forEach((p, i) => {
    const y = 196 + i * rh;
    card(ctx, 48, y, W - 96, rh - 10, COL.card);
    ctx.fillStyle = COL.amber; ctx.fillRect(48, y, 6, rh - 10);
    txt(ctx, p.nome, 76, y + rh * 0.52, { w: 800, size: 18, max: 380 });
    txt(ctx, p.meses.join(', '), W - 76, y + rh * 0.52, { w: 600, size: 17, color: COL.amber, align: 'right', max: 700 });
  });
  ctx.globalAlpha = 1;
}

function desenharConjunto(ctx, f, at, c) {
  const M = c.total;
  const cena = at.cena;
  const nLojas = c.lojas.filter((l) => l.temDados).length;
  if (cena.k === 'capa') cenaCapa(ctx, f, at, 'Relatório conjunto ' + c.ano, 'Todas as livrarias' + (nLojas ? ' · ' + nLojas + (nLojas === 1 ? ' loja' : ' lojas') : ''), c.comp ? 'Comparado com ' + c.comp + ' · Janeiro a Dezembro' : 'Janeiro a Dezembro');
  else if (cena.k === 'resumo') cenaResumo(ctx, f, at, M);
  else if (cena.k === 'lojas') cenaLojas(ctx, f, at, c);
  else if (cena.k === 'mensal') cenaMensalRede(ctx, f, at, c);
  else if (cena.k === 'loja') cenaLoja(ctx, f, at, c, cena.l);
  else if (cena.k === 'mesRede') cenaMesRede(ctx, f, at, c, cena.r);
  else if (cena.k === 'quadro') cenaQuadroRede(ctx, f, at, c);
  else if (cena.k === 'acum') cenaAcum(ctx, f, at, M);
  else if (cena.k === 'pendentes') cenaPendentes(ctx, f, at, c);
  else cenaFecho(ctx, f, at, M, 'Perspectiva da rede · ' + c.ano, c.nota);
  rodape(ctx, f, at);
}

// ---------- Gravação ----------

function escolherFormato() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('Este navegador não consegue gravar vídeo. Use o Chrome, o Edge ou o Firefox actualizados.');
  }
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Este navegador não tem nenhum formato de vídeo disponível para gravar.');
  return mime;
}

/**
 * Grava o plano num vídeo. `desenhar(ctx, at)` desenha o instante `at` = { i, cena, s, p, t }.
 * onProgress(segundos, total, cena). `signal` (AbortSignal) pára a gravação a meio.
 */
async function gravar(plano, desenhar, { onProgress, signal } = {}) {
  const mime = escolherFormato();
  const FPS = 30;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const total = duracaoPlano(plano);
  const frame = (sec) => { const at = cenaNoTempo(plano, sec); desenhar(ctx, { ...at, t: sec }); return at; };
  frame(0);
  const stream = canvas.captureStream(FPS);
  // O conteúdo é quase sempre parado: 5 Mb/s chegam para os números ficarem nítidos.
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start(1000);
  const t0 = performance.now();
  let cancelado = false;
  await new Promise((resolve) => {
    // setInterval continua (mais devagar) com o separador em segundo plano; requestAnimationFrame pararia.
    const id = setInterval(() => {
      if (signal && signal.aborted) { cancelado = true; clearInterval(id); resolve(); return; }
      const sec = (performance.now() - t0) / 1000;
      const at = frame(Math.min(sec, total));
      onProgress?.(Math.min(sec, total), total, at.cena);
      if (sec >= total + 0.4) { clearInterval(id); resolve(); }
    }, 1000 / FPS);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  if (cancelado) { const e = new Error('Gravação do vídeo cancelada.'); e.name = 'AbortError'; throw e; }
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', duracao: total };
}

const fonteTxtDe = (fonte) => (fonte ? 'Fonte: ' + fonte : 'Livraria e Editora Adventista');

/** Prepara o que todos os quadros de um vídeo precisam (logótipo, plano, etiqueta do topo). */
async function preparar(base, plano) {
  return { ...base, plano, total: duracaoPlano(plano), logo: await loadImage(base.logoSrc) };
}

/**
 * Vídeo de uma loja (1280×720). `d` vem de exportData() em painel.js.
 * opts = { ritmo: 'lento' | 'normal' | 'curto', signal }.
 */
export async function renderVideo(d, onProgress, opts = {}) {
  const plano = planoVideo(d, opts.ritmo);
  const f = await preparar({
    ano: d.ano, comp: d.comp, critTxt: d.critTxt, fonte: d.fonte, fonteTxt: fonteTxtDe(d.fonte), geradoEm: d.geradoEm,
    etiqueta: `${d.loja} · ${d.ano}${d.comp ? ' vs ' + d.comp : ''}`, logoSrc: d.logo,
  }, plano);
  return gravar(plano, (ctx, at) => desenharLoja(ctx, f, at, d), { onProgress, signal: opts.signal });
}

/**
 * Vídeo de todas as livrarias (1280×720). `c` vem de buildConsolidado() (consolidado.js) com
 * `geradoEm` e `logo` acrescentados pelo ecrã. opts = { ritmo, signal }.
 */
export async function renderVideoConjunto(c, onProgress, opts = {}) {
  const plano = planoVideoConjunto(c, opts.ritmo);
  const f = await preparar({
    ano: c.ano, comp: c.comp, critTxt: c.total.critTxt, fonte: '', fonteTxt: 'Relatório conjunto das livrarias', geradoEm: c.geradoEm,
    etiqueta: `Todas as livrarias · ${c.ano}${c.comp ? ' vs ' + c.comp : ''}`, logoSrc: c.logo,
  }, plano);
  return gravar(plano, (ctx, at) => desenharConjunto(ctx, f, at, c), { onProgress, signal: opts.signal });
}

/**
 * Desenha um instante do vídeo num canvas, sem gravar: para pré-visualizar um quadro e para
 * conferir o desenho num navegador de testes. `tipo` = 'loja' | 'conjunto'.
 */
export async function quadroDoVideo(tipo, dados, sec, opts = {}) {
  const conjunto = tipo === 'conjunto';
  const plano = conjunto ? planoVideoConjunto(dados, opts.ritmo) : planoVideo(dados, opts.ritmo);
  const f = await preparar(conjunto
    ? { ano: dados.ano, comp: dados.comp, critTxt: dados.total.critTxt, fonte: '', fonteTxt: 'Relatório conjunto das livrarias', geradoEm: dados.geradoEm, etiqueta: `Todas as livrarias · ${dados.ano}${dados.comp ? ' vs ' + dados.comp : ''}`, logoSrc: dados.logo }
    : { ano: dados.ano, comp: dados.comp, critTxt: dados.critTxt, fonte: dados.fonte, fonteTxt: fonteTxtDe(dados.fonte), geradoEm: dados.geradoEm, etiqueta: `${dados.loja} · ${dados.ano}${dados.comp ? ' vs ' + dados.comp : ''}`, logoSrc: dados.logo },
  plano);
  const canvas = opts.canvas || Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const at = { ...cenaNoTempo(plano, sec), t: sec };
  if (conjunto) desenharConjunto(ctx, f, at, dados); else desenharLoja(ctx, f, at, dados);
  return { canvas, plano, at };
}
