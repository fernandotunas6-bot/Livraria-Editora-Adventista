/**
 * O guião dos vídeos dos relatórios: uma ou duas frases por quadro, tiradas dos números, em
 * português. É o teleponto de quem grava a narração no Estúdio de vídeo e são as legendas do vídeo.
 *
 * Puro (sem DOM nem áudio), testado em guiao-video.test.js:
 *  · guiaoDoVideo(tipo, dados, plano, ritmo) → um texto por quadro do plano;
 *  · esticarPlano(plano, guiao) → o plano com cada quadro do tamanho que a frase pede para ser lida;
 *  · partirLegendas(texto) → a frase em pedaços de uma linha;
 *  · tempoDasLegendas(plano, guiao) → cada pedaço com o segundo em que entra e sai do vídeo.
 *
 * Os valores vão arredondados como se dizem («37,7 milhões de Kz»): os números exactos, com
 * cêntimos, continuam no próprio quadro.
 */
import { lojaDe } from './apresentacao.js';
import { destaqueDe } from './destaques.js';

// ---------- Números ditos ----------

const virgula = (n, casas) => n.toFixed(casas).replace('.', ',');
/** 37 679 153 → «37,7 milhões de Kz»; 743 550 → «744 mil Kz»; 950 → «950 Kz». */
export function kzDito(v) {
  if (v == null || !isFinite(v)) return '—';
  const s = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return s + virgula(a / 1e9, 2).replace(/,?0+$/, '') + ' mil milhões de Kz';
  if (a >= 1e6) {
    const m = a / 1e6;
    const t = virgula(m, m >= 100 ? 0 : m >= 10 ? 1 : 2).replace(/,0+$/, '').replace(/(,\d)0$/, '$1');
    return s + t + (t === '1' ? ' milhão de Kz' : ' milhões de Kz');
  }
  if (a >= 1e4) return s + Math.round(a / 1e3) + ' mil Kz';
  if (a >= 1e3) return s + virgula(a / 1e3, 1).replace(/,0$/, '') + ' mil Kz';
  return s + Math.round(a) + ' Kz';
}
/** 2,788 → «+278,8%»; −0,065 → «−6,5%». */
export const pctDito = (p) => (p == null || !isFinite(p) ? '—' : (p >= 0 ? '+' : '−') + virgula(Math.abs(p * 100), 1) + '%');
const pctSimples = (p) => (p == null || !isFinite(p) ? '—' : virgula(p * 100, 1) + '%');
const unidades = (n) => { const v = Math.round(Number(n) || 0); return v + (v === 1 ? ' unidade' : ' unidades'); };
/** «a», «a e b», «a, b e c». */
const lista = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);
const titulo = (t) => '«' + String(t || 'Produto').trim() + '»';

// ---------- O guião ----------

/** O texto de cada quadro do vídeo de uma loja (`d` = exportData() do painel). */
function fraseLoja(cena, d, breve) {
  const R = d.R || {};
  const A = d.ano;
  const B = d.comp;
  const loja = lojaDe({ name: d.loja });
  const rows = d.rows || [];
  const dest = d.destaques || null;
  switch (cena.k) {
    case 'capa':
      return `Relatório de vendas de ${A} da ${loja}${B != null ? ', comparado com ' + B : ''}.`;
    case 'resumo': {
      if (!R.ultimo) return `Ainda não há vendas registadas em ${A}.`;
      if (breve) return `Até ${R.ultimo.mes}: ${kzDito(R.ytd2)}${R.cresc_ytd != null ? ', ' + pctDito(R.cresc_ytd) : ''}.`;
      return `Até ${R.ultimo.mes}, a loja vendeu ${kzDito(R.ytd2)}`
        + (R.cresc_ytd != null ? `, ${pctDito(R.cresc_ytd)} face aos mesmos meses de ${B}` : '') + '.'
        + (R.projeccao != null ? ` A projecção para ${A} é de ${kzDito(R.projeccao)}.` : '');
    }
    case 'mensal':
      return frasesMensal(rows, R, B, breve);
    case 'mes':
      return fraseMes(cena.r, B, breve);
    case 'quadro':
      return R.ytd1 != null && B != null
        ? `No período comparável: ${kzDito(R.ytd2c)} em ${A}, contra ${kzDito(R.ytd1)} em ${B} — ${pctDito(R.cresc_ytd)}.`
        : `Total registado em ${A}: ${kzDito(R.ytd2)}.`;
    case 'acum':
      return `No acumulado, ${kzDito(R.ytd2)}.`
        + (R.projeccao != null ? ` Ao ritmo actual, a loja termina ${A} com cerca de ${kzDito(R.projeccao)}.` : '');
    case 'ranking': {
      const top = rows.filter((r) => r.estado === 'Fechado' && r.v2 != null).sort((a, b) => b.v2 - a.v2).slice(0, 3).map((r) => r.mes);
      return top.length ? `${top.length === 1 ? 'O melhor mês' : 'Os melhores meses'} de ${A}: ${lista(top)}.` : 'Ainda não há meses fechados.';
    }
    case 'destaque':
      return fraseDestaque(dest);
    case 'maisVendidos':
      return fraseMaisVendidos(dest);
    case 'fecho':
      return fraseFecho(R, A, B, d.meta, 'loja');
    default:
      return '';
  }
}

function frasesMensal(rows, R, B, breve) {
  const melhor = R.melhor ? `O melhor mês foi ${R.melhor.mes}, com ${kzDito(R.melhor.v2)}.` : '';
  if (breve || B == null) return melhor || 'Vendas mês a mês.';
  const comparaveis = rows.filter((r) => r.v2 != null && r.v1 != null);
  const acima = comparaveis.filter((r) => r.v2 > r.v1).length;
  if (!comparaveis.length) return melhor || 'Vendas mês a mês.';
  return `Mês a mês, ${acima} dos ${comparaveis.length} meses comparáveis ficaram acima de ${B}. ${melhor}`.trim();
}

function fraseMes(r, B, breve) {
  if (!r) return '';
  if (r.v2 == null) return `${r.mes} ainda está por preencher${r.est != null ? `; a estimativa é de ${kzDito(r.est)}` : ''}.`;
  const curso = r.estado === 'Em curso' ? ' (em curso)' : '';
  if (breve) return `${r.mes}${curso}: ${kzDito(r.v2)}${r.cresc != null ? ', ' + pctDito(r.cresc) : ''}.`;
  return `${r.mes}${curso}: ${kzDito(r.v2)}`
    + (r.v1 != null && B != null ? `, contra ${kzDito(r.v1)} em ${B}` : '')
    + (r.cresc != null ? ` — ${pctDito(r.cresc)}` : '') + '.'
    + (r.posicao === 1 ? ' O melhor mês do ano.' : '');
}

function fraseDestaque(ambito) {
  const d = destaqueDe(ambito);
  return d ? `O mais vendido do ano: ${titulo(d.titulo)}, com ${unidades(d.unidades)}.` : '';
}

function fraseMaisVendidos(ambito) {
  const seguintes = (ambito && ambito.ano ? ambito.ano : []).slice(1, 4).map((x) => titulo(x.titulo));
  return seguintes.length ? `${seguintes.length === 1 ? 'Segue-se' : 'Seguem-se'} ${lista(seguintes)}.` : '';
}

function fraseFecho(R, A, B, meta, quem) {
  const sujeito = quem === 'rede' ? 'Perspectiva da rede' : 'Perspectiva';
  if (R.projeccao == null) return `${sujeito}: ainda sem projecção para ${A}. Obrigado.`;
  return `${sujeito}: ${kzDito(R.projeccao)} para ${A}`
    + (R.cresc_proj != null && B != null ? `, ${pctDito(R.cresc_proj)} face a ${B}` : '') + '.'
    + (meta && R.metaPct != null ? ` ${Math.round(R.metaPct * 100)}% da meta atingido.` : (R.falta ? ` Faltam ${kzDito(R.falta)}.` : ''))
    + ' Obrigado.';
}

/** O texto de cada quadro do vídeo de todas as livrarias (`c` = buildConsolidado()). */
function fraseConjunto(cena, c, breve) {
  const R = c.total.R;
  const A = c.ano;
  const B = c.comp;
  const nome = (l) => lojaDe({ name: l.nome });
  const rede = c.destaques && c.destaques.rede ? c.destaques.rede : null;
  switch (cena.k) {
    case 'capa':
      return `Relatório conjunto de ${A}: todas as livrarias${B != null ? ', comparado com ' + B : ''}.`;
    case 'resumo': {
      if (!R.ultimo) return `Ainda não há vendas registadas em ${A}.`;
      const base = `Até ${R.ultimo.mes}, a rede vendeu ${kzDito(R.ytd2)}`;
      if (breve) return base + (R.cresc_ytd != null ? `, ${pctDito(R.cresc_ytd)}` : '') + '.';
      return base + (R.cresc_ytd != null ? `; nas lojas comparáveis, ${pctDito(R.cresc_ytd)} face a ${B}` : '') + '.'
        + (R.projeccao != null ? ` Projecção: ${kzDito(R.projeccao)}.` : '');
    }
    case 'lojas': {
      const ordem = c.lojas.filter((l) => l.temDados).sort((a, b) => (a.posicao || 99) - (b.posicao || 99));
      if (!ordem.length) return `Nenhuma livraria tem vendas registadas em ${A}.`;
      return `${nome(ordem[0])} lidera, com ${pctSimples(ordem[0].quota)} das vendas da rede.`
        + (ordem[1] && !breve ? ` Segue-se a ${nome(ordem[1])}.` : '');
    }
    case 'mensal':
      return frasesMensal(c.total.rows, R, B, breve);
    case 'loja': {
      const l = cena.l;
      const L = l.M.R;
      return `${nome(l)}: ${kzDito(L.ytd2)}`
        + (L.cresc_ytd != null ? `, ${pctDito(L.cresc_ytd)}${breve ? '' : ' face a ' + B}` : '')
        + ` — ${pctSimples(l.quota)} da rede.`
        + (!breve && l.atrasados ? ` Falta registar ${lista(l.atrasados)}.` : '');
    }
    case 'mesRede': {
      const r = cena.r;
      const m = c.meses && c.meses[r.i];
      if (r.v2 == null) return `${r.mes} ainda está por registar${r.est != null ? `; a estimativa é de ${kzDito(r.est)}` : ''}.`;
      return `${r.mes}: a rede vendeu ${kzDito(r.v2)}${r.cresc != null ? ', ' + pctDito(r.cresc) : ''}`
        + (m && m.registadas < m.de ? `; ${m.registadas} de ${m.de} lojas com o mês registado` : '') + '.';
    }
    case 'quadro':
      return R.ytd1 != null && B != null
        ? `Nas lojas comparáveis: ${kzDito(R.ytd2c)} em ${A}, contra ${kzDito(R.ytd1)} em ${B} — ${pctDito(R.cresc_ytd)}.`
        : `Vendas da rede em ${A}: ${kzDito(R.ytd2)}.`;
    case 'acum':
      return R.projeccao != null ? `No acumulado, ${kzDito(R.ytd2)}. Projecção da rede para ${A}: ${kzDito(R.projeccao)}.` : `No acumulado, ${kzDito(R.ytd2)}.`;
    case 'pendentes': {
      const n = (c.pendentes || []).length;
      return n ? `Faltam registar meses em ${n} ${n === 1 ? 'livraria' : 'livrarias'}: ${lista(c.pendentes.map((p) => lojaDe({ name: p.nome })))}.` : '';
    }
    case 'destaque':
      return fraseDestaque(rede);
    case 'maisVendidos':
      return fraseMaisVendidos(rede);
    case 'fecho':
      return fraseFecho(R, A, B, null, 'rede');
    default:
      return '';
  }
}

/**
 * Uma frase por quadro do `plano`. `tipo` = 'loja' (dados = exportData() do painel) ou 'conjunto'
 * (dados = buildConsolidado()). O vídeo lento leva as frases completas; o normal e o curto, as breves.
 */
export function guiaoDoVideo(tipo, dados, plano, ritmo = 'lento') {
  const breve = ritmo !== 'lento';
  return (plano || []).map((cena) => {
    try {
      return (tipo === 'conjunto' ? fraseConjunto(cena, dados, breve) : fraseLoja(cena, dados, breve)).replace(/\s+/g, ' ').trim();
    } catch (e) {
      return '';
    }
  });
}

// ---------- Tempo de leitura e legendas ----------

/** Quanto tempo do início de cada quadro fica para a transição antes da legenda, e no fim. */
export const LEGENDA_INICIO = 0.6;
export const LEGENDA_FIM = 0.5;
/** Caracteres por segundo de quem lê em voz alta (cerca de 2,5 palavras por segundo). */
export const CARACTERES_POR_SEGUNDO = 14;

/**
 * O plano com cada quadro do tamanho que a frase pede (nunca mais curto do que era). Para as
 * legendas e para quem narra não ter de correr.
 */
export function esticarPlano(plano, guiao, { cps = CARACTERES_POR_SEGUNDO } = {}) {
  return plano.map((cena, i) => {
    const txt = (guiao && guiao[i]) || '';
    if (!txt) return cena;
    const precisa = LEGENDA_INICIO + txt.length / cps + LEGENDA_FIM;
    return precisa > cena.dur ? { ...cena, dur: Math.round(precisa * 10) / 10 } : cena;
  });
}

/**
 * Parte a frase em pedaços de uma linha (até `max` caracteres), de preferência no fim de uma frase
 * ou depois de uma vírgula, de um travessão ou de dois pontos.
 */
export function partirLegendas(texto, max = 74) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (t.length <= max) return [t];
  const pedacos = [];
  let resto = t;
  while (resto.length > max) {
    const janela = resto.slice(0, max + 1);
    // O melhor corte: fim de frase; depois «;», «:», «—», «,»; por fim, um espaço.
    let corte = -1;
    for (const re of [/[.!?»](?=\s)/g, /[;:](?=\s)/g, /\s—(?=\s)/g, /,(?=\s)/g]) {
      let m;
      let ultimo = -1;
      while ((m = re.exec(janela))) if (m.index > max * 0.35) ultimo = m.index + m[0].length;
      if (ultimo > 0) { corte = ultimo; break; }
    }
    if (corte < 0) corte = janela.lastIndexOf(' ');
    if (corte <= 0) corte = max;
    pedacos.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) pedacos.push(resto);
  return pedacos;
}

/**
 * Os pedaços de legenda com o tempo do vídeo em que aparecem: cada frase ocupa o seu quadro (depois
 * da transição, até pouco antes do fim), e cada pedaço o tempo proporcional ao seu tamanho.
 * Devolve [{ i (quadro), ini, fim, texto }].
 */
export function tempoDasLegendas(plano, guiao, { max = 74 } = {}) {
  const out = [];
  let acc = 0;
  plano.forEach((cena, i) => {
    const pedacos = partirLegendas(guiao && guiao[i], max);
    const ini = acc + Math.min(LEGENDA_INICIO, cena.dur * 0.2);
    const fim = acc + cena.dur - Math.min(LEGENDA_FIM, cena.dur * 0.1);
    const total = pedacos.reduce((s, p) => s + p.length, 0) || 1;
    let t = ini;
    pedacos.forEach((p, j) => {
      const d = (fim - ini) * (p.length / total);
      // Só o primeiro pedaço do quadro entra a esbater e só o último sai: entre pedaços, troca o texto.
      out.push({ i, ini: Math.round(t * 100) / 100, fim: Math.round((t + d) * 100) / 100, texto: p, entra: j === 0, sai: j === pedacos.length - 1 });
      t += d;
    });
    acc += cena.dur;
  });
  return out;
}

/** O pedaço de legenda no segundo `sec` (com a opacidade da entrada e da saída), ou null. */
export function legendaNoTempo(legendas, sec, fade = 0.2) {
  for (const l of legendas || []) {
    if (sec >= l.ini && sec < l.fim) {
      let a = 1;
      if (l.entra) a = Math.min(a, (sec - l.ini) / fade);
      if (l.sai) a = Math.min(a, (l.fim - sec) / fade);
      return { ...l, alpha: Math.max(0, Math.min(1, a)) };
    }
  }
  return null;
}
