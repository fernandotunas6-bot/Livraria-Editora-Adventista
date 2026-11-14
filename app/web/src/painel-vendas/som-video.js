/**
 * O som dos vídeos dos relatórios, gerado no navegador com a Web Audio API: sem ficheiros de áudio,
 * sem licenças e sem serviços de fora. O mesmo vídeo soa sempre igual.
 *
 *  · prepararSom() sintetiza uma vez, à parte (OfflineAudioContext), cada efeito (porta, caixa
 *    registadora, moedas, contador, subidas, quedas, brilho…) e um ciclo da música de fundo, que
 *    depois se repete sem emenda. Fica guardado para os vídeos seguintes.
 *  · criarMistura(ctx, som) monta a mesa de mistura, como a do Premiere: três pistas (música,
 *    efeitos e voz) com o seu volume, compressor e limitador no fim, e a música a baixar sozinha
 *    quando se fala ao microfone (ducking). Tem duas saídas: `master` (a mistura completa, a que
 *    vai para o ficheiro) e `monitor` (música e efeitos, para as colunas: a voz não volta às
 *    colunas, senão o microfone apanhava-a outra vez).
 *  · mistura.tocar({ pista, total, desde, quando }) põe a tocar as deixas de deixas-video.js e a
 *    música a partir do segundo `desde` do vídeo, no instante `quando` do relógio do áudio.
 */
import { MUSICA, duracaoDoCiclo, hz, notasDoCiclo } from './deixas-video.js';

const OfflineCtx = () => (typeof window !== 'undefined' ? window.OfflineAudioContext || window.webkitOfflineAudioContext : null);
export const somDisponivel = () => !!(typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext) && OfflineCtx());

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---------- Peças ----------

function bufferDeRuido(ctx, dur, seed = 1) {
  const len = Math.max(1, Math.round(dur * ctx.sampleRate));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < len; i++) d[i] = r() * 2 - 1;
  return b;
}
function ruido(ctx, dur, seed) {
  const s = ctx.createBufferSource();
  s.buffer = bufferDeRuido(ctx, dur, seed);
  return s;
}
function filtro(ctx, tipo, f, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = tipo; b.frequency.value = f; b.Q.value = q;
  return b;
}
function ganho(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
function panner(ctx, pan) {
  if (!ctx.createStereoPanner) return ganho(ctx, 1);
  const p = ctx.createStereoPanner(); p.pan.value = pan; return p;
}
/** Ataque linear até `pico` e queda exponencial durante `d` segundos. */
function env(param, t, pico, a, d) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(Math.max(0.0002, pico), t + a);
  param.exponentialRampToValueAtTime(0.0001, t + a + d);
}
/** Reverberação sintética: ruído estéreo que decai, com uma entrada muito curta. */
function sala(ctx, dur = 1.8, curva = 3, seed = 7) {
  const len = Math.round(dur * ctx.sampleRate);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    const r = rng(seed + ch * 101);
    const entrada = 0.004 * ctx.sampleRate;
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, curva) * Math.min(1, i / entrada);
  }
  return b;
}

/** Um sino: parciais inarmónicos que decaem, os agudos mais depressa. */
function sino(ctx, out, t, f, { g = 0.3, dur = 1, parciais = [[1, 1], [2.76, 0.45], [5.4, 0.22], [8.93, 0.1]], pan = 0 } = {}) {
  const p = panner(ctx, pan);
  p.connect(out);
  parciais.forEach(([m, k]) => {
    const fr = f * m;
    if (fr > ctx.sampleRate / 2 - 800) return;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
    const gn = ctx.createGain();
    env(gn.gain, t, g * k, 0.002, dur / Math.sqrt(m));
    o.connect(gn).connect(p);
    o.start(t); o.stop(t + 0.01 + dur);
  });
}
/** Um clique seco (trinco, mola). */
function clique(ctx, out, t, f = 2600, g = 0.5) {
  const n = ruido(ctx, 0.03, Math.round(f));
  const bp = filtro(ctx, 'bandpass', f, 2.2);
  const gn = ctx.createGain(); env(gn.gain, t, g, 0.001, 0.025);
  n.connect(bp).connect(gn).connect(out);
  n.start(t); n.stop(t + 0.04);
  const o = ctx.createOscillator(); o.frequency.value = f * 0.7;
  const go = ctx.createGain(); env(go.gain, t, g * 0.4, 0.001, 0.012);
  o.connect(go).connect(out); o.start(t); o.stop(t + 0.03);
}
/** Ruído filtrado com a frequência a varrer de `f0` a `f1` (sopro, subida, descida). */
function varrimento(ctx, out, t, dur, f0, f1, g, { q = 1.6, seed = 3, ataque = 0.85 } = {}) {
  const n = ruido(ctx, dur + 0.1, seed);
  const bp = filtro(ctx, 'bandpass', f0, q);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const gn = ctx.createGain();
  // Começa já audível (6% do pico) e cresce: uma subida que nasce do silêncio só se ouve no fim.
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.linearRampToValueAtTime(g * 0.06, t + Math.min(0.05, dur * 0.1, dur * ataque * 0.5));
  gn.gain.exponentialRampToValueAtTime(g, t + dur * ataque);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp).connect(gn).connect(out);
  n.start(t); n.stop(t + dur + 0.05);
}
/** Um tom que desliza de `f0` a `f1`. */
function deslize(ctx, out, t, dur, f0, f1, g, tipo = 'sine') {
  const o = ctx.createOscillator(); o.type = tipo;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.linearRampToValueAtTime(g * 0.1, t + Math.min(0.05, dur * 0.1));
  gn.gain.exponentialRampToValueAtTime(g, t + dur * 0.8);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}
/** Um baque grave (porta a fechar, impacto). */
function baque(ctx, out, t, f0 = 85, f1 = 45, g = 0.8, dur = 0.4) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  const gn = ctx.createGain(); env(gn.gain, t, g, 0.003, dur);
  o.connect(gn).connect(out); o.start(t); o.stop(t + dur + 0.05);
  // O corpo nos médios (160–900 Hz): é o que se ouve nas colunas de um telemóvel ou portátil.
  const c = ctx.createOscillator(); c.type = 'triangle';
  c.frequency.setValueAtTime(f0 * 2.2, t); c.frequency.exponentialRampToValueAtTime(f1 * 2.2, t + dur * 0.5);
  const gc = ctx.createGain(); env(gc.gain, t, g * 0.45, 0.002, dur * 0.5);
  c.connect(gc).connect(out); c.start(t); c.stop(t + dur);
  const n = ruido(ctx, 0.2, 61);
  const lp = filtro(ctx, 'lowpass', 900);
  const gr = ctx.createGain(); env(gr.gain, t, g * 0.5, 0.002, 0.12);
  n.connect(lp).connect(gr).connect(out); n.start(t); n.stop(t + 0.2);
}
/** Moedas a tilintar: `n` toques metálicos, cada um com os seus parciais. */
function moedasEm(ctx, out, t0, n = 6, seed = 5, g = 1) {
  const r = rng(seed);
  for (let k = 0; k < n; k++) {
    const t = t0 + k * 0.05 + r() * 0.04;
    const f = 3000 + r() * 2300;
    const pan = (r() - 0.5) * 0.9;
    sino(ctx, out, t, f, { g: (0.12 + r() * 0.1) * g, dur: 0.08 + r() * 0.14, parciais: [[1, 1], [1.59, 0.6], [2.31, 0.4], [3.07, 0.2]], pan });
    const c = ruido(ctx, 0.01, 900 + k);
    const hp = filtro(ctx, 'highpass', 5000);
    const gc = ctx.createGain(); env(gc.gain, t, 0.18 * g, 0.0005, 0.006);
    c.connect(hp).connect(gc).connect(out); c.start(t); c.stop(t + 0.012);
  }
}
/** A campainha da porta de uma loja: dois toques de um sino pequeno. */
function campainha(ctx, out, t, g = 1) {
  const par = [[1, 1], [2.32, 0.5], [4.25, 0.28], [6.63, 0.12]];
  sino(ctx, out, t, 1980, { g: 0.26 * g, dur: 1.0, parciais: par, pan: 0.15 });
  sino(ctx, out, t + 0.004, 2490, { g: 0.13 * g, dur: 0.8, parciais: par, pan: 0.15 });
  sino(ctx, out, t + 0.13, 1980, { g: 0.18 * g, dur: 0.9, parciais: par, pan: 0.2 });
}
/** O rangido de uma dobradiça: dente-de-serra a tremer por um filtro ressonante, a roçar. */
function rangido(ctx, out, t, dur, seed = 11, g = 0.3) {
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  const r = rng(seed);
  const curva = new Float32Array(48);
  let f = 105;
  for (let i = 0; i < curva.length; i++) { f += (r() - 0.5) * 26; f = Math.min(150, Math.max(78, f)); curva[i] = f; }
  o.frequency.setValueCurveAtTime(curva, t, dur);
  const bp = filtro(ctx, 'bandpass', 900, 7);
  bp.frequency.setValueAtTime(900, t);
  bp.frequency.linearRampToValueAtTime(1500, t + dur * 0.55);
  bp.frequency.linearRampToValueAtTime(1050, t + dur);
  const am = ganho(ctx, 0.55);
  const lfo = ctx.createOscillator(); lfo.type = 'square';
  lfo.frequency.setValueAtTime(24, t); lfo.frequency.linearRampToValueAtTime(37, t + dur);
  const prof = ganho(ctx, 0.45);
  lfo.connect(prof).connect(am.gain);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.linearRampToValueAtTime(g, t + 0.08);
  gn.gain.setValueAtTime(g, t + dur * 0.8);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(bp).connect(am).connect(gn).connect(out);
  o.start(t); o.stop(t + dur + 0.02); lfo.start(t); lfo.stop(t + dur + 0.02);
}

// ---------- Os efeitos ----------
// Cada um desenha o seu som a partir do instante 0 em `out` (seco) e `rev` (para a sala).

const EFEITOS = {
  transicao: [1.25, (ctx, out, rev) => {
    const n = ruido(ctx, 1.25, 3);
    const bp = filtro(ctx, 'bandpass', 300, 1.1);
    bp.frequency.setValueAtTime(300, 0); bp.frequency.exponentialRampToValueAtTime(2600, 0.45); bp.frequency.exponentialRampToValueAtTime(520, 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, 0.38); g.gain.exponentialRampToValueAtTime(0.0001, 1.15);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ganho(ctx);
    if (p.pan) { p.pan.setValueAtTime(-0.7, 0); p.pan.linearRampToValueAtTime(0.7, 1.05); }
    n.connect(bp).connect(g).connect(p);
    p.connect(out); p.connect(rev);
    n.start(0); n.stop(1.2);
    const n2 = ruido(ctx, 1.2, 4);
    const lp = filtro(ctx, 'lowpass', 380);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, 0); g2.gain.exponentialRampToValueAtTime(0.45, 0.4); g2.gain.exponentialRampToValueAtTime(0.0001, 1.1);
    n2.connect(lp).connect(g2).connect(out);
    n2.start(0); n2.stop(1.2);
  }],
  porta: [2.4, (ctx, out, rev) => {
    clique(ctx, out, 0.02, 2600, 0.55);
    rangido(ctx, out, 0.12, 0.85, 11, 0.3);
    varrimento(ctx, out, 0.25, 1.05, 260, 900, 0.22, { q: 0.6, seed: 21, ataque: 0.5 });
    campainha(ctx, out, 0.34);
    campainha(ctx, rev, 0.34, 0.8);
  }],
  porta_fechar: [1.8, (ctx, out, rev) => {
    rangido(ctx, out, 0, 0.38, 17, 0.24);
    baque(ctx, out, 0.42, 80, 44, 0.85, 0.38);
    baque(ctx, rev, 0.42, 80, 44, 0.4, 0.3);
    clique(ctx, out, 0.5, 2200, 0.4);
    clique(ctx, out, 0.56, 3100, 0.25);
  }],
  caixa: [1.9, (ctx, out, rev) => {
    // «Ka»: a mola e a gaveta.
    const n = ruido(ctx, 0.07, 31);
    const bp = filtro(ctx, 'bandpass', 1100, 1.4);
    const g = ctx.createGain(); env(g.gain, 0, 0.6, 0.002, 0.05);
    n.connect(bp).connect(g).connect(out); n.start(0); n.stop(0.08);
    deslize(ctx, out, 0.004, 0.1, 170, 85, 0.5);
    varrimento(ctx, out, 0.06, 0.26, 1500, 700, 0.18, { q: 0.5, seed: 33, ataque: 0.3 });
    // «Ching»: a campainha da caixa, com moedas.
    const par = [[1, 1], [2.01, 0.35], [2.99, 0.18], [4.1, 0.08]];
    sino(ctx, out, 0.11, 2349, { g: 0.34, dur: 1.4, parciais: par });
    sino(ctx, out, 0.115, 3136, { g: 0.22, dur: 1.2, parciais: par });
    sino(ctx, rev, 0.11, 2349, { g: 0.2, dur: 1.2, parciais: par });
    moedasEm(ctx, out, 0.2, 4, 35, 0.8);
  }],
  moedas: [1.0, (ctx, out, rev) => {
    moedasEm(ctx, out, 0.0, 6, 5, 1);
    moedasEm(ctx, rev, 0.0, 3, 6, 0.5);
  }],
  tique: [0.09, (ctx, out) => {
    const o = ctx.createOscillator(); o.frequency.value = 2100;
    const g = ctx.createGain(); env(g.gain, 0, 0.5, 0.0008, 0.025);
    o.connect(g).connect(out); o.start(0); o.stop(0.05);
    clique(ctx, out, 0, 3800, 0.35);
  }],
  pop: [0.32, (ctx, out, rev) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(640, 0); o.frequency.exponentialRampToValueAtTime(300, 0.08);
    const g = ctx.createGain(); env(g.gain, 0, 0.6, 0.003, 0.14);
    o.connect(g); g.connect(out); g.connect(rev);
    o.start(0); o.stop(0.2);
  }],
  subida: [2.1, (ctx, out, rev) => {
    varrimento(ctx, out, 0, 1.15, 350, 4800, 0.32, { q: 2, seed: 41, ataque: 0.95 });
    deslize(ctx, out, 0, 1.15, 220, 660, 0.09);
    // Um arpejo a subir: Ré, Fá sustenido, Lá, Ré.
    [1175, 1480, 1760, 2349].forEach((f, k) => {
      sino(ctx, out, 1.12 + k * 0.08, f, { g: 0.22, dur: 0.9, parciais: [[1, 1], [2, 0.3], [3, 0.12]], pan: -0.3 + k * 0.2 });
      sino(ctx, rev, 1.12 + k * 0.08, f, { g: 0.14, dur: 0.8, parciais: [[1, 1], [2, 0.3]] });
    });
  }],
  subida_curta: [1.2, (ctx, out) => {
    varrimento(ctx, out, 0, 1.0, 300, 3200, 0.26, { q: 1.8, seed: 43, ataque: 0.92 });
    deslize(ctx, out, 0, 1.0, 180, 540, 0.05);
    clique(ctx, out, 1.0, 3000, 0.12);
  }],
  subida_longa: [3.2, (ctx, out, rev) => {
    varrimento(ctx, out, 0, 2.8, 220, 4200, 0.3, { q: 1.6, seed: 45, ataque: 0.95 });
    deslize(ctx, out, 0, 2.8, 160, 640, 0.07);
    varrimento(ctx, rev, 2.6, 0.5, 4000, 1200, 0.15, { q: 0.8, seed: 46, ataque: 0.2 });
  }],
  queda: [1.7, (ctx, out, rev) => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(760, 0); o.frequency.exponentialRampToValueAtTime(150, 0.9);
    const lp = filtro(ctx, 'lowpass', 3200);
    lp.frequency.setValueAtTime(3200, 0); lp.frequency.exponentialRampToValueAtTime(600, 0.9);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.28, 0.05); g.gain.setValueAtTime(0.28, 0.75); g.gain.exponentialRampToValueAtTime(0.0001, 0.95);
    o.connect(lp).connect(g).connect(out); o.start(0); o.stop(1);
    varrimento(ctx, out, 0, 0.9, 2600, 300, 0.16, { q: 1.2, seed: 51, ataque: 0.25 });
    baque(ctx, out, 0.95, 70, 50, 0.35, 0.4);
    // Duas notas a descer, suaves: Mi e Dó.
    [[659, 0.98], [523, 1.2]].forEach(([f, t]) => {
      const n = ctx.createOscillator(); n.type = 'triangle'; n.frequency.value = f;
      const gn = ctx.createGain(); env(gn.gain, t, 0.14, 0.01, 0.35);
      n.connect(gn); gn.connect(out); gn.connect(rev); n.start(t); n.stop(t + 0.4);
    });
  }],
  alerta: [0.8, (ctx, out, rev) => {
    [[880, 0, 0.16], [698, 0.2, 0.22]].forEach(([f, t, d]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const lp = filtro(ctx, 'lowpass', 3000);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.015); g.gain.setValueAtTime(0.22, t + d - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
      o.connect(lp).connect(g); g.connect(out); g.connect(rev);
      o.start(t); o.stop(t + d + 0.15);
    });
  }],
  brilho: [1.9, (ctx, out, rev) => {
    const r = rng(77);
    const notas = [1175, 1319, 1480, 1760, 1976, 2349];
    for (let k = 0; k < 9; k++) {
      const f = notas[Math.floor(r() * notas.length)] * (k > 5 ? 2 : 1);
      sino(ctx, out, k * 0.07, f, { g: 0.07 + r() * 0.06, dur: 0.7, parciais: [[1, 1], [2, 0.25], [3.01, 0.1]], pan: (r() - 0.5) * 1.2 });
      sino(ctx, rev, k * 0.07, f, { g: 0.06, dur: 0.6, parciais: [[1, 1]] });
    }
    varrimento(ctx, out, 0, 0.8, 7000, 9000, 0.05, { q: 0.5, seed: 78, ataque: 0.5 });
  }],
  impacto: [2.4, (ctx, out, rev) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95, 0); o.frequency.exponentialRampToValueAtTime(40, 0.7);
    const g = ctx.createGain(); env(g.gain, 0, 0.9, 0.004, 1.5);
    o.connect(g).connect(out); o.start(0); o.stop(1.6);
    // Os médios do impacto (ouvem-se em colunas pequenas) e um brilho curto por cima.
    const m = ctx.createOscillator(); m.type = 'triangle';
    m.frequency.setValueAtTime(220, 0); m.frequency.exponentialRampToValueAtTime(110, 0.4);
    const gm = ctx.createGain(); env(gm.gain, 0, 0.4, 0.003, 0.5);
    m.connect(gm); gm.connect(out); gm.connect(rev); m.start(0); m.stop(0.6);
    varrimento(ctx, rev, 0, 0.6, 3000, 900, 0.18, { q: 0.7, seed: 83, ataque: 0.05 });
    const n = ruido(ctx, 0.4, 81);
    const lp = filtro(ctx, 'lowpass', 700);
    const gn = ctx.createGain(); env(gn.gain, 0, 0.35, 0.002, 0.3);
    n.connect(lp).connect(gn); gn.connect(out); gn.connect(rev);
    n.start(0); n.stop(0.4);
    const gr = ctx.createGain(); env(gr.gain, 0, 0.5, 0.004, 1.2);
    const o2 = ctx.createOscillator(); o2.frequency.value = 55;
    o2.connect(gr).connect(rev); o2.start(0); o2.stop(1.3);
  }],
  pagina: [0.55, (ctx, out) => {
    [[0, 0.24, 0.36], [0.27, 0.16, 0.2]].forEach(([t, d, g], k) => {
      const n = ruido(ctx, d + 0.05, 91 + k);
      const bp = filtro(ctx, 'bandpass', 3500, 0.9);
      bp.frequency.setValueAtTime(3500, t); bp.frequency.exponentialRampToValueAtTime(1100, t + d);
      const am = ganho(ctx, 0.6);
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 26 + k * 6;
      const prof = ganho(ctx, 0.35); lfo.connect(prof).connect(am.gain);
      const gn = ctx.createGain(); env(gn.gain, t, g, 0.01, d);
      n.connect(bp).connect(am).connect(gn).connect(out);
      n.start(t); n.stop(t + d + 0.05); lfo.start(t); lfo.stop(t + d + 0.05);
    });
  }],
  acorde_final: [5.2, (ctx, out, rev) => {
    const notas = [50, 57, 61, 64, 66, 74];
    const lp = filtro(ctx, 'lowpass', 1300, 0.5);
    lp.connect(out); lp.connect(rev);
    notas.forEach((m) => [-6, 6].forEach((cents) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.045, 0.6); g.gain.setValueAtTime(0.045, 2.4); g.gain.exponentialRampToValueAtTime(0.0001, 5);
      o.connect(g).connect(lp); o.start(0); o.stop(5.1);
    }));
    const sub = ctx.createOscillator(); sub.frequency.value = hz(38);
    const gs = ctx.createGain(); gs.gain.setValueAtTime(0.0001, 0); gs.gain.linearRampToValueAtTime(0.2, 0.5); gs.gain.setValueAtTime(0.2, 2.4); gs.gain.exponentialRampToValueAtTime(0.0001, 5);
    sub.connect(gs).connect(out); sub.start(0); sub.stop(5.1);
    sino(ctx, out, 0.15, hz(86), { g: 0.16, dur: 2.6, parciais: [[1, 1], [2, 0.3], [3, 0.1]] });
    sino(ctx, rev, 0.15, hz(86), { g: 0.12, dur: 2.2, parciais: [[1, 1]] });
  }],
};

/** Põe o pico de um som em `alvo` (os ganhos das deixas ficam comparáveis entre sons). */
function normalizar(buf, alvo = 0.8) {
  let pico = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pico) pico = v; }
  }
  if (!pico) return buf;
  const k = alvo / pico;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return buf;
}

async function renderizarEfeito(nome, sampleRate) {
  const [dur, desenhar] = EFEITOS[nome];
  const C = OfflineCtx();
  const ctx = new C(2, Math.ceil(dur * sampleRate), sampleRate);
  const saida = ganho(ctx, 1);
  saida.connect(ctx.destination);
  const conv = ctx.createConvolver();
  conv.buffer = sala(ctx, 1.6, 3.2, nome.length * 13);
  const rev = ganho(ctx, 0.35);
  rev.connect(conv).connect(saida);
  desenhar(ctx, saida, rev);
  return normalizar(await ctx.startRendering(), nome === 'acorde_final' ? 0.7 : 0.8);
}

// ---------- A música ----------

function vozDaMusica(ctx, n, t, buses) {
  const f = hz(n.midi);
  if (n.tipo === 'pad') {
    [-7, 7].forEach((cents) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03 * n.vel, t + 1.0);
      g.gain.setValueAtTime(0.03 * n.vel, t + n.dur - 0.1); g.gain.linearRampToValueAtTime(0.0001, t + n.dur + 1.2);
      o.connect(g).connect(buses.pad); o.start(t); o.stop(t + n.dur + 1.3);
    });
  } else if (n.tipo === 'baixo') {
    [[1, 0.2], [2, 0.05]].forEach(([m, k]) => {
      const o = ctx.createOscillator(); o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(k * n.vel, t + 0.3);
      g.gain.setValueAtTime(k * n.vel, t + n.dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + n.dur + 0.4);
      o.connect(g).connect(buses.baixo); o.start(t); o.stop(t + n.dur + 0.5);
    });
  } else if (n.tipo === 'arpejo') {
    [['triangle', 1, 1], ['sine', 2, 0.25]].forEach(([tipo, m, k]) => {
      const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f * m;
      const g = ctx.createGain(); env(g.gain, t, 0.07 * n.vel * k, 0.004, 0.42);
      o.connect(g).connect(buses.arpejo); o.start(t); o.stop(t + 0.5);
    });
  } else if (n.tipo === 'bombo') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain(); env(g.gain, t, 0.42 * n.vel, 0.003, 0.28);
    o.connect(g).connect(buses.bateria); o.start(t); o.stop(t + 0.35);
  } else if (n.tipo === 'chimbal') {
    const s = ctx.createBufferSource(); s.buffer = buses.ruido;
    const hp = filtro(ctx, 'highpass', 7000);
    const g = ctx.createGain(); env(g.gain, t, 0.05 * n.vel, 0.001, 0.04);
    s.connect(hp).connect(g).connect(buses.bateria); s.start(t, (t * 0.37) % 0.5); s.stop(t + 0.06);
  }
}

/**
 * Um ciclo da música, pronto a repetir: sintetiza dois ciclos seguidos e fica com o segundo, que
 * já tem as caudas (reverberação, eco) do primeiro — por isso a emenda não se ouve.
 */
async function renderizarMusica(sampleRate = 32000) {
  const ciclo = duracaoDoCiclo(MUSICA);
  const C = OfflineCtx();
  const len = Math.ceil(ciclo * sampleRate);
  const ctx = new C(2, len * 2, sampleRate);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 2.5; comp.attack.value = 0.02; comp.release.value = 0.3;
  const soma = ganho(ctx, 0.9);
  soma.connect(comp).connect(ctx.destination);
  const conv = ctx.createConvolver(); conv.buffer = sala(ctx, 2.6, 2.6, 5);
  const rev = ganho(ctx, 0.35); rev.connect(conv).connect(soma);
  const pad = filtro(ctx, 'lowpass', 1150, 0.4); pad.connect(soma); pad.connect(rev);
  const baixo = filtro(ctx, 'lowpass', 300, 0.5); baixo.connect(soma);
  // O arpejo com eco (colcheia com ponto), cada repetição mais escura.
  const arpejo = ganho(ctx, 1); arpejo.connect(soma); arpejo.connect(rev);
  const eco = ctx.createDelay(1); eco.delayTime.value = (60 / MUSICA.bpm) * 0.75;
  const volta = ganho(ctx, 0.32); const escuro = filtro(ctx, 'lowpass', 2400);
  arpejo.connect(eco); eco.connect(escuro).connect(volta).connect(eco); escuro.connect(soma);
  const bateria = ganho(ctx, 1); bateria.connect(soma);
  const buses = { pad, baixo, arpejo, bateria, ruido: bufferDeRuido(ctx, 1, 99) };
  const notas = notasDoCiclo(MUSICA);
  [0, ciclo].forEach((off) => notas.forEach((n) => vozDaMusica(ctx, n, off + n.t, buses)));
  const tudo = await ctx.startRendering();
  const loop = ctx.createBuffer(2, len, sampleRate);
  for (let ch = 0; ch < 2; ch++) loop.copyToChannel(tudo.getChannelData(ch).subarray(len, len * 2), ch);
  return normalizar(loop, 0.75);
}

let cache = null;
/**
 * Sintetiza uma vez os efeitos e a música (cerca de um segundo) e guarda-os para os vídeos
 * seguintes. Devolve { biblioteca: { som: AudioBuffer }, musica: AudioBuffer }.
 */
export function prepararSom(sampleRate = 48000) {
  if (!somDisponivel()) return Promise.reject(new Error('Este navegador não consegue gerar som (Web Audio).'));
  if (!cache || cache.sampleRate !== sampleRate) {
    const p = (async () => {
      const nomes = Object.keys(EFEITOS);
      const bufs = await Promise.all(nomes.map((n) => renderizarEfeito(n, sampleRate)));
      const musica = await renderizarMusica(Math.min(sampleRate, 32000));
      return { biblioteca: Object.fromEntries(nomes.map((n, i) => [n, bufs[i]])), musica };
    })();
    cache = { sampleRate, p };
    p.catch(() => { if (cache && cache.p === p) cache = null; });
  }
  return cache.p;
}

// ---------- A mesa de mistura ----------

const nivelDe = (an, buf) => {
  an.getFloatTimeDomainData(buf);
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
};

/**
 * A mesa de mistura no contexto `ctx` (um AudioContext criado com um clique). `som` vem de
 * prepararSom(). Volumes de 0 a 1 por pista.
 */
/**
 * Quanto vale cada pista com o cursor no máximo. A música fica muito abaixo dos efeitos e da voz
 * (é um fundo): medido na página de teste (e2e/painel/som.html), com estes valores os efeitos ficam
 * 8 a 18 dB acima da música, e a voz por cima de tudo.
 */
export const ESCALA = { musica: 0.34, efeitos: 1, voz: 1 };

export function criarMistura(ctx, som, volumes = {}) {
  const musica = ganho(ctx, (volumes.musica ?? 0.55) * ESCALA.musica);
  const efeitos = ganho(ctx, (volumes.efeitos ?? 0.85) * ESCALA.efeitos);
  const voz = ganho(ctx, (volumes.voz ?? 1) * ESCALA.voz);
  const duck = ganho(ctx, 1);
  musica.connect(duck);
  const soma = ganho(ctx, 1);
  duck.connect(soma); efeitos.connect(soma); voz.connect(soma);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.25;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
  // Ganho de compensação antes do limitador: o volume sobe sem os picos passarem do limite.
  const compensa = ganho(ctx, 1.5);
  const master = ganho(ctx, 0.9);
  soma.connect(comp).connect(compensa).connect(lim).connect(master);
  // As colunas ouvem a música e os efeitos, sem a voz (o microfone não pode ouvir-se a si próprio).
  const monitor = ganho(ctx, 0.9);
  duck.connect(monitor); efeitos.connect(monitor);
  const medidor = ctx.createAnalyser(); medidor.fftSize = 1024; master.connect(medidor);
  const medidorVoz = ctx.createAnalyser(); medidorVoz.fftSize = 1024;
  const bufM = new Float32Array(medidor.fftSize);
  const bufV = new Float32Array(medidorVoz.fftSize);
  let mic = null;
  let comVoz = false;
  // O ducking só marca uma automação quando muda (fala ↔ silêncio), não a cada imagem.
  let falaAgora = false;
  let ultimaFala = -10;
  const baixar = (fala) => {
    if (fala === falaAgora) return;
    falaAgora = fala;
    duck.gain.cancelScheduledValues(ctx.currentTime);
    duck.gain.setTargetAtTime(fala ? 0.32 : 1, ctx.currentTime, fala ? 0.06 : 0.45);
  };

  const M = {
    ctx, master, monitor,
    volumes(v) {
      const t = ctx.currentTime;
      if (v.musica != null) musica.gain.setTargetAtTime(v.musica * ESCALA.musica, t, 0.05);
      if (v.efeitos != null) efeitos.gain.setTargetAtTime(v.efeitos * ESCALA.efeitos, t, 0.05);
      if (v.voz != null) voz.gain.setTargetAtTime(v.voz * ESCALA.voz, t, 0.05);
    },
    /** Liga o microfone (um MediaStream de getUserMedia): só mede até `gravarVoz(true)`. */
    ligarMicrofone(stream) {
      M.desligarMicrofone();
      const src = ctx.createMediaStreamSource(stream);
      const hp = filtro(ctx, 'highpass', 90);
      const c = ctx.createDynamicsCompressor();
      c.threshold.value = -26; c.ratio.value = 3; c.attack.value = 0.005; c.release.value = 0.2;
      const g = ganho(ctx, 1.4);
      src.connect(hp).connect(c).connect(g);
      g.connect(medidorVoz);
      mic = { src, g, stream };
    },
    desligarMicrofone() {
      if (!mic) return;
      try { mic.src.disconnect(); mic.g.disconnect(); } catch (e) { /* já desligado */ }
      mic = null; comVoz = false;
      baixar(false);
    },
    /** A voz entra (ou sai) da mistura que vai para o ficheiro. */
    gravarVoz(on) {
      if (!mic) return;
      if (on && !comVoz) mic.g.connect(voz);
      if (!on && comVoz) { try { mic.g.disconnect(voz); } catch (e) { /* idem */ } }
      comVoz = !!on;
      if (!comVoz) baixar(false);
    },
    temMicrofone: () => !!mic,
    /** Níveis (0–1, RMS) da mistura e da voz, para os medidores; e a música baixa quando se fala. */
    medir() {
      const geral = nivelDe(medidor, bufM);
      const v = mic ? nivelDe(medidorVoz, bufV) : 0;
      // Fica em baixo até 0,6 s depois da última palavra: entre sílabas a música não sobe e desce.
      if (comVoz) {
        if (v > 0.035) ultimaFala = ctx.currentTime;
        baixar(ctx.currentTime - ultimaFala < 0.6);
      }
      return { geral, voz: v };
    },
    /**
     * Toca as deixas (`pista`) e a música a partir do segundo `desde` do vídeo, no instante
     * `quando` do relógio do áudio. Devolve { parar() }.
     */
    tocar({ pista = [], total, desde = 0, quando = ctx.currentTime + 0.05, musicaLigada = true, efeitosLigados = true }) {
      const sm = ganho(ctx, 1); sm.connect(musica);
      const se = ganho(ctx, 1); se.connect(efeitos);
      const fontes = [];
      const em = (t) => quando + (t - desde);
      if (musicaLigada && som.musica) {
        const s = ctx.createBufferSource();
        s.buffer = som.musica; s.loop = true;
        const fade = ctx.createGain();
        s.connect(fade).connect(sm);
        // Entra em 1,8 s; sai nos últimos 3 s, por baixo do acorde final.
        const tIn = Math.min(1.8, total / 3);
        const tOut0 = Math.max(tIn, total - 3.2);
        const tOut1 = Math.max(tOut0 + 0.3, total - 0.4);
        const nivel = (t) => (t <= 0 ? 0 : t < tIn ? t / tIn : t < tOut0 ? 1 : t < tOut1 ? 1 - (t - tOut0) / (tOut1 - tOut0) : 0);
        fade.gain.setValueAtTime(nivel(desde), quando);
        [tIn, tOut0, tOut1].forEach((tt) => { if (tt > desde) fade.gain.linearRampToValueAtTime(nivel(tt), em(tt)); });
        s.start(quando, desde % som.musica.duration);
        s.stop(em(total + 0.3));
        fontes.push(s);
        const fim = som.biblioteca.acorde_final;
        const tAcorde = Math.max(0, total - 2.8);
        if (fim && desde < tAcorde + 1) {
          const a = ctx.createBufferSource(); a.buffer = fim;
          const g = ganho(ctx, 0.55); a.connect(g).connect(sm);
          if (desde > tAcorde) a.start(quando, desde - tAcorde); else a.start(em(tAcorde));
          fontes.push(a);
        }
      }
      if (efeitosLigados) {
        pista.forEach((d) => {
          const b = som.biblioteca[d.som];
          if (!b) return;
          const atraso = desde - d.t;
          if (atraso > b.duration) return;
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.playbackRate.value = d.vel || 1;
          const g = ganho(ctx, d.ganho ?? 1);
          s.connect(g);
          if (d.pan) g.connect(panner(ctx, d.pan)).connect(se); else g.connect(se);
          if (atraso > 0) s.start(quando, atraso); else s.start(quando - atraso);
          fontes.push(s);
        });
      }
      let parado = false;
      return {
        parar() {
          if (parado) return;
          parado = true;
          const t = ctx.currentTime;
          sm.gain.setTargetAtTime(0, t, 0.02); se.gain.setTargetAtTime(0, t, 0.02);
          setTimeout(() => {
            fontes.forEach((s) => { try { s.stop(); } catch (e) { /* já parou */ } });
            try { sm.disconnect(); se.disconnect(); } catch (e) { /* idem */ }
          }, 120);
        },
      };
    },
    fechar() {
      M.desligarMicrofone();
      try { master.disconnect(); monitor.disconnect(); } catch (e) { /* idem */ }
    },
  };
  return M;
}
