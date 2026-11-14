/**
 * O som do modo apresentação, como os efeitos do PowerPoint: a página a virar ao mudar de
 * diapositivo, os tiques de uma máquina de calcular enquanto os números rodam, a subida das barras
 * e a caixa registadora (ou a queda) no crescimento. Os sons são os do Estúdio de vídeo
 * (som-video.js), gerados no navegador: sem ficheiros de áudio nem serviços de fora.
 *
 * O navegador só deixa tocar som depois de um clique: iniciar() corre ao abrir a apresentação (o
 * clique no botão). A escolha, ligado ou desligado, fica guardada no aparelho.
 */
import { prepararSom, somDisponivel } from './som-video.js';

const CHAVE = 'livraria_apresentacao_som';

/** Ligado, a não ser que a pessoa o tenha desligado neste aparelho. */
export function somLigadoGuardado() {
  try { return localStorage.getItem(CHAVE) !== 'desligado'; } catch { return true; }
}
function guardar(on) {
  try { localStorage.setItem(CHAVE, on ? 'ligado' : 'desligado'); } catch { /* sem armazenamento: vale só nesta visita */ }
}

/**
 * Os instantes (ms) dos tiques de um número que roda durante `dur` ms a abrandar (easeOut
 * cúbico): um tique a cada passo igual do valor, por isso juntos no início e espaçados no fim, como
 * uma máquina de calcular a parar. Entre 3 e 18 tiques, nunca dois a menos de 25 ms.
 */
export function instantesDosTiques(dur, { passo = 70, minimo = 3, maximo = 18 } = {}) {
  if (!(dur > 0)) return [];
  const n = Math.max(minimo, Math.min(maximo, Math.round(dur / passo)));
  const out = [];
  for (let k = 1; k <= n; k += 1) {
    const t = Math.round((1 - Math.cbrt(1 - k / n)) * dur);
    if (!out.length || t - out[out.length - 1] >= 25) out.push(t);
  }
  return out;
}

/**
 * O som de uma apresentação. Sem Web Audio (ou desligado), todas as funções são inofensivas e não
 * fazem nada: a apresentação corre igual, em silêncio.
 */
export function criarSomDaApresentacao({ ligado = somLigadoGuardado() } = {}) {
  const disponivel = somDisponivel();
  let on = !!ligado && disponivel;
  let ctx = null;
  let mestre = null;
  let cena = null;
  let lib = null;
  let pronto = null;
  let tiques = new Set(); // as fatias de 40 ms com tique marcado neste diapositivo

  function iniciar() {
    if (!on) return Promise.resolve(false);
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 4;
        mestre = ctx.createGain();
        mestre.gain.value = 0.7;
        mestre.connect(comp).connect(ctx.destination);
        cena = ctx.createGain();
        cena.connect(mestre);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      on = false;
      return Promise.resolve(false);
    }
    if (!pronto) pronto = prepararSom(ctx.sampleRate).then((s) => { lib = s.biblioteca; return true; }).catch(() => false);
    return pronto;
  }

  /** Um diapositivo novo: o que o anterior ainda tinha marcado cala-se depressa. */
  function novaCena() {
    tiques = new Set();
    if (!ctx || !cena) return;
    const velha = cena;
    try { velha.gain.setTargetAtTime(0, ctx.currentTime, 0.03); } catch { /* contexto fechado */ }
    setTimeout(() => { try { velha.disconnect(); } catch { /* já desligada */ } }, 300);
    cena = ctx.createGain();
    cena.connect(mestre);
  }

  function fonte(nome, ganho, quando) {
    const src = ctx.createBufferSource();
    src.buffer = lib[nome];
    const g = ctx.createGain();
    g.gain.value = ganho;
    src.connect(g).connect(cena);
    src.start(quando);
  }

  /** Um efeito da biblioteca (pagina, tique, subida_curta, caixa, queda, brilho…), daqui a `atrasoMs`. */
  function tocar(nome, ganho = 1, atrasoMs = 0) {
    if (!on || !ctx || !lib || !lib[nome]) return;
    fonte(nome, ganho, ctx.currentTime + Math.max(0, atrasoMs) / 1000);
  }

  /** Os tiques de um número que roda `durMs`; vários números ao mesmo tempo dão um tique de cada vez. */
  function contar(durMs, atrasoMs = 0, ganho = 0.28) {
    if (!on || !ctx || !lib || !lib.tique) return;
    const base = ctx.currentTime + Math.max(0, atrasoMs) / 1000;
    for (const t of instantesDosTiques(durMs)) {
      const quando = base + t / 1000;
      const fatia = Math.round(quando / 0.04);
      if (tiques.has(fatia)) continue;
      tiques.add(fatia);
      fonte('tique', ganho, quando);
    }
  }

  function ligar(v) {
    on = !!v && disponivel;
    guardar(on);
    if (on) iniciar(); else novaCena();
    return on;
  }

  function fechar() {
    novaCena();
    try { if (ctx) ctx.close(); } catch { /* já fechado */ }
    ctx = null; mestre = null; cena = null;
  }

  return { disponivel, ligado: () => on, ligar, iniciar, novaCena, tocar, contar, fechar };
}
