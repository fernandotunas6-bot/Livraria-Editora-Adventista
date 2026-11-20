// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * A banda sonora dos vídeos, como deixas no tempo: que som toca, em que segundo e com que força,
 * a seguir o que cada quadro desenha em video.js. Puro (sem Web Audio), testado em
 * deixas-video.test.js; quem toca os sons é som-video.js.
 *
 * O que se ouve, quadro a quadro (os tempos são os das animações de video.js):
 *  · a transição entre quadros: um sopro (whoosh) que atravessa o ecrã com o clarão;
 *  · a capa: a porta da loja a abrir, com a campainha, e o impacto do título;
 *  · os números a contar: o contador (tiques que abrandam com a contagem) e, no fim, a caixa
 *    registadora;
 *  · as barras e o acumulado a crescer: uma subida; o crescimento positivo fecha com um toque a
 *    subir e moedas, o negativo com uma descida;
 *  · o melhor mês e a projecção: um brilho; os meses por registar: um aviso suave;
 *  · cada livraria no vídeo de todas as livrarias: a porta dessa loja a abrir;
 *  · o fecho: a porta a fechar e o acorde final da música.
 *
 * A música de fundo é um ciclo de quatro acordes que se repete (notasDoCiclo), gerado e não
 * descarregado: não há ficheiros nem licenças, e o mesmo vídeo soa sempre igual.
 */

/** Os sons, com a família que a linha de tempo do Estúdio mostra. */
export const SONS = {
  transicao: { familia: 'transicao', nome: 'Transição' },
  porta: { familia: 'porta', nome: 'Porta a abrir' },
  porta_fechar: { familia: 'porta', nome: 'Porta a fechar' },
  caixa: { familia: 'dinheiro', nome: 'Caixa registadora' },
  moedas: { familia: 'dinheiro', nome: 'Moedas' },
  tique: { familia: 'dinheiro', nome: 'Contador' },
  subida: { familia: 'subida', nome: 'Subida' },
  subida_curta: { familia: 'subida', nome: 'Barras a subir' },
  subida_longa: { familia: 'subida', nome: 'Acumulado a subir' },
  queda: { familia: 'queda', nome: 'Queda' },
  alerta: { familia: 'queda', nome: 'Aviso' },
  brilho: { familia: 'destaque', nome: 'Brilho' },
  impacto: { familia: 'destaque', nome: 'Impacto' },
  pop: { familia: 'outro', nome: 'Entrada' },
  pagina: { familia: 'outro', nome: 'Página' },
};

/** As famílias, pela ordem da legenda do Estúdio. */
export const FAMILIAS = {
  dinheiro: 'Dinheiro',
  porta: 'Portas',
  subida: 'Subidas',
  queda: 'Quedas e avisos',
  destaque: 'Destaques',
  transicao: 'Transições',
  outro: 'Entradas',
};

// A animação de cada quadro dura no máximo 1,4 s (a mesma conta de video.js).
const animDe = (cena) => Math.min(1.4, cena.dur * 0.3);
const r2 = (t) => Math.round(t * 100) / 100;

/**
 * Os tiques de um número a contar de 0 ao valor com «ease-out» durante `dur` segundos: densos no
 * início, cada vez mais espaçados, como um contador que abranda. `n` tiques.
 */
export function tiquesDaContagem(inicio, dur, n = 12) {
  const out = [];
  for (let k = 1; k < n; k++) out.push(r2(inicio + dur * (1 - Math.cbrt(1 - k / n))));
  return out;
}

/** O resultado de um crescimento: subida e moedas se é positivo, queda se é negativo. */
function resultado(push, t, cresc, ganho = 1) {
  if (cresc == null || !isFinite(cresc)) return;
  if (cresc >= 0) {
    push(t, 'subida', 0.5 * ganho);
    push(t + 0.85, 'moedas', 0.6 * ganho);
  } else {
    push(t, 'queda', 0.5 * ganho);
  }
}

/**
 * As deixas dos efeitos para o `plano` do vídeo. `tipo` = 'loja' (dados = exportData() do painel)
 * ou 'conjunto' (dados = buildConsolidado()). Devolve [{ t, som, ganho, pan, vel, i }] por ordem de
 * tempo, com `i` o quadro.
 */
export function pistaDeEfeitos(tipo, dados, plano) {
  const deixas = [];
  const conjunto = tipo === 'conjunto';
  const R = (conjunto ? dados && dados.total && dados.total.R : dados && dados.R) || {};
  const dest = conjunto ? (dados && dados.destaques && dados.destaques.rede) || null : (dados && dados.destaques) || null;
  const nLivros = dest && dest.ano ? dest.ano.length : 0;
  let acc = 0;
  let n = 0;
  plano.forEach((cena, i) => {
    const t0 = acc;
    const a = animDe(cena);
    const fimCena = t0 + cena.dur;
    // Cada som dentro do seu quadro (o que passasse do fim tocaria por cima do seguinte).
    const push = (t, som, ganho = 1, extra = {}) => {
      const tt = t0 + t;
      if (tt >= fimCena - 0.05 && som !== 'porta_fechar') return;
      n++;
      // Um pouco de variação (sempre a mesma para o mesmo vídeo): os sons repetidos não soam a máquina.
      const vel = 1 + (((n * 7919) % 13) - 6) * 0.006;
      deixas.push({ t: r2(tt), som, ganho: r2(ganho), pan: extra.pan ?? 0, vel: Math.round(vel * 1000) / 1000, i });
    };
    if (i > 0) push(0, 'transicao', 0.55, { pan: 0 });
    switch (cena.k) {
      case 'capa': {
        push(0.1, 'porta', 0.85);
        push(a * 0.55, 'impacto', 0.55);
        for (let k = 0; k < Math.min(3, nLivros); k++) push(0.3 + k * 0.25 + 0.55, 'pop', 0.3, { pan: k === 1 ? -0.3 : k === 2 ? 0.3 : 0 });
        break;
      }
      case 'resumo': {
        tiquesDaContagem(0.12, a, 12).forEach((t) => push(t, 'tique', 0.45));
        push(a * 1.02, 'caixa', 0.6);
        resultado(push, a + 0.45, R.cresc_ytd, 0.8);
        break;
      }
      case 'mensal': {
        push(0.1, 'subida_curta', 0.4);
        if (R.cresc_ytd != null && R.cresc_ytd >= 0) push(a * 1.45, 'brilho', 0.4);
        break;
      }
      case 'mes':
      case 'mesRede': {
        const r = cena.r || {};
        push(0.05, 'subida_curta', 0.3);
        if (r.v2 == null) {
          push(a * 0.7, 'alerta', 0.3);
          break;
        }
        resultado(push, a * 0.65, r.cresc);
        if (r.posicao === 1) { push(a + 0.25, 'caixa', 0.55); push(a + 0.55, 'brilho', 0.35); }
        if (cena.k === 'mesRede' && conjunto && dados.meses && dados.meses[r.i] && dados.meses[r.i].registadas < dados.meses[r.i].de) push(a + 0.9, 'alerta', 0.22);
        if (cena.k === 'mes' && dest && dest.meses && (dest.meses[r.i] || []).length) push(0.65, 'pagina', 0.5);
        break;
      }
      case 'quadro': {
        const linhas = conjunto ? (dados.lojas || []).filter((l) => l.temDados).length : 12;
        const passo = conjunto ? 0.08 : 0.07;
        for (let k = 0; k < linhas; k++) push(0.05 + k * passo, 'tique', 0.4, { pan: -0.3 + (k % 3) * 0.3 });
        push(0.05 + linhas * passo + 0.35, 'moedas', 0.6);
        break;
      }
      case 'acum': {
        const dLinha = Math.max(1, a * 2);
        push(0.1, 'subida_longa', 0.42);
        push(dLinha + 0.1, 'brilho', 0.45);
        break;
      }
      case 'ranking': {
        const meses = conjunto ? 0 : (dados.rows || []).filter((r) => r.estado === 'Fechado').length;
        for (let k = 0; k < Math.min(12, meses); k++) push(0.2 + k * 0.08, 'tique', 0.36);
        if (meses) push(0.45, 'brilho', 0.3);
        break;
      }
      case 'lojas': {
        const lojas = (dados.lojas || []).filter((l) => l.temDados);
        lojas.forEach((l, k) => push(0.3 + k * 0.1, 'pop', 0.32, { pan: -0.4 + (k % 3) * 0.4 }));
        if (lojas.length) push(1.0, 'caixa', 0.5);
        break;
      }
      case 'loja': {
        // Entrar em cada livraria: a porta dessa loja a abrir, e as vendas a contar.
        push(0.12, 'porta', 0.7);
        tiquesDaContagem(0.35, a, 10).forEach((t) => push(t, 'tique', 0.42));
        push(a * 1.02 + 0.25, 'caixa', 0.55);
        resultado(push, a + 0.6, cena.l && cena.l.M && cena.l.M.R ? cena.l.M.R.cresc_ytd : null, 0.8);
        break;
      }
      case 'destaque': {
        push(0.2, 'pagina', 0.6);
        push(1.0, 'impacto', 0.4);
        push(1.35, 'caixa', 0.55);
        break;
      }
      case 'maisVendidos': {
        const k5 = Math.min(5, nLivros);
        for (let k = 0; k < k5; k++) push(0.25 + k * 0.22 + 0.5, 'pop', 0.32, { pan: -0.5 + (k / Math.max(1, k5 - 1)) });
        if (k5) push(0.25 + k5 * 0.22 + 0.8, 'moedas', 0.55);
        break;
      }
      case 'pendentes':
        push(0.3, 'alerta', 0.45);
        break;
      case 'fecho': {
        push(0.1, 'subida_curta', 0.3);
        push(a + 0.1, 'caixa', 0.5);
        if (R.cresc_proj != null && R.cresc_proj >= 0) push(a + 0.45, 'brilho', 0.4);
        push(Math.max(a + 1.2, cena.dur - 1.8), 'porta_fechar', 0.6);
        break;
      }
      default:
        break;
    }
    acc += cena.dur;
  });
  return deixas.sort((x, y) => x.t - y.t);
}

// ---------- Música ----------

/** O andamento e os acordes do ciclo (Ré maior: I – vi – IV – V, dois compassos cada). */
export const MUSICA = {
  bpm: 88,
  acordes: [
    { nome: 'Dmaj9', pad: [50, 57, 61, 64, 66], baixo: 38 },
    { nome: 'Bm11', pad: [47, 54, 57, 61, 62], baixo: 35 },
    { nome: 'Gmaj9', pad: [43, 50, 54, 57, 59], baixo: 31 },
    { nome: 'A6sus2', pad: [45, 52, 57, 59, 61, 64], baixo: 33 },
  ],
  compassosPorAcorde: 2,
};

/** Duração de um ciclo da música (os quatro acordes), em segundos. */
export const duracaoDoCiclo = (m = MUSICA) => (60 / m.bpm) * 4 * m.compassosPorAcorde * m.acordes.length;

/** A frequência de uma nota MIDI. */
export const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * As notas de um ciclo da música de fundo: o pad e o baixo de cada acorde, um arpejo suave em
 * colcheias e uma batida discreta (bombo nos tempos 1 e 3, chimbal nos contratempos).
 * Devolve [{ t, dur, tipo: 'pad'|'baixo'|'arpejo'|'bombo'|'chimbal', midi, vel }].
 */
export function notasDoCiclo(m = MUSICA) {
  const tempo = 60 / m.bpm;
  const compasso = tempo * 4;
  const durAcorde = compasso * m.compassosPorAcorde;
  const notas = [];
  const padrao = [0, 1, 2, 3, 2, 1, 3, 2];
  m.acordes.forEach((ac, j) => {
    const t0 = j * durAcorde;
    ac.pad.forEach((midi) => notas.push({ t: t0, dur: durAcorde, tipo: 'pad', midi, vel: 0.5 }));
    notas.push({ t: t0, dur: durAcorde, tipo: 'baixo', midi: ac.baixo, vel: 0.6 });
    const topo = [...ac.pad].sort((a, b) => a - b).slice(-4).map((x) => x + 12);
    for (let c = 0; c < m.compassosPorAcorde; c++) {
      for (let k = 0; k < 8; k++) {
        const t = t0 + c * compasso + k * (tempo / 2);
        // Acento no início de cada tempo; a segunda volta do padrão um pouco mais baixa.
        notas.push({ t, dur: tempo * 0.9, tipo: 'arpejo', midi: topo[padrao[k] % topo.length], vel: (k % 2 ? 0.55 : 0.75) * (c ? 0.85 : 1) });
        if (k % 4 === 0) notas.push({ t, dur: 0.3, tipo: 'bombo', midi: 0, vel: k === 0 ? 0.8 : 0.6 });
        if (k % 2 === 1) notas.push({ t, dur: 0.05, tipo: 'chimbal', midi: 0, vel: 0.35 });
      }
    }
  });
  return notas.sort((a, b) => a.t - b.t);
}
