/**
 * As imagens animadas dos vídeos dos relatórios (video.js): paisagens desenhadas no canvas,
 * fotografias da biblioteca com movimento lento e o livro em 3D a partir da capa do catálogo.
 *
 * As paisagens são desenhadas aqui, não descarregadas: não dependem da rede nem de licenças, e
 * cada uma é sempre igual (sementes fixas), por isso o mesmo vídeo sai igual duas vezes. As
 * camadas que não mexem (céu, serras, árvores) desenham-se uma vez para um canvas à parte e cada
 * imagem do vídeo só as cola com um deslocamento (paralaxe) e junta o que se move (sol, névoa,
 * nuvens, erva, partículas) — 30 imagens por segundo sem pesar.
 *
 * Imagens de fora (capas, fotografias) carregam-se com crossOrigin = anonymous: uma imagem sem
 * CORS «sujava» o canvas e a gravação falhava. Uma imagem que não carregue não aparece — o livro
 * passa a ter uma capa tipográfica desenhada aqui.
 */

// ---------- Utilitários ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashTexto(s) {
  let h = 2166136261;
  for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp01 = (t) => Math.min(1, Math.max(0, t));
/** Uma cor #RRGGBB mais escura (k < 1). */
const escurecer = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return '#' + c((n >> 16) & 255) + c((n >> 8) & 255) + c(n & 255);
};
const novoCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });

/** Carrega uma imagem com CORS; resolve null se falhar ou demorar mais de `ms`. */
export function carregarImagem(src, ms = 8000) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    let feito = false;
    const fim = (v) => { if (!feito) { feito = true; resolve(v); } };
    if (!/^data:|^blob:/.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => fim(img.naturalWidth ? img : null);
    img.onerror = () => fim(null);
    setTimeout(() => fim(null), ms);
    img.src = src;
  });
}

// ---------- Paisagens ----------
export const TEMAS = ['amanhecer', 'floresta', 'campo', 'lago'];
export const NOMES_TEMAS = { amanhecer: 'Amanhecer nas montanhas', floresta: 'Floresta', campo: 'Campo', lago: 'Lago ao entardecer' };

const PALETAS = {
  amanhecer: { ceu: [[0, '#14213D'], [0.42, '#5C3D7A'], [0.7, '#E2725B'], [0.9, '#F6B26B'], [1, '#FCE3A4']], sol: '#FFE6A8', camadas: ['#9B7BB0', '#6C5584', '#3E3F63', '#1E2A3A'], nevoa: 'rgba(255,236,214,0.22)' },
  floresta: { ceu: [[0, '#0F2F35'], [0.45, '#2C6E63'], [0.85, '#9FD3A6'], [1, '#DCEFC9']], sol: '#FFF4C2', camadas: ['#6FA88E', '#3F7D66', '#24584A', '#0F302A'], nevoa: 'rgba(230,255,240,0.2)' },
  campo: { ceu: [[0, '#2E6DA4'], [0.6, '#86C0E6'], [1, '#EAF6FB']], sol: '#FFF9D9', camadas: ['#A8CF8A', '#7DB863', '#579846', '#386A2E'], nevoa: 'rgba(255,255,255,0.18)' },
  lago: { ceu: [[0, '#0C1A36'], [0.4, '#36477F'], [0.72, '#C9706A'], [1, '#F1C48C']], sol: '#FFD9A0', camadas: ['#7A6B97', '#4B4870', '#2A2F4D'], nevoa: 'rgba(255,220,200,0.16)' },
};

const cache = new Map();
const EXTRA = 640; // largura a mais de cada camada, para a paralaxe andar sem repetir

/** Perfil de uma serra: soma de ondas com fases ao acaso (de uma semente). */
function perfil(r, largura, baseY, amp, ondas) {
  const fases = Array.from({ length: ondas }, () => [r() * Math.PI * 2, 0.5 + r() * 1.5]);
  const pts = [];
  for (let x = 0; x <= largura; x += 6) {
    let y = 0;
    fases.forEach(([f, k], i) => { y += Math.sin((x / largura) * Math.PI * (2 + i * 2.3) * k + f) / (i + 1); });
    y += (r() - 0.5) * 0.08;
    pts.push([x, baseY - y * amp]);
  }
  return pts;
}

function camadaSerra(W, H, cor, r, baseY, amp, ondas, neblina) {
  const c = novoCanvas(W + EXTRA, H);
  const g = c.getContext('2d');
  const pts = perfil(r, W + EXTRA, baseY, amp, ondas);
  const grad = g.createLinearGradient(0, baseY - amp * 1.5, 0, H);
  grad.addColorStop(0, cor);
  grad.addColorStop(1, neblina ? cor : escurecer(cor, 0.55));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, H);
  pts.forEach(([x, y]) => g.lineTo(x, y));
  g.lineTo(W + EXTRA, H);
  g.closePath();
  g.fill();
  if (neblina) {
    const n = g.createLinearGradient(0, baseY - amp, 0, baseY + amp * 1.2);
    n.addColorStop(0, 'rgba(255,255,255,0)');
    n.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = n;
    g.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

function camadaArvores(W, H, cor, r, baseY, alturaMax, densidade) {
  const c = novoCanvas(W + EXTRA, H);
  const g = c.getContext('2d');
  g.fillStyle = cor;
  g.fillRect(0, baseY, c.width, H - baseY);
  for (let x = -20; x < c.width + 20; x += densidade * (0.6 + r() * 0.8)) {
    const h = alturaMax * (0.55 + r() * 0.45);
    const w = h * (0.32 + r() * 0.1);
    const base = baseY + r() * 8;
    // Pinheiro: três andares de triângulos e o tronco.
    for (let k = 0; k < 3; k++) {
      const y0 = base - h * (0.18 + k * 0.27);
      const ww = w * (1 - k * 0.25);
      g.beginPath();
      g.moveTo(x - ww / 2, y0 + h * 0.3);
      g.lineTo(x, y0 - h * 0.22);
      g.lineTo(x + ww / 2, y0 + h * 0.3);
      g.closePath();
      g.fill();
    }
    g.fillRect(x - w * 0.05, base - h * 0.15, w * 0.1, h * 0.2);
  }
  return c;
}

function nuvem(r) {
  const c = novoCanvas(320, 120);
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 50 + r() * 220;
    const y = 55 + (r() - 0.5) * 30;
    const rad = 26 + r() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function prepararTema(tema, W, H) {
  const chave = `${tema}:${W}x${H}`;
  if (cache.has(chave)) return cache.get(chave);
  const P = PALETAS[tema] || PALETAS.amanhecer;
  const r = rng(hashTexto(tema) ^ 0x5eed);
  const ceu = novoCanvas(W, H);
  const gc = ceu.getContext('2d');
  const gr = gc.createLinearGradient(0, 0, 0, H * 0.78);
  P.ceu.forEach(([o, cor]) => gr.addColorStop(o, cor));
  gc.fillStyle = gr;
  gc.fillRect(0, 0, W, H);
  if (tema === 'amanhecer' || tema === 'lago') {
    // Estrelas a desvanecer no alto.
    for (let i = 0; i < 90; i++) {
      gc.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
      gc.fillRect(r() * W, r() * H * 0.32, 1.4, 1.4);
    }
  }
  let camadas;
  if (tema === 'floresta') {
    camadas = [
      { c: camadaSerra(W, H, P.camadas[0], r, H * 0.52, H * 0.08, 3, true), v: 4 },
      { c: camadaArvores(W, H, P.camadas[1], r, H * 0.66, H * 0.2, 26), v: 9 },
      { c: camadaArvores(W, H, P.camadas[2], r, H * 0.78, H * 0.3, 40), v: 16 },
      { c: camadaArvores(W, H, P.camadas[3], r, H * 0.95, H * 0.46, 70), v: 28 },
    ];
  } else if (tema === 'campo') {
    camadas = [
      { c: camadaSerra(W, H, P.camadas[0], r, H * 0.6, H * 0.06, 2, true), v: 3 },
      { c: camadaSerra(W, H, P.camadas[1], r, H * 0.7, H * 0.06, 2, false), v: 8 },
      { c: camadaSerra(W, H, P.camadas[2], r, H * 0.8, H * 0.05, 2, false), v: 15 },
      { c: camadaSerra(W, H, P.camadas[3], r, H * 0.92, H * 0.04, 2, false), v: 24 },
    ];
  } else if (tema === 'lago') {
    camadas = [
      { c: camadaSerra(W, H, P.camadas[0], r, H * 0.56, H * 0.12, 4, true), v: 3 },
      { c: camadaSerra(W, H, P.camadas[1], r, H * 0.62, H * 0.09, 4, true), v: 7 },
      { c: camadaArvores(W, H, P.camadas[2], r, H * 0.68, H * 0.1, 22), v: 11 },
    ];
  } else {
    camadas = [
      { c: camadaSerra(W, H, P.camadas[0], r, H * 0.56, H * 0.16, 4, true), v: 3 },
      { c: camadaSerra(W, H, P.camadas[1], r, H * 0.66, H * 0.14, 4, true), v: 7 },
      { c: camadaSerra(W, H, P.camadas[2], r, H * 0.78, H * 0.12, 4, false), v: 13 },
      { c: camadaArvores(W, H, P.camadas[3], r, H * 0.93, H * 0.22, 34), v: 22 },
    ];
  }
  const nuvens = Array.from({ length: 5 }, () => ({ c: nuvem(r), x: r() * W, y: H * (0.08 + r() * 0.25), s: 0.6 + r() * 0.8, v: 6 + r() * 10 }));
  const particulas = Array.from({ length: 46 }, () => ({ x: r(), y: r(), f: r() * Math.PI * 2, v: 0.4 + r(), t: 1 + r() * 2.2 }));
  const erva = Array.from({ length: 170 }, () => ({ x: r(), h: 0.04 + r() * 0.06, f: r() * Math.PI * 2, cor: r() }));
  const flores = Array.from({ length: 40 }, () => ({ x: r(), y: 0.9 + r() * 0.09, cor: r() > 0.5 ? '#FFF7E0' : '#F7D154', f: r() * 6 }));
  const tudo = { P, ceu, camadas, nuvens, particulas, erva, flores };
  cache.set(chave, tudo);
  return tudo;
}

/**
 * Desenha a paisagem `tema` no instante `t` (segundos desde o início do quadro).
 * Cobre o canvas inteiro.
 */
export function desenharPaisagem(ctx, W, H, tema, t) {
  const T = prepararTema(tema, W, H);
  const { P } = T;
  ctx.drawImage(T.ceu, 0, 0);
  // Sol (sobe devagar no amanhecer, desce no lago) e o seu brilho.
  const sx = tema === 'floresta' ? W * 0.22 : W * 0.7;
  const sy = tema === 'amanhecer' ? H * 0.6 - t * 3 : tema === 'lago' ? H * 0.52 + t * 1.5 : H * 0.2;
  const brilho = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.55);
  brilho.addColorStop(0, P.sol);
  brilho.addColorStop(0.08, 'rgba(255,240,200,0.55)');
  brilho.addColorStop(0.4, 'rgba(255,220,170,0.12)');
  brilho.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, W, H);
  if (tema === 'floresta' || tema === 'amanhecer') {
    // Raios de luz, a respirar.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = -0.25 + i * 0.16 + Math.sin(t * 0.25 + i) * 0.02;
      const alpha = 0.035 + 0.025 * Math.sin(t * 0.6 + i * 1.7);
      ctx.fillStyle = `rgba(255,245,210,${Math.max(0, alpha)})`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a + 1.2) * W * 1.4, sy + Math.sin(a + 1.2) * W * 1.4);
      ctx.lineTo(sx + Math.cos(a + 1.27) * W * 1.4, sy + Math.sin(a + 1.27) * W * 1.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // Nuvens.
  if (tema !== 'floresta') {
    T.nuvens.forEach((n) => {
      const x = ((n.x + t * n.v) % (W + 400)) - 200;
      ctx.globalAlpha = tema === 'campo' ? 0.9 : 0.35;
      ctx.drawImage(n.c, x, n.y, 320 * n.s, 120 * n.s);
    });
    ctx.globalAlpha = 1;
  }
  // Camadas com paralaxe (as de trás andam menos).
  const limite = tema === 'lago' ? H * 0.7 : H;
  T.camadas.forEach((L) => {
    const off = Math.min(EXTRA - 1, t * L.v);
    ctx.drawImage(L.c, off, 0, W, limite, 0, 0, W, limite);
  });
  if (tema === 'lago') {
    // A água: o reflexo da paisagem, a ondular.
    const y0 = H * 0.7;
    const agua = ctx.createLinearGradient(0, y0, 0, H);
    agua.addColorStop(0, '#2A3460');
    agua.addColorStop(1, '#0B1226');
    ctx.fillStyle = agua;
    ctx.fillRect(0, y0, W, H - y0);
    // A faixa a reflectir copia-se uma vez para um canvas à parte (copiar o canvas para si próprio,
    // tira a tira, custava 80 ms por imagem); as tiras desenham-se daí, invertidas e a ondular.
    const alto = Math.ceil(H - y0);
    if (!T.reflexo) T.reflexo = novoCanvas(W, alto);
    const rg = T.reflexo.getContext('2d');
    rg.clearRect(0, 0, W, alto);
    rg.drawImage(ctx.canvas, 0, y0 - alto, W, alto, 0, 0, W, alto);
    for (let y = 0; y < alto; y += 4) {
      const dx = Math.sin(y * 0.09 + t * 2.2) * (2 + y * 0.03);
      ctx.globalAlpha = 0.32 * (1 - y / alto);
      ctx.drawImage(T.reflexo, 0, alto - y - 4, W, 4, dx, y0 + y, W, 4);
    }
    ctx.globalAlpha = 1;
    // O brilho do sol na água.
    for (let i = 0; i < 26; i++) {
      const yy = y0 + 8 + i * 7;
      const w = (30 + (i % 5) * 18) * (0.6 + 0.4 * Math.sin(t * 3 + i));
      ctx.fillStyle = `rgba(255,214,160,${0.25 - i * 0.008})`;
      ctx.fillRect(sx - w / 2 + Math.sin(t * 1.3 + i) * 6, yy, w, 2);
    }
  }
  // Névoa a passar, de bordas suaves.
  for (let i = 0; i < 3; i++) {
    const y = H * (0.62 + i * 0.08);
    const x = ((t * (12 + i * 6) + i * 400) % (W + 900)) - 450;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.09);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 420);
    g.addColorStop(0, P.nevoa);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 420, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (tema === 'campo') {
    // Flores e erva a ondular à frente.
    T.flores.forEach((f) => {
      ctx.fillStyle = f.cor;
      ctx.beginPath(); ctx.arc(f.x * W, f.y * H + Math.sin(t * 1.5 + f.f) * 1.5, 2.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.lineWidth = 2;
    T.erva.forEach((g) => {
      const x = g.x * W;
      const h = g.h * H;
      const dobra = Math.sin(t * 1.4 + g.f + g.x * 4) * h * 0.25;
      ctx.strokeStyle = g.cor > 0.5 ? '#2F5A24' : '#3F7330';
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + dobra * 0.3, H - h * 0.5, x + dobra, H - h);
      ctx.stroke();
    });
  }
  // Partículas: pólen ao sol, pirilampos na floresta.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  T.particulas.forEach((p) => {
    const x = ((p.x * W + t * 8 * p.v + Math.sin(t * 0.8 + p.f) * 14) % W + W) % W;
    const y = ((p.y * H * 0.9 - t * 6 * p.v) % (H * 0.9) + H * 0.9) % (H * 0.9) + H * 0.05;
    const a = 0.25 + 0.25 * Math.sin(t * 2 + p.f);
    ctx.fillStyle = tema === 'floresta' ? `rgba(255,236,140,${a})` : `rgba(255,255,240,${a * 0.7})`;
    ctx.beginPath(); ctx.arc(x, y, p.t, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

const desfocadas = new Map();
/** A fotografia desfocada (profundidade de campo atrás dos livros), feita uma vez por imagem e grau. */
function desfocada(img, px) {
  const chave = `${img.currentSrc || img.src || ''}|${px}`;
  const feita = desfocadas.get(chave);
  if (feita && feita.de === img.src) return feita.c;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const w = Math.min(1600, iw);
  const h = Math.round((w * ih) / iw);
  const c = novoCanvas(w, h);
  const g = c.getContext('2d');
  g.filter = `blur(${px}px)`;
  g.drawImage(img, -px * 2, -px * 2, w + px * 4, h + px * 4);
  g.filter = 'none';
  if (desfocadas.size > 24) desfocadas.delete(desfocadas.keys().next().value);
  desfocadas.set(chave, { de: img.src, c });
  return c;
}

/**
 * Uma fotografia a cobrir o canvas, com zoom e deslocamento lentos (efeito Ken Burns).
 * `desfoque` (px) desfoca-a, para os livros à frente se destacarem.
 */
export function desenharFoto(ctx, W, H, foto, p, semente = 0, { desfoque = 0 } = {}) {
  const img = desfoque ? desfocada(foto, desfoque) : foto;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const r = rng(semente + 7);
  const dir = r() > 0.5 ? 1 : -1;
  const zoom = 1.04 + 0.1 * clamp01(p);
  const esc = Math.max(W / iw, H / ih) * zoom;
  const w = iw * esc;
  const h = ih * esc;
  const x = (W - w) / 2 + dir * (w - W) * 0.4 * (clamp01(p) - 0.5);
  const y = (H - h) / 2 + (h - H) * 0.25 * (0.5 - clamp01(p));
  ctx.drawImage(img, x, y, w, h);
}

/** Escurece um lado da imagem para o texto se ler por cima. */
export function veu(ctx, W, H, lado = 'esquerda', forca = 0.78) {
  const g = lado === 'baixo' ? ctx.createLinearGradient(0, H * 0.35, 0, H) : ctx.createLinearGradient(lado === 'direita' ? W : 0, 0, lado === 'direita' ? W * 0.35 : W * 0.65, 0);
  g.addColorStop(0, `rgba(8,14,26,${forca})`);
  g.addColorStop(1, 'rgba(8,14,26,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8,14,26,0.18)';
  ctx.fillRect(0, 0, W, H);
}

// ---------- O livro em 3D ----------
const capasTipograficas = new Map();
const coresMedias = new WeakMap();

function partir(ctx, texto, max, n) {
  const pal = String(texto || '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let a = '';
  for (const p of pal) {
    const t2 = a ? a + ' ' + p : p;
    if (ctx.measureText(t2).width <= max || !a) a = t2; else { linhas.push(a); a = p; }
  }
  if (a) linhas.push(a);
  if (linhas.length > n) { const c = linhas.slice(0, n); c[n - 1] = c[n - 1].replace(/\s*\S*$/, '') + '…'; return c; }
  return linhas;
}

/** Uma capa desenhada para quando o produto não tem capa (ou ela não carrega). */
export function capaTipografica(titulo) {
  const k = String(titulo || '');
  if (capasTipograficas.has(k)) return capasTipograficas.get(k);
  const c = novoCanvas(300, 450);
  const g = c.getContext('2d');
  const hue = hashTexto(k) % 360;
  const fundo = g.createLinearGradient(0, 0, 300, 450);
  fundo.addColorStop(0, `hsl(${hue},45%,34%)`);
  fundo.addColorStop(1, `hsl(${(hue + 40) % 360},55%,16%)`);
  g.fillStyle = fundo;
  g.fillRect(0, 0, 300, 450);
  g.strokeStyle = 'rgba(255,236,190,0.55)';
  g.lineWidth = 2;
  g.strokeRect(16, 16, 268, 418);
  g.fillStyle = '#FFF4DA';
  g.textAlign = 'center';
  g.font = '700 30px Lora, Georgia, serif';
  const linhas = partir(g, k || 'Livro', 230, 5);
  linhas.forEach((l, i) => g.fillText(l, 150, 170 + i * 38 - (linhas.length - 1) * 19));
  g.font = '700 12px Manrope, Arial, sans-serif';
  g.fillStyle = 'rgba(255,244,218,0.8)';
  g.fillText('LIVRARIA ADVENTISTA', 150, 410);
  capasTipograficas.set(k, c);
  return c;
}

function corMedia(img) {
  if (coresMedias.has(img)) return coresMedias.get(img);
  let cor = [40, 40, 50];
  try {
    const c = novoCanvas(8, 8);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let r = 0; let gg = 0; let b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    cor = [r / 64, gg / 64, b / 64];
  } catch { /* imagem sem CORS: fica a cor de omissão */ }
  coresMedias.set(img, cor);
  return cor;
}

/**
 * Desenha um livro em 3D: a capa em perspectiva (em tiras, porque o canvas 2D não faz
 * trapézios com imagens), a lombada à esquerda, o corte das folhas por cima, a sombra no chão e
 * um reflexo de luz que atravessa a capa. `img` = a capa (Image ou canvas) ou nada (capa
 * tipográfica com `titulo`). `t` = segundos, para flutuar e o reflexo passar.
 */
export function desenharLivro(ctx, { img, titulo = '', cx, cy, h, t = 0, giro = 0.42, flutuar = true, reflexo = true, alpha = 1 }) {
  const capa = img || capaTipografica(titulo);
  const iw = capa.naturalWidth || capa.width;
  const ih = capa.naturalHeight || capa.height;
  const prop = Math.min(0.82, Math.max(0.6, iw / ih));
  const y = cy + (flutuar ? Math.sin(t * 1.3) * h * 0.012 : 0);
  const g = giro + (flutuar ? Math.sin(t * 0.55) * 0.04 : 0);
  const w = h * prop;
  const wf = w * Math.cos(g);
  const esp = h * 0.075;
  const sp = esp * Math.sin(g) * 2.2;
  const hL = h;
  const hR = h * (1 - 0.1 * Math.sin(g));
  const x0 = cx - wf / 2 + sp / 2;
  const x1 = x0 + wf;
  const topo = (hh) => y - hh / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Sombra no chão.
  const sombra = ctx.createRadialGradient(cx, y + h / 2 + h * 0.03, 0, cx, y + h / 2 + h * 0.03, w * 0.75);
  sombra.addColorStop(0, 'rgba(0,0,0,0.45)');
  sombra.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sombra;
  ctx.save();
  ctx.translate(cx, y + h / 2 + h * 0.03);
  ctx.scale(1, 0.12);
  ctx.beginPath(); ctx.arc(0, 0, w * 0.75, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Lombada.
  const [r, gg, b] = corMedia(capa);
  const esc = (k) => `rgb(${Math.round(r * k)},${Math.round(gg * k)},${Math.round(b * k)})`;
  const lomb = ctx.createLinearGradient(x0 - sp, 0, x0, 0);
  lomb.addColorStop(0, esc(0.35));
  lomb.addColorStop(0.5, esc(0.6));
  lomb.addColorStop(1, esc(0.45));
  ctx.fillStyle = lomb;
  ctx.beginPath();
  ctx.moveTo(x0, topo(hL));
  ctx.lineTo(x0 - sp, topo(hL) + esp * 0.35);
  ctx.lineTo(x0 - sp, topo(hL) + hL - esp * 0.15);
  ctx.lineTo(x0, topo(hL) + hL);
  ctx.closePath();
  ctx.fill();
  // O corte das folhas, por cima.
  ctx.fillStyle = '#EFE6D0';
  ctx.beginPath();
  ctx.moveTo(x0, topo(hL));
  ctx.lineTo(x1, topo(hR));
  ctx.lineTo(x1 - sp, topo(hR) - esp * 0.3);
  ctx.lineTo(x0 - sp, topo(hL) + esp * 0.35 - esp * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,70,0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const k = i / 4;
    ctx.beginPath();
    ctx.moveTo(x0 - sp * k, topo(hL) - esp * 0.25 * k);
    ctx.lineTo(x1 - sp * k, topo(hR) - esp * 0.3 * k);
    ctx.stroke();
  }
  // A capa, em tiras verticais (a borda de trás fica mais baixa: perspectiva).
  const N = 28;
  for (let i = 0; i < N; i++) {
    const k0 = i / N;
    const hh = hL + (hR - hL) * k0;
    const xx = x0 + wf * k0;
    ctx.drawImage(capa, (iw * i) / N, 0, iw / N, ih, xx, topo(hh), wf / N + 0.8, hh);
  }
  // Dobra junto à lombada e um pouco de volume.
  const dobra = ctx.createLinearGradient(x0, 0, x0 + wf * 0.14, 0);
  dobra.addColorStop(0, 'rgba(0,0,0,0.35)');
  dobra.addColorStop(0.35, 'rgba(255,255,255,0.10)');
  dobra.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dobra;
  ctx.beginPath();
  ctx.moveTo(x0, topo(hL)); ctx.lineTo(x1, topo(hR)); ctx.lineTo(x1, topo(hR) + hR); ctx.lineTo(x0, topo(hL) + hL);
  ctx.closePath();
  ctx.fill();
  if (reflexo) {
    // Um reflexo de luz que atravessa a capa de 5 em 5 segundos.
    ctx.save();
    ctx.clip();
    const fase = ((t % 5) / 5) * 2.2 - 0.6;
    const bx = x0 + wf * fase;
    const lz = ctx.createLinearGradient(bx - wf * 0.3, y - h / 2, bx + wf * 0.3, y + h / 2);
    lz.addColorStop(0, 'rgba(255,255,255,0)');
    lz.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    lz.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lz;
    ctx.fillRect(x0, y - h / 2 - 10, wf, h + 20);
    ctx.restore();
  }
  ctx.restore();
}
