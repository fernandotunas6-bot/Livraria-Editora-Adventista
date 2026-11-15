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
import { MESES, MESES_CURTOS, periodoAte, previsaoDoAno } from './modelo.js';
import { TEMAS, carregarImagem, desenharFoto, desenharLivro, desenharMuralCapas, desenharPaisagem, rng, veu } from './imagens-video.js';
import { capasParaFundo } from './capas-de-fundo.js';
import { destaqueDe } from './destaques.js';
import { carregarFontes, fonteCanvas } from '../lib/fontes.js';
import { esticarPlano, guiaoDoVideo, legendaNoTempo, tempoDasLegendas } from './guiao-video.js';
import { pistaDeEfeitos } from './deixas-video.js';

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
  lojas: 12, loja: 10, mesRede: 10, pendentes: 9, destaque: 10, maisVendidos: 11,
};

/** Os fundos dos quadros com imagem (capa, mais vendidos, fecho). */
export const FUNDOS = {
  capas: 'Capas animadas',
  natureza: 'Paisagens animadas',
  biblioteca: 'Fotografias da biblioteca',
  simples: 'Simples (escuro)',
};

/** Os quadros dos mais vendidos, quando há dados de produtos para o âmbito do vídeo. */
function cenasMaisVendidos(ambito, ritmo) {
  if (!ambito || !ambito.ano || !ambito.ano.length) return [];
  const cenas = [{ k: 'destaque', nome: 'O mais vendido do ano' }];
  if (ritmo.detalhe && ambito.ano.length > 1) cenas.push({ k: 'maisVendidos', nome: 'Os mais vendidos' });
  return cenas;
}

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
  // Com um filtro de período, só os meses do filtro têm quadro próprio.
  if (ritmo.detalhe) d.rows.filter((r) => !r.fora).forEach((r) => cenas.push({ k: 'mes', nome: r.mes, r }));
  cenas.push(
    { k: 'quadro', nome: 'Quadro geral' },
    { k: 'acum', nome: 'Acumulado e projecção' },
    { k: 'ranking', nome: 'Meses do melhor ao pior' },
    ...cenasMaisVendidos(d.destaques, ritmo),
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
  cenas.push(...cenasMaisVendidos(c.destaques && c.destaques.rede, ritmo));
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
const FONT = (w, px) => fonteCanvas(w, px);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// A animação de cada quadro dura no máximo 1,4 s (ou 30% de um quadro curto); o resto é para ler.
const animDe = (cena) => Math.min(1.4, cena.dur * 0.3);
const corDe = (v) => (v == null || !isFinite(v) ? COL.mut : v >= 0 ? COL.pos : COL.neg);


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
function txt(ctx, text, x, y, { w = 600, size = 16, color = COL.fg, align = 'left', max = 0, titulo = false } = {}) {
  const s = String(text ?? '');
  let px = size;
  const fonte = (p) => (titulo ? fonteCanvas(w, p, { titulo: true }) : FONT(w, p));
  ctx.font = fonte(px);
  if (max) while (px > 10 && ctx.measureText(s).width > max) { px -= 1; ctx.font = fonte(px); }
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

/**
 * O fundo dos quadros de números: escuro, com duas manchas de luz a mexer devagar (não tiram a
 * leitura). `f.t` é o segundo do vídeo, para a luz continuar de um quadro para o outro.
 */
function fundoDados(ctx, f) {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);
  if (f.fundo === 'simples') return;
  const t = f.t || 0;
  // Com «Capas animadas», as capas continuam a passar ao fundo dos números, desfocadas e muito
  // ténues: o vídeo não muda de mundo entre os quadros de imagem e os de números.
  if (f.fundo === 'capas' && f.mural && f.mural.length) {
    desenharMuralCapas(ctx, W, H, f.mural, t, { semente: 1, foco: 'fundo', intensidade: 0.22, efeitos: false });
    ctx.fillStyle = 'rgba(15,27,45,0.55)';
    ctx.fillRect(0, 0, W, H);
  }
  [[0.85, 0.15, 'rgba(34,166,169,0.10)', 0.11], [0.12, 0.92, 'rgba(224,103,154,0.09)', 0.07]].forEach(([x, y, cor, v], i) => {
    const cx = W * (x + Math.sin(t * v + i) * 0.05);
    const cy = H * (y + Math.cos(t * v * 0.8 + i) * 0.05);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.45);
    g.addColorStop(0, cor);
    g.addColorStop(1, 'rgba(15,27,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
}

/**
 * O fundo dos quadros com imagem: uma paisagem animada, uma fotografia da biblioteca (com
 * movimento lento) ou o escuro, conforme `f.fundo`; `n` escolhe qual. Depois o véu, para o
 * texto se ler.
 */
function fundoImagem(ctx, f, at, n, lado = 'esquerda', { desfoque = 0 } = {}) {
  const fotos = f.fotos || [];
  if (f.fundo === 'capas' && f.mural && f.mural.length) {
    // O tempo do vídeo (e não o do quadro): o movimento continua de um quadro para o outro.
    desenharMuralCapas(ctx, W, H, f.mural, at.t != null ? at.t : at.s, { semente: 1, foco: desfoque ? 'fundo' : 'frente' });
  } else if (f.fundo === 'biblioteca' && fotos.length) desenharFoto(ctx, W, H, fotos[n % fotos.length], at.p, n, { desfoque });
  else if (f.fundo !== 'simples') desenharPaisagem(ctx, W, H, TEMAS[n % TEMAS.length], at.s);
  else { fundoDados(ctx, f); return; }
  veu(ctx, W, H, lado, f.fundo === 'capas' ? 0.9 : 0.82);
}

/** Fundo, logótipo (numa pastilha branca: é azul-escuro sobre transparente), título e subtítulo. */
function cabecalho(ctx, f, titulo, sub, { semFundo = false, subMax = 0 } = {}) {
  if (!semFundo) fundoDados(ctx, f);
  if (f.logoClaro) {
    // O logótipo branco, PNG transparente, discreto: sem pastilha e um pouco esbatido.
    const h = 34;
    const w = (f.logoClaro.width / f.logoClaro.height) * h;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(f.logoClaro, 46, 30, w, h);
    ctx.restore();
  } else if (f.logo) {
    const h = 40;
    const w = (f.logo.width / f.logo.height) * h;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 40, 26, w + 20, h + 12, 8);
    ctx.fill();
    ctx.drawImage(f.logo, 50, 32, w, h);
  }
  txt(ctx, f.etiqueta, W - 48, 56, { w: 600, size: 17, color: COL.mut, align: 'right', max: 640 });
  if (titulo) txt(ctx, titulo, 48, 128, { w: 600, size: 36, max: W - 96, titulo: true });
  if (sub) txt(ctx, sub, 48, 158, { w: 600, size: 18, color: semFundo ? '#C9D3E2' : COL.mut, max: subMax || W - 96 });
}

/** Rodapé: o quadro, o tempo e a barra de progresso do vídeo — para parar e voltar a um ponto. */
function rodape(ctx, f, at) {
  // Com legendas, o rodapé desce um pouco e mais pequeno: a legenda fica entre ele e os números.
  const y = f.comLegendas ? H - 15 : H - 30;
  const px = f.comLegendas ? 12 : 14;
  txt(ctx, `Quadro ${at.i + 1} de ${f.plano.length} · ${at.cena.nome}`, 48, y, { w: 600, size: px, color: COL.mut, max: 560 });
  txt(ctx, `${relogio(at.t)} de ${relogio(f.total)}`, W - 48, y, { w: 700, size: px, color: COL.mut, align: 'right' });
  txt(ctx, f.fonteTxt, W / 2, y, { w: 500, size: px - 1, color: COL.dim, align: 'center', max: 420 });
  ctx.fillStyle = COL.line;
  ctx.fillRect(0, H - 6, W, 6);
  ctx.fillStyle = COL.main;
  ctx.fillRect(0, H - 6, W * clamp01(at.t / f.total), 6);
}

function kpiCard(ctx, x, y, w, h, label, value, delta, deltaColor, k = 1) {
  card(ctx, x, y, w, h);
  txt(ctx, label, x + 22, y + 36, { w: 700, size: 15, color: COL.mut, max: w - 44 });
  ctx.globalAlpha = 0.25 + 0.75 * k;
  txt(ctx, value, x + 22, y + 82, { w: 700, size: 30, max: w - 44 });
  ctx.globalAlpha = 1;
  if (delta) txt(ctx, delta, x + 22, y + 116, { w: 700, size: 15, color: deltaColor || COL.mut, max: w - 44 });
}

/** Linhas «rótulo …… valor» de um cartão de detalhe. */
function linhas(ctx, x, y, w, rows, { step = 30, size = 17 } = {}) {
  rows.forEach(([k, v, c], i) => {
    const yy = y + i * step;
    txt(ctx, k, x, yy, { w: 600, size: size - 1, color: COL.mut, max: w * 0.55 });
    txt(ctx, v, x + w, yy, { w: 700, size, color: c || COL.fg, align: 'right', max: w * 0.45 });
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
      txt(ctx, kz(last.acum2), px(last.i) + (last.i > 8 ? -12 : 12), py(last.acum2) - 14, { w: 700, size: 16, align: last.i > 8 ? 'right' : 'left' });
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

// ---------- Livros (capas do catálogo) ----------
const imagemDe = (f, item) => (item && item.capa && f.imagens ? f.imagens.get(item.capa) || null : null);
const unid = (n) => {
  const v = Math.round(Number(n) * 100) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (v === 1 ? ' unidade' : ' unidades');
};
const ORIGEM = { sistema: 'encomendas do site', manual: 'lançado à mão', misto: 'site e lançado à mão' };

/** Até `n` livros em leque (os mais vendidos), a entrar um a um. */
function leque(ctx, f, at, lista, cx, cy, h, n = 3) {
  const itens = (lista || []).slice(0, n);
  const ordem = itens.map((it, i) => ({ it, i })).reverse(); // o primeiro fica à frente
  ordem.forEach(({ it, i }) => {
    const k = ease((at.s - 0.3 - i * 0.25) / 0.9);
    if (k <= 0) return;
    const dx = (i === 0 ? 0 : i === 1 ? -1 : 1) * h * 0.46;
    const esc = i === 0 ? 1 : 0.82;
    desenharLivro(ctx, { img: imagemDe(f, it), titulo: it.titulo, cx: cx + dx, cy: cy + (1 - k) * 40 + (i ? h * 0.06 : 0), h: h * esc, t: at.s + i, giro: 0.36 + i * 0.05, alpha: k });
  });
}

function cenaCapa(ctx, f, at, titulo, linha2, linha3, livros) {
  fundoImagem(ctx, f, at, 0, 'esquerda', { desfoque: livros && livros.length ? 6 : 0 });
  cabecalho(ctx, f, '', '', { semFundo: true });
  const k = ease(at.s / animDe(at.cena));
  const temLivros = livros && livros.length;
  const x = temLivros ? 64 : W / 2;
  const al = temLivros ? 'left' : 'center';
  const max = temLivros ? 640 : W - 140;
  ctx.globalAlpha = k;
  txt(ctx, titulo, x, 300 + (1 - k) * 20, { w: 600, size: 58, align: al, max, titulo: true });
  txt(ctx, linha2, x, 362, { w: 700, size: 32, color: COL.main, align: al, max });
  txt(ctx, linha3, x, 410, { w: 600, size: 24, color: '#D5DCE8', align: al, max });
  txt(ctx, 'Valores em Kwanzas (AOA), com cêntimos · Gerado em ' + f.geradoEm, x, 462, { w: 500, size: 17, color: '#B7C2D3', align: al, max });
  ctx.globalAlpha = 1;
  if (temLivros) {
    leque(ctx, f, at, livros, 960, 380, 330);
    ctx.globalAlpha = ease((at.s - 1.2) / 0.8);
    txt(ctx, 'Os mais vendidos do ano', 960, 600, { w: 700, size: 16, color: '#E6ECF5', align: 'center' });
    ctx.globalAlpha = 1;
  }
}

/** O mais vendido do ano: o livro grande à direita e os seus números à esquerda. */
function cenaDestaque(ctx, f, at, ambito, rotulo) {
  const d = destaqueDe(ambito);
  fundoImagem(ctx, f, at, 1, 'esquerda', { desfoque: 10 });
  cabecalho(ctx, f, '', '', { semFundo: true });
  if (!d) return;
  const k = ease(at.s / animDe(at.cena));
  const kb = ease((at.s - 0.2) / 1.1);
  desenharLivro(ctx, { img: imagemDe(f, d), titulo: d.titulo, cx: 940, cy: 380 + (1 - kb) * 60, h: 440, t: at.s, giro: 0.4, alpha: kb });
  ctx.globalAlpha = k;
  const linhas = partirTexto(ctx, d.titulo, 556, FONT(700, 38), 3);
  const y0 = 222 + linhas.length * 46 + 8;
  // O cartão à medida do que leva (o título pode ter uma a três linhas).
  const alto = y0 + 178 + 34 - 120;
  const topoCartao = Math.max(110, 360 - alto / 2);
  const dy = topoCartao - 120;
  ctx.save();
  ctx.translate(0, dy);
  ctx.fillStyle = 'rgba(10,18,32,0.62)';
  roundRect(ctx, 48, 120, 620, alto, 20); ctx.fill();
  txt(ctx, `O MAIS VENDIDO DE ${f.ano}${rotulo ? ' · ' + rotulo.toUpperCase() : ''}`, 80, 170, { w: 700, size: 17, color: COL.main, max: 560 });
  linhas.forEach((l, i) => txt(ctx, l, 80, 222 + i * 46, { w: 700, size: 38, max: 556 }));
  const quadro = [
    ['Unidades vendidas', unid(d.unidades)],
    ['Valor das vendas', d.valor != null ? kz(d.valor) : '—'],
    ['Melhor mês', d.melhorMes != null ? `${MESES[d.melhorMes]} · ${unid(d.melhorUnid)}` : '—'],
    ['Meses em 1.º lugar', `${d.mesesNoTopo} de 12`],
  ];
  quadro.forEach(([rot, val], i) => {
    const x = 80 + (i % 2) * 290;
    const y = y0 + Math.floor(i / 2) * 84;
    txt(ctx, rot, x, y + 20, { w: 700, size: 15, color: '#AEBBCD', max: 270 });
    txt(ctx, val, x, y + 52, { w: 700, size: 25, max: 270 });
  });
  const yb = y0 + 178;
  const extras = [
    d.pesoTop != null ? `${pctSimples(d.pesoTop)} das unidades dos ${Math.min(ambito.ano.length, 10)} mais vendidos` : '',
    d.lojas && d.lojas.length > 1 ? `vendido em ${d.lojas.length} lojas` : '',
    'fonte: ' + (ORIGEM[d.origem] || ORIGEM.sistema),
  ].filter(Boolean).join(' · ');
  txt(ctx, extras, 80, yb, { w: 600, size: 15, color: '#C9D3E2', max: 556 });
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Os mais vendidos (até cinco), lado a lado, a subir um a um. */
function cenaMaisVendidos(ctx, f, at, ambito, rotulo) {
  const lista = (ambito && ambito.ano ? ambito.ano : []).slice(0, 5);
  fundoImagem(ctx, f, at, 2, 'baixo', { desfoque: 10 });
  cabecalho(ctx, f, `Os mais vendidos de ${f.ano}`, `${rotulo ? rotulo + ' · ' : ''}unidades vendidas no ano`, { semFundo: true });
  const n = lista.length;
  const passo = Math.min(236, (W - 96) / Math.max(1, n));
  const x0 = W / 2 - (passo * (n - 1)) / 2;
  lista.forEach((it, i) => {
    const k = ease((at.s - 0.25 - i * 0.22) / 0.9);
    if (k <= 0) return;
    const cx = x0 + passo * i;
    desenharLivro(ctx, { img: imagemDe(f, it), titulo: it.titulo, cx, cy: 360 + (1 - k) * 70, h: 250, t: at.s + i * 0.7, giro: 0.38, alpha: k });
    ctx.globalAlpha = k;
    // O lugar, num círculo.
    ctx.fillStyle = i === 0 ? COL.main : 'rgba(10,18,32,0.75)';
    ctx.beginPath(); ctx.arc(cx - 70, 232, 22, 0, Math.PI * 2); ctx.fill();
    txt(ctx, `${i + 1}º`, cx - 70, 240, { w: 700, size: 18, align: 'center' });
    const linhas = partirTexto(ctx, it.titulo, passo - 24, FONT(700, 17), 2);
    linhas.forEach((l, j) => txt(ctx, l, cx, 528 + j * 22, { w: 700, size: 17, align: 'center', max: passo - 20 }));
    txt(ctx, unid(it.unidades), cx, 528 + linhas.length * 22 + 8, { w: 700, size: 17, color: '#F7C8DB', align: 'center', max: passo - 20 });
    if (it.valor != null) txt(ctx, kz(it.valor), cx, 528 + linhas.length * 22 + 32, { w: 600, size: 15, color: '#C9D3E2', align: 'center', max: passo - 20 });
    ctx.globalAlpha = 1;
  });
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
  const P = previsaoDoAno(M);
  const B = f.comp;
  cabecalho(ctx, f, 'Resumo do ano ' + f.ano, (R.ultimo ? `Registado até ${R.ultimo.mes}${R.ultimo.estado === 'Em curso' ? ' (em curso)' : ''} · ${R.nfech} ${R.nfech === 1 ? 'mês fechado' : 'meses fechados'}` : 'Ainda sem vendas registadas') + ' · projecção pela ' + f.critTxt);
  tilesResumo(ctx, at, [
    ['Vendas ' + f.ano + (R.ultimo ? ' · até ' + R.ultimo.mes : ''), R.ytd2, kz, R.cresc_ytd != null ? pct(R.cresc_ytd) + ' vs mesmos meses de ' + B : '', corDe(R.cresc_ytd)],
    ['Diferença no período comparável', R.dif_ytd, kzs, R.ytd1 != null ? kz(R.ytd1) + ' em ' + B : 'sem ano de comparação', corDe(R.dif_ytd)],
    ['Média mensal (meses fechados)', R.media2, kz, R.cresc_media != null ? pct(R.cresc_media) + ' vs ' + kz(R.media1) + ' em ' + B : '', corDe(R.cresc_media)],
    ['Melhor mês', R.melhor ? R.melhor.v2 : null, kz, R.melhor ? R.melhor.mes + (R.melhor.cresc != null ? ' · ' + pct(R.melhor.cresc) : '') : '', COL.mut],
    P && P.declarada
      ? ['Previsão anual ' + f.ano, P.valor, kz, P.atingida ? 'atingida' + (P.mes ? ' em ' + P.mes : '') + ' · ' + pct(P.acimaPct) + ' acima' : Math.round(P.pct * 100) + '% feito · faltam ' + kz(P.falta), P.atingida ? COL.pos : COL.teal]
      : ['Projecção anual ' + f.ano, R.projeccao, kz, R.cresc_proj != null ? pct(R.cresc_proj) + ' vs total de ' + B : (R.falta != null ? 'faltam ' + kz(R.falta) : ''), corDe(R.cresc_proj)],
    B != null ? ['Total ' + B + ' (ano completo)', R.total1, kz, R.ultrapassa ? 'ultrapassado em ' + R.ultrapassa : '', COL.mut]
      : ['Falta para a ' + (P && P.declarada ? 'previsão' : 'projecção'), P ? P.falta : R.falta, kz, '', COL.mut],
  ]);
  barrasMensais(ctx, f, M.rows, 64, 552, W - 112, 72, ease(at.s / (animDe(at.cena) * 1.5)), { valores: false, legenda: false, rotulos: false });
}

function cenaMensal(ctx, f, at, M, titulo) {
  cabecalho(ctx, f, titulo || 'Vendas por mês · Janeiro a Dezembro', f.comp ? `${f.ano} comparado com ${f.comp} · valores em milhões de Kz` : `${f.ano} · valores em milhões de Kz`);
  barrasMensais(ctx, f, M.rows, 110, 226, W - 158, 380, ease(at.s / (animDe(at.cena) * 1.4)));
}

/** Um mês com tudo o que tem. `M` é o modelo do ano; `extra` acrescenta linhas (encomendas, lojas). */
function cenaMes(ctx, f, at, M, r, { esquerda, extra = [], livro = null } = {}) {
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
      txt(ctx, valTxt, cx + 48, base - bh - 12, { w: 700, size: 17, align: 'center', max: 200 });
      txt(ctx, etiqueta, cx + 48, base + 28, { w: 700, size: 17, color: COL.mut, align: 'center' });
    };
    bar(lx + 40, B != null ? r.v1 : null, COL.comp, 1, B != null ? String(B) : 'sem comparação', B != null ? kz(r.v1) : '');
    bar(lx + 190, val2, COL.main, r.v2 == null ? 0.35 : r.estado === 'Em curso' ? 0.7 : 1, String(A), (r.v2 == null && val2 != null ? '≈ ' : '') + kz(val2));
    const gx = lx + 330;
    const gmax = lw - (gx - lx) - 20;
    txt(ctx, r.v2 == null ? 'Crescimento estimado' : 'Crescimento', gx, ly + 70, { w: 700, size: 15, color: COL.mut, max: gmax });
    ctx.globalAlpha = clamp01(at.s / animDe(at.cena) * 1.5 - 0.4);
    if (r.cresc != null) {
      txt(ctx, pct(r.cresc), gx, ly + 122, { w: 700, size: 44, color: corDe(r.cresc), max: gmax });
      txt(ctx, kzs(r.dif), gx, ly + 156, { w: 700, size: 16, color: corDe(r.dif), max: gmax });
    } else if (crescEst != null) {
      txt(ctx, '≈ ' + pct(crescEst), gx, ly + 122, { w: 700, size: 36, color: COL.mut, max: gmax });
      txt(ctx, 'se o mês chegar à estimativa', gx, ly + 156, { w: 600, size: 14, color: COL.mut, max: gmax });
    } else {
      txt(ctx, r.estado === 'Por preencher' ? 'Por preencher' : 'Sem comparação', gx, ly + 116, { w: 700, size: 22, color: COL.mut, max: gmax });
    }
    if (r.estado === 'Em curso') txt(ctx, 'Mês em curso: o valor ainda pode subir', gx, ly + 186, { w: 600, size: 14, color: COL.amber, max: gmax });
    if (livro) {
      // O mais vendido do mês, com a capa.
      const kl = ease((at.s - 0.6) / 0.8);
      desenharLivro(ctx, { img: imagemDe(f, livro), titulo: livro.titulo, cx: gx + 30, cy: ly + 262 + (1 - kl) * 16, h: 92, t: at.s, giro: 0.36, alpha: kl, reflexo: false });
      ctx.globalAlpha = kl;
      txt(ctx, 'MAIS VENDIDO', gx + 70, ly + 232, { w: 700, size: 11, color: COL.main });
      partirTexto(ctx, livro.titulo, gmax - 72, FONT(700, 13), 3).forEach((l, i) => txt(ctx, l, gx + 70, ly + 252 + i * 17, { w: 700, size: 13, max: gmax - 72 }));
      txt(ctx, unid(livro.unidades), gx + 70, ly + 310, { w: 600, size: 12, color: COL.mut, max: gmax - 72 });
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
  }

  // Direita: todos os números do mês.
  const rx = 588;
  const rw = W - 48 - rx;
  card(ctx, rx, ly, rw, lh);
  const ate = (v) => (v == null ? '—' : kz(v));
  const media = r.v2 != null && R.media2 ? r.v2 / R.media2 - 1 : null;
  const P = periodoAte(M, r.i);
  const rows = [
    ['Vendas ' + A, r.v2 != null ? kz(r.v2) : (r.est != null ? '≈ ' + kz(r.est) + ' (estimativa)' : '—'), r.v2 == null ? COL.mut : COL.fg],
    ['Vendas ' + (B != null ? B : '— (sem comparação)'), B != null ? kz(r.v1) : '—'],
    // Na rede, o crescimento é das lojas comparáveis: quando o ano anterior comparável difere do
    // total (uma loja ainda não lançou o mês, ou é nova), mostra-se também o comparável.
    ...(B != null && r.v1c != null && r.v1c !== r.v1 ? [[`${B} nas mesmas lojas (comparável)`, kz(r.v1c)]] : []),
    ['Diferença', r.dif != null ? kzs(r.dif) : (crescEst != null ? '≈ ' + kzs(r.est - r.v1) : '—'), r.dif != null ? corDe(r.dif) : COL.mut],
    ['Crescimento', r.cresc != null ? pct(r.cresc) : (crescEst != null ? '≈ ' + pct(crescEst) : '—'), r.cresc != null ? corDe(r.cresc) : COL.mut],
    // O período até ao mês, como no PowerPoint das lojas: vendas, crescimento, diferença e médias.
    [`Venda periódica ${A} (até ${MESES_CURTOS[r.i]})`, r.acum2 != null ? kz(r.acum2) : (acumEst != null ? '≈ ' + kz(acumEst) + ' (com estimativas)' : '—'), r.acum2 != null ? COL.fg : COL.mut],
    [`Venda periódica ${B != null ? B : '—'} (até ${MESES_CURTOS[r.i]})`, B != null ? ate(r.acum1) : '—'],
    ...(B != null ? [
      ['Crescimento periódico', P.crescimento != null ? pct(P.crescimento) : '—', P.crescimento != null ? corDe(P.crescimento) : COL.mut],
      [`Diferença periódica ${B}/${String(A).slice(-2)}`, P.difPeriodica != null ? kzs(P.difPeriodica) : '—', P.difPeriodica != null ? corDe(P.difPeriodica) : COL.mut],
      [`Média mensal ${B} · ${A} (até ${MESES_CURTOS[r.i]})`, `${P.media1 != null ? grp(P.media1) : '—'} · ${P.media2 != null ? grp(P.media2) : '—'} Kz`],
    ] : [[`Média mensal ${A} (até ${MESES_CURTOS[r.i]})`, P.media2 != null ? kz(P.media2) : '—']]),
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
  txt(ctx, 'Comparável' + (R.ultimo ? ' (até ' + R.ultimo.mes + ')' : ''), 64, yt, { w: 700, size: 15, max: 250 });
  txt(ctx, kz(R.ytd1), 420, yt, { w: 700, size: 15, align: 'right' });
  txt(ctx, kz(R.ytd2c), 640, yt, { w: 700, size: 15, align: 'right' });
  txt(ctx, kzs(R.dif_ytd), 840, yt, { w: 700, size: 15, color: corDe(R.dif_ytd), align: 'right' });
  txt(ctx, pct(R.cresc_ytd), 950, yt, { w: 700, size: 15, color: corDe(R.cresc_ytd), align: 'right' });
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
    txt(ctx, ord(i + 1), 64, y + rh * 0.62, { w: 700, size: 16, color: i < 3 ? COL.main : COL.mut });
    txt(ctx, r.mes, 110, y + rh * 0.62, { w: 700, size: 16 });
    const bw = 560 * (r.v2 / max) * k;
    ctx.fillStyle = i < 3 ? COL.main : COL.mainSoft;
    roundRect(ctx, 240, y + 6, Math.max(2, bw), rh - 12, 5); ctx.fill();
    txt(ctx, kz(r.v2), W - 220, y + rh * 0.62, { w: 700, size: 16, align: 'right' });
    txt(ctx, r.cresc == null ? '(—)' : '(' + pct(r.cresc) + ')', W - 64, y + rh * 0.62, { w: 700, size: 15, color: corDe(r.cresc), align: 'right' });
  });
}

function cenaFecho(ctx, f, at, M, titulo, nota) {
  const R = M.R;
  fundoImagem(ctx, f, at, 3, 'baixo');
  cabecalho(ctx, f, titulo || 'Perspectiva do ano ' + f.ano, '', { semFundo: true });
  const k = ease(at.s / animDe(at.cena));
  ctx.globalAlpha = k;
  const cw = (W - 96 - 20) / 2;
  const vidro = f.fundo === 'simples' ? COL.card2 : 'rgba(16,30,52,0.84)';
  card(ctx, 48, 190, cw, 320, vidro);
  // A previsão gravada no ano (a do PowerPoint da loja); sem ela, a projecção pelo critério.
  const P = previsaoDoAno(M);
  const dec = !!(P && P.declarada);
  const cr = P ? P.cresc : R.cresc_proj;
  txt(ctx, (dec ? 'PREVISÃO ' : 'PROJECÇÃO ') + f.ano, 76, 236, { w: 700, size: 16, color: COL.main });
  txt(ctx, kz(P ? P.valor : R.projeccao), 76, 300, { w: 700, size: 40, max: cw - 56 });
  txt(ctx, cr != null ? pct(cr) + ' face ao total de ' + f.comp + ' (' + kz(R.total1) + ')' : 'sem ano de comparação', 76, 344, { w: 700, size: 17, color: corDe(cr), max: cw - 56 });
  txt(ctx, dec ? (R.projeccao != null ? 'Ao ritmo actual: ' + kz(R.projeccao) : 'Previsão do ano') : 'Critério: ' + f.critTxt, 76, 380, { w: 600, size: 16, color: COL.mut, max: cw - 56 });
  if (R.ultrapassa) txt(ctx, 'O total de ' + f.comp + ' foi ultrapassado em ' + R.ultrapassa + '.', 76, 416, { w: 600, size: 16, color: COL.pos, max: cw - 56 });
  const x2 = 48 + cw + 20;
  card(ctx, x2, 190, cw, 320, vidro);
  txt(ctx, 'SITUAÇÃO ACTUAL', x2 + 28, 236, { w: 700, size: 16, color: COL.teal });
  txt(ctx, kz(R.ytd2), x2 + 28, 300, { w: 700, size: 40, max: cw - 56 });
  txt(ctx, 'Vendido' + (R.ultimo ? ' de Janeiro a ' + R.ultimo.mes : ''), x2 + 28, 344, { w: 700, size: 17, color: COL.mut, max: cw - 56 });
  const situacao = !P ? ''
    : P.atingida ? 'Previsão atingida' + (P.mes ? ' em ' + P.mes : '') + ' · +' + kz(P.acima) + ' (' + pct(P.acimaPct) + ')'
      : P.falta ? 'Faltam ' + kz(P.falta) + ' para a ' + (dec ? 'previsão (' + Math.round(P.pct * 100) + '% feito)' : 'projecção') : '';
  txt(ctx, situacao, x2 + 28, 380, { w: P && P.atingida ? 700 : 600, size: 16, color: P && P.atingida ? COL.pos : COL.mut, max: cw - 56 });
  const pr = P ? P.pct : R.progresso;
  if (pr != null) {
    ctx.fillStyle = COL.line; roundRect(ctx, x2 + 28, 410, cw - 56, 12, 6); ctx.fill();
    ctx.fillStyle = COL.teal; roundRect(ctx, x2 + 28, 410, (cw - 56) * clamp01(pr) * k, 12, 6); ctx.fill();
  }
  txt(ctx, `${f.fonte ? 'Fonte: ' + f.fonte + ' · ' : ''}Gerado em ${f.geradoEm}`, W / 2, 570, { w: 600, size: 16, color: '#D5DCE8', align: 'center', max: W - 96 });
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

/** Ao entrar num quadro, o anterior desvanece (0,35 s). */
function transicao(ctx, at) {
  if (at.i === 0 || at.s >= 0.35) return;
  ctx.fillStyle = `rgba(15,27,45,${(1 - at.s / 0.35) * 0.7})`;
  ctx.fillRect(0, 0, W, H);
}

function desenharLoja(ctx, f, at, d) {
  const M = { rows: d.rows, R: d.R, meta: d.meta };
  const c = at.cena;
  const dest = d.destaques || null;
  f.t = at.t;
  if (c.k === 'capa') cenaCapa(ctx, f, at, 'Relatório de vendas ' + d.ano, d.loja, d.comp ? 'Comparado com ' + d.comp + ' · Janeiro a Dezembro' : 'Janeiro a Dezembro', dest && dest.ano);
  else if (c.k === 'resumo') cenaResumo(ctx, f, at, M);
  else if (c.k === 'mensal') cenaMensal(ctx, f, at, M);
  else if (c.k === 'mes') {
    const n = d.sys && d.sys.counts ? d.sys.counts[c.r.i] : null;
    const top = dest && dest.meses ? (dest.meses[c.r.i] || [])[0] : null;
    const extra = [];
    if (n != null) extra.push(['Encomendas no sistema', String(n)]);
    if (top) extra.push(['Mais vendido do mês', `${top.titulo} · ${unid(top.unidades)}`]);
    cenaMes(ctx, f, at, M, c.r, { extra, livro: top });
  } else if (c.k === 'quadro') cenaQuadro(ctx, f, at, M);
  else if (c.k === 'acum') cenaAcum(ctx, f, at, M);
  else if (c.k === 'ranking') cenaRanking(ctx, f, at, M);
  else if (c.k === 'destaque') cenaDestaque(ctx, f, at, dest, d.loja);
  else if (c.k === 'maisVendidos') cenaMaisVendidos(ctx, f, at, dest, d.loja);
  else cenaFecho(ctx, f, at, M);
  transicao(ctx, at);
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
    txt(ctx, ord(l.posicao || i + 1), 64, yy, { w: 700, size: 18, color: l.cor });
    txt(ctx, l.nome, 112, yy, { w: 700, size: 17, max: 280 });
    const bw = 380 * (l.M.R.ytd2 / max) * k;
    ctx.fillStyle = l.cor; roundRect(ctx, 410, y + 8, Math.max(2, bw), rh - 16, 6); ctx.fill();
    txt(ctx, kz(l.M.R.ytd2), 1000, yy, { w: 700, size: 17, align: 'right' });
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
  const dl = c.destaques && c.destaques.porLoja ? c.destaques.porLoja[l.id] : null;
  const top = dl && dl.ano ? dl.ano[0] : null;
  cabecalho(ctx, f, l.nome, `${l.provincia ? l.provincia + ' · ' : ''}${ord(l.posicao)} de ${c.lojas.filter((x) => x.temDados).length} livrarias · ${pctSimples(l.quota)} das vendas da rede${l.fonte ? ' · Fonte: ' + l.fonte : ''}`, { subMax: top ? W - 96 - 420 : 0 });
  ctx.fillStyle = l.cor; ctx.fillRect(48, 172, 64, 4);
  if (top) {
    // O mais vendido da loja, ao lado do título.
    const kl = ease((at.s - 0.4) / 0.8);
    desenharLivro(ctx, { img: imagemDe(f, top), titulo: top.titulo, cx: 1186, cy: 128, h: 96, t: at.s, giro: 0.36, alpha: kl, reflexo: false });
    ctx.globalAlpha = kl;
    txt(ctx, 'MAIS VENDIDO DA LOJA', 1132, 108, { w: 700, size: 11, color: COL.main, align: 'right' });
    txt(ctx, top.titulo, 1132, 130, { w: 700, size: 15, align: 'right', max: 360 });
    txt(ctx, unid(top.unidades) + (top.valor != null ? ' · ' + kz(top.valor) : ''), 1132, 151, { w: 600, size: 13, color: COL.mut, align: 'right', max: 360 });
    ctx.globalAlpha = 1;
  }
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
  const top = c.destaques && c.destaques.rede ? (c.destaques.rede.meses[r.i] || [])[0] : null;
  if (top) extra.push(['Mais vendido na rede', `${top.titulo} · ${unid(top.unidades)}`]);
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
  txt(ctx, 'Rede', 76, yt, { w: 700, size: 16 });
  txt(ctx, B != null ? kz(R.ytd1) : '—', 470, yt, { w: 700, size: 16, align: 'right' });
  txt(ctx, kz(R.ytd2), 680, yt, { w: 700, size: 16, align: 'right' });
  txt(ctx, pct(R.cresc_ytd), 790, yt, { w: 700, size: 16, color: corDe(R.cresc_ytd), align: 'right' });
  txt(ctx, '100%', 880, yt, { w: 700, size: 16, color: COL.mut, align: 'right' });
  txt(ctx, kz(R.projeccao), 1090, yt, { w: 700, size: 16, align: 'right' });
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
    txt(ctx, p.nome, 76, y + rh * 0.52, { w: 700, size: 18, max: 380 });
    txt(ctx, p.meses.join(', '), W - 76, y + rh * 0.52, { w: 600, size: 17, color: COL.amber, align: 'right', max: 700 });
  });
  ctx.globalAlpha = 1;
}

function desenharConjunto(ctx, f, at, c) {
  const M = c.total;
  const cena = at.cena;
  const nLojas = c.lojas.filter((l) => l.temDados).length;
  const rede = c.destaques && c.destaques.rede ? c.destaques.rede : null;
  f.t = at.t;
  if (cena.k === 'capa') cenaCapa(ctx, f, at, 'Relatório conjunto ' + c.ano, 'Todas as livrarias' + (nLojas ? ' · ' + nLojas + (nLojas === 1 ? ' loja' : ' lojas') : ''), c.comp ? 'Comparado com ' + c.comp + ' · Janeiro a Dezembro' : 'Janeiro a Dezembro', rede && rede.ano);
  else if (cena.k === 'resumo') cenaResumo(ctx, f, at, M);
  else if (cena.k === 'lojas') cenaLojas(ctx, f, at, c);
  else if (cena.k === 'mensal') cenaMensalRede(ctx, f, at, c);
  else if (cena.k === 'loja') cenaLoja(ctx, f, at, c, cena.l);
  else if (cena.k === 'mesRede') cenaMesRede(ctx, f, at, c, cena.r);
  else if (cena.k === 'quadro') cenaQuadroRede(ctx, f, at, c);
  else if (cena.k === 'acum') cenaAcum(ctx, f, at, M);
  else if (cena.k === 'pendentes') cenaPendentes(ctx, f, at, c);
  else if (cena.k === 'destaque') cenaDestaque(ctx, f, at, rede, 'Rede');
  else if (cena.k === 'maisVendidos') cenaMaisVendidos(ctx, f, at, rede, 'Todas as livrarias');
  else cenaFecho(ctx, f, at, M, 'Perspectiva da rede · ' + c.ano, c.nota);
  transicao(ctx, at);
  rodape(ctx, f, at);
}

// ---------- Gravação ----------

function escolherFormato(comSom = false) {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error('Este navegador não consegue gravar vídeo. Use o Chrome, o Edge ou o Firefox actualizados.');
  }
  // Com som, um formato com áudio declarado (H.264 + AAC, ou VP9/VP8 + Opus).
  const lista = comSom
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = lista.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Este navegador não tem nenhum formato de vídeo disponível para gravar.');
  return mime;
}

/**
 * Grava o plano num vídeo. `desenhar(ctx, at)` desenha o instante `at` = { i, cena, s, p, t }.
 * onProgress(segundos, total, cena). `signal` (AbortSignal) pára a gravação a meio.
 */
// ---------- Montagem: transições e acabamento de cinema (estilo Premiere) ----------
//
// Entre dois quadros, em vez de um corte seco: o quadro que sai aproxima-se e esbate-se com rasto
// de zoom (zoom blur), o que entra chega de mais perto até ao lugar, e um clarão de luz quente
// atravessa o ecrã. Por cima de tudo, um grão de filme muito leve e uma luz que respira num canto.
// As transições desenham os dois quadros ao mesmo tempo, só durante TRANSICAO segundos.

export const TRANSICAO = 0.8;
const suave = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/**
 * Se `sec` está no início de um quadro (depois do primeiro), a transição: { k (0→1), anterior }
 * com o instante final do quadro anterior. Senão, null. Puro (testado em video.test.js).
 */
export function estadoDaTransicao(plano, sec) {
  const at = cenaNoTempo(plano, sec);
  const dur = Math.min(TRANSICAO, (at.cena.dur || 1) * 0.35);
  if (at.i === 0 || at.s >= dur) return null;
  const inicio = sec - at.s;
  return { k: suave(at.s / dur), anterior: cenaNoTempo(plano, Math.max(0, inicio - 1e-3)) };
}

const tela = () => {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  return { c, ctx: c.getContext('2d') };
};

/** Desenha `img` (o quadro inteiro) com zoom `z` à volta do centro. */
function comZoom(ctx, img, z) {
  const w = W * z;
  const h = H * z;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

let graosFilme = null;
const padroesGrao = new WeakMap();
function graoDoFilme(ctx, sec) {
  if (!graosFilme) {
    graosFilme = Array.from({ length: 4 }, (_, n) => {
      const c = Object.assign(document.createElement('canvas'), { width: 160, height: 160 });
      const g = c.getContext('2d');
      const img = g.createImageData(160, 160);
      const r = rng(4049 + n * 7);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 96 + Math.floor(r() * 64);
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    });
  }
  let padroes = padroesGrao.get(ctx);
  if (!padroes) { padroes = graosFilme.map((c) => ctx.createPattern(c, 'repeat')); padroesGrao.set(ctx, padroes); }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = padroes[Math.floor(sec * 24) % padroes.length];
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Uma luz quente que respira num canto (sempre) e o clarão que atravessa o ecrã na transição. */
function luzes(ctx, sec, clarao = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const a = 0.05 + 0.035 * Math.sin(sec * 0.6);
  const x = W * (0.92 + 0.04 * Math.sin(sec * 0.17));
  const g = ctx.createRadialGradient(x, -H * 0.05, 0, x, -H * 0.05, W * 0.55);
  g.addColorStop(0, `rgba(255,186,120,${a})`);
  g.addColorStop(1, 'rgba(255,186,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (clarao > 0) {
    const b = Math.sin(Math.PI * clarao);
    const cx = W * (-0.1 + 1.2 * clarao);
    const cg = ctx.createRadialGradient(cx, H * 0.4, 0, cx, H * 0.4, W * 0.65);
    cg.addColorStop(0, `rgba(255,214,160,${0.5 * b})`);
    cg.addColorStop(0.35, `rgba(240,120,160,${0.22 * b})`);
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/**
 * Um instante do vídeo: o quadro (ou a transição entre dois) e o acabamento. `desenhar(ctx, at)`
 * desenha um quadro; `telas` são dois canvas de trabalho (criados uma vez por vídeo).
 */
function montar(ctx, plano, sec, desenhar, telas, sobre = null) {
  const at = { ...cenaNoTempo(plano, sec), t: sec };
  const tr = estadoDaTransicao(plano, sec);
  if (tr) {
    const [a, b] = telas;
    desenhar(a.ctx, { ...tr.anterior, t: sec });
    desenhar(b.ctx, at);
    const k = tr.k;
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    // Sai: aproxima-se e esbate-se, com dois rastos de zoom.
    const z = 1 + 0.16 * k;
    ctx.globalAlpha = 1 - k;
    comZoom(ctx, a.c, z);
    ctx.globalAlpha = (1 - k) * 0.22;
    comZoom(ctx, a.c, z + 0.035 * k);
    comZoom(ctx, a.c, z + 0.07 * k);
    // Entra: vem de mais perto até ao lugar.
    ctx.globalAlpha = k;
    comZoom(ctx, b.c, 1 + 0.1 * (1 - k));
    ctx.restore();
    luzes(ctx, sec, k);
  } else {
    desenhar(ctx, at);
    luzes(ctx, sec, 0);
  }
  if (sobre) sobre(ctx, sec);
  graoDoFilme(ctx, sec);
  return at;
}

/**
 * A legenda (o guião do quadro) numa faixa escura por cima do rodapé, uma linha de cada vez.
 * `leg` vem de legendaNoTempo() (guiao-video.js), com a opacidade da entrada e da saída.
 */
function desenharLegenda(ctx, leg) {
  if (!leg || !leg.texto || leg.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = leg.alpha;
  let px = 20;
  ctx.font = FONT(600, px);
  let w = ctx.measureText(leg.texto).width;
  while (w > W - 220 && px > 14) { px -= 1; ctx.font = FONT(600, px); w = ctx.measureText(leg.texto).width; }
  // Entre os nomes dos meses das barras de baixo (até y≈648) e o rodapé (a partir de y≈693).
  const h = 34;
  const y = 652;
  const x = (W - w) / 2 - 20;
  ctx.fillStyle = 'rgba(6,12,22,0.84)';
  roundRect(ctx, x, y, w + 40, h, 10); ctx.fill();
  ctx.fillStyle = COL.main;
  roundRect(ctx, x, y + 9, 3, h - 18, 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(leg.texto, W / 2, y + h / 2 + 1);
  ctx.restore();
}

/**
 * Grava o vídeo `V` (de prepararVideo) no `canvas` dado (ou num à parte). Com `mistura`
 * (som-video.js), junta a faixa de áudio e o tempo do vídeo passa a ser o do relógio do áudio: a
 * imagem e o som não se desencontram, mesmo que o separador abrande. onProgress(seg, total, cena, i).
 */
export async function gravarVideo(V, { canvas = null, mistura = null, musica = true, efeitos = true, onProgress, signal } = {}) {
  const comSom = !!mistura;
  const mime = escolherFormato(comSom);
  const FPS = 30;
  const tela0 = canvas || Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = tela0.getContext('2d');
  const total = V.total;
  V.desenhar(ctx, 0);
  const stream = tela0.captureStream(FPS);
  let destino = null;
  let sessao = null;
  if (comSom) {
    destino = mistura.ctx.createMediaStreamDestination();
    mistura.master.connect(destino);
    destino.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }
  // O conteúdo é quase sempre parado: 5 Mb/s chegam para os números ficarem nítidos.
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000, ...(comSom ? { audioBitsPerSecond: 160_000 } : {}) });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  rec.start(1000);
  const t0 = performance.now();
  let a0 = 0;
  if (comSom) {
    a0 = mistura.ctx.currentTime + 0.25;
    sessao = mistura.tocar({ pista: V.pista, total, desde: 0, quando: a0, musicaLigada: musica, efeitosLigados: efeitos });
  }
  const agora = () => (comSom ? mistura.ctx.currentTime - a0 : (performance.now() - t0) / 1000);
  let cancelado = false;
  try {
    await new Promise((resolve) => {
      // setInterval continua (mais devagar) com o separador em segundo plano; requestAnimationFrame pararia.
      const id = setInterval(() => {
        if (signal && signal.aborted) { cancelado = true; clearInterval(id); resolve(); return; }
        const sec = Math.max(0, agora());
        const at = V.desenhar(ctx, Math.min(sec, total));
        onProgress?.(Math.min(sec, total), total, at.cena, at.i);
        if (sec >= total + 0.4) { clearInterval(id); resolve(); }
      }, 1000 / FPS);
    });
  } finally {
    if (sessao) sessao.parar();
    rec.stop();
    await done;
    stream.getVideoTracks().forEach((tr) => tr.stop());
    if (destino) { try { mistura.master.disconnect(destino); } catch (e) { /* já desligado */ } }
  }
  if (cancelado) { const e = new Error('Gravação do vídeo cancelada.'); e.name = 'AbortError'; throw e; }
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm', duracao: total, comSom };
}

/** A gravação de antes (sem som nem legendas), para quem chama renderVideo/renderVideoConjunto. */
async function gravar(plano, desenhar, { onProgress, signal } = {}) {
  const telas = [tela(), tela()];
  return gravarVideo({ total: duracaoPlano(plano), pista: [], desenhar: (ctx, sec) => montar(ctx, plano, sec, desenhar, telas) }, { onProgress, signal });
}

const fonteTxtDe = (fonte) => (fonte ? 'Fonte: ' + fonte : 'Livraria e Editora Adventista');

/** As capas que um vídeo vai mostrar: os mais vendidos do âmbito e de cada mês (e de cada loja). */
function capasDe(...ambitos) {
  const urls = new Set();
  const juntar = (lista, n) => (lista || []).slice(0, n).forEach((it) => { if (it && it.capa) urls.add(it.capa); });
  ambitos.filter(Boolean).forEach((a) => {
    juntar(a.ano, 5);
    (a.meses || []).forEach((l) => juntar(l, 1));
  });
  return [...urls];
}

/**
 * Prepara o que todos os quadros de um vídeo precisam: o logótipo, o plano, as capas dos livros
 * e as fotografias da biblioteca (carregadas antes de gravar: a gravação é em tempo real e não
 * pode esperar pela rede a meio). Uma imagem que não carregue fica de fora.
 */
async function preparar(base, plano, { capas = [], fotos = [], fundo = 'capas' } = {}) {
  // «Capas animadas»: as capas dos mais vendidos e, a completar, as do catálogo (do próprio site).
  const doMural = fundo === 'capas' ? capasParaFundo(capas, { n: 18, chave: base.etiqueta }) : [];
  const [logo, , imgs, fts, mural, logoClaro] = await Promise.all([
    carregarImagem(base.logoSrc),
    // As fontes do sistema têm de estar prontas antes do primeiro quadro: o canvas não espera.
    carregarFontes(),
    Promise.all(capas.map((u) => carregarImagem(u).then((img) => [u, img]))),
    fundo === 'biblioteca' ? Promise.all(fotos.slice(0, 8).map((u) => carregarImagem(u))) : Promise.resolve([]),
    Promise.all(doMural.map((u) => carregarImagem(u))),
    carregarImagem(base.logoClaroSrc),
  ]);
  return {
    ...base, plano, total: duracaoPlano(plano), logo, logoClaro, fundo,
    imagens: new Map(imgs.filter(([, img]) => img)),
    fotos: fts.filter(Boolean),
    mural: mural.filter(Boolean),
  };
}
const fundoDe = (v) => (FUNDOS[v] ? v : 'capas');

/**
 * Vídeo de uma loja (1280×720). `d` vem de exportData() em painel.js.
 * opts = { ritmo: 'lento' | 'normal' | 'curto', signal }.
 */
export async function renderVideo(d, onProgress, opts = {}) {
  const plano = planoVideo(d, opts.ritmo);
  const f = await preparar({
    ano: d.ano, comp: d.comp, critTxt: d.critTxt, fonte: d.fonte, fonteTxt: fonteTxtDe(d.fonte), geradoEm: d.geradoEm,
    etiqueta: `${d.loja} · ${d.ano}${d.comp ? ' vs ' + d.comp : ''}`, logoSrc: d.logo, logoClaroSrc: d.logoClaro,
  }, plano, { capas: capasDe(d.destaques), fotos: d.fotos || [], fundo: fundoDe(d.fundo) });
  return gravar(plano, (ctx, at) => desenharLoja(ctx, f, at, d), { onProgress, signal: opts.signal });
}

/**
 * Vídeo de todas as livrarias (1280×720). `c` vem de buildConsolidado() (consolidado.js) com
 * `geradoEm` e `logo` acrescentados pelo ecrã. opts = { ritmo, signal }.
 */
export async function renderVideoConjunto(c, onProgress, opts = {}) {
  const plano = planoVideoConjunto(c, opts.ritmo);
  const D = c.destaques || {};
  const f = await preparar({
    ano: c.ano, comp: c.comp, critTxt: c.total.critTxt, fonte: '', fonteTxt: 'Relatório conjunto das livrarias', geradoEm: c.geradoEm,
    etiqueta: `Todas as livrarias · ${c.ano}${c.comp ? ' vs ' + c.comp : ''}`, logoSrc: c.logo, logoClaroSrc: c.logoClaro,
  }, plano, { capas: capasDe(D.rede, ...Object.values(D.porLoja || {}).map((x) => ({ ano: x.ano }))), fotos: c.fotos || [], fundo: fundoDe(c.fundo) });
  return gravar(plano, (ctx, at) => desenharConjunto(ctx, f, at, c), { onProgress, signal: opts.signal });
}

/**
 * Prepara um vídeo para o Estúdio (pré-visualizar e gravar): o plano, o guião, as legendas, as
 * deixas do som e a função que desenha qualquer instante. `tipo` = 'loja' (dados = exportData() do
 * painel) ou 'conjunto' (dados = buildConsolidado() com geradoEm, logo e logoClaro).
 * opts = { ritmo, fundo, legendas (desenhar o guião no vídeo), esticar (cada quadro do tamanho da
 * frase: para as legendas e para quem narra) }.
 */
export async function prepararVideo(tipo, dados, opts = {}) {
  const conjunto = tipo === 'conjunto';
  const ritmo = RITMOS[opts.ritmo] ? opts.ritmo : 'lento';
  const plano0 = conjunto ? planoVideoConjunto(dados, ritmo) : planoVideo(dados, ritmo);
  const guiao = guiaoDoVideo(tipo, dados, plano0, ritmo);
  const plano = opts.esticar ? esticarPlano(plano0, guiao) : plano0;
  const D = dados.destaques || {};
  const capas = conjunto ? capasDe(D.rede, ...Object.values(D.porLoja || {}).map((x) => ({ ano: x.ano }))) : capasDe(D);
  const f = await preparar(conjunto
    ? { ano: dados.ano, comp: dados.comp, critTxt: dados.total.critTxt, fonte: '', fonteTxt: 'Relatório conjunto das livrarias', geradoEm: dados.geradoEm, etiqueta: `Todas as livrarias · ${dados.ano}${dados.comp ? ' vs ' + dados.comp : ''}`, logoSrc: dados.logo, logoClaroSrc: dados.logoClaro }
    : { ano: dados.ano, comp: dados.comp, critTxt: dados.critTxt, fonte: dados.fonte, fonteTxt: fonteTxtDe(dados.fonte), geradoEm: dados.geradoEm, etiqueta: `${dados.loja} · ${dados.ano}${dados.comp ? ' vs ' + dados.comp : ''}`, logoSrc: dados.logo, logoClaroSrc: dados.logoClaro },
  plano, { capas, fotos: dados.fotos || [], fundo: fundoDe(dados.fundo) });
  const legendas = opts.legendas ? tempoDasLegendas(plano, guiao) : [];
  f.comLegendas = legendas.length > 0;
  const telas = [tela(), tela()];
  const cena = (c, a) => (conjunto ? desenharConjunto(c, f, a, dados) : desenharLoja(c, f, a, dados));
  const sobre = legendas.length ? (c, sec) => desenharLegenda(c, legendaNoTempo(legendas, sec)) : null;
  return {
    tipo, ritmo, plano, total: f.total, guiao, legendas,
    pista: pistaDeEfeitos(tipo, dados, plano),
    /** Desenha o segundo `sec` em `ctx` (1280×720) e devolve o quadro em que está. */
    desenhar: (ctx, sec) => montar(ctx, plano, sec, cena, telas, sobre),
  };
}

/**
 * Desenha um instante do vídeo num canvas, sem gravar: para pré-visualizar um quadro e para
 * conferir o desenho num navegador de testes. `tipo` = 'loja' | 'conjunto'.
 */
export async function quadroDoVideo(tipo, dados, sec, opts = {}) {
  const conjunto = tipo === 'conjunto';
  const plano = conjunto ? planoVideoConjunto(dados, opts.ritmo) : planoVideo(dados, opts.ritmo);
  const D = dados.destaques || {};
  const capas = conjunto ? capasDe(D.rede, ...Object.values(D.porLoja || {}).map((x) => ({ ano: x.ano }))) : capasDe(D);
  const f = await preparar(conjunto
    ? { ano: dados.ano, comp: dados.comp, critTxt: dados.total.critTxt, fonte: '', fonteTxt: 'Relatório conjunto das livrarias', geradoEm: dados.geradoEm, etiqueta: `Todas as livrarias · ${dados.ano}${dados.comp ? ' vs ' + dados.comp : ''}`, logoSrc: dados.logo, logoClaroSrc: dados.logoClaro }
    : { ano: dados.ano, comp: dados.comp, critTxt: dados.critTxt, fonte: dados.fonte, fonteTxt: fonteTxtDe(dados.fonte), geradoEm: dados.geradoEm, etiqueta: `${dados.loja} · ${dados.ano}${dados.comp ? ' vs ' + dados.comp : ''}`, logoSrc: dados.logo, logoClaroSrc: dados.logoClaro },
  plano, { capas, fotos: dados.fotos || [], fundo: fundoDe(dados.fundo) });
  const canvas = opts.canvas || Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  const at = montar(ctx, plano, sec, (c, a) => (conjunto ? desenharConjunto(c, f, a, dados) : desenharLoja(c, f, a, dados)), [tela(), tela()]);
  return { canvas, plano, at };
}
