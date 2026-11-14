/**
 * Valores a confirmar nos relatórios de vendas. Puro: nada aqui toca no DOM nem no Supabase.
 *
 * O painel faz bem as contas, mas mostrava em destaque qualquer número que lá estivesse: o Huambo
 * aparecia com +278,8% face a 2025 (Setembro com +1 440,9%) sem nenhum aviso, quando ao lado o
 * Lubango tinha −6,5%. Pode ser verdade; também pode ser um ano anterior registado com outro âmbito,
 * ou um zero a mais. O sistema não sabe — mas sabe dizer «isto é invulgar, confirme».
 *
 * Dois sinais, por mês (o primeiro que disparar):
 *  · face ao mesmo mês do ano anterior: 4× ou mais (+300%), ou um quarto ou menos (−75%);
 *  · face aos outros meses do mesmo ano (mediana dos que têm vendas, se forem pelo menos 4): 4× acima
 *    ou um quarto abaixo.
 * Um mês a 0 é uma escolha de quem lança (loja fechada, ainda não abriu) e só conta na comparação
 * com o ano anterior, se esse mês teve vendas.
 */
import { MESES } from './modelo.js';

export const LIMITES = {
  /** Razão face ao ano anterior a partir da qual se avisa (4 = +300%). */
  subida: 4,
  /** Razão face ao ano anterior abaixo da qual se avisa (0,25 = −75%). */
  descida: 0.25,
  /** Quantas vezes acima (ou abaixo) da mediana dos outros meses. */
  mediana: 4,
  /** Meses com vendas precisos para a mediana valer alguma coisa. */
  minMeses: 4,
};

const num = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));

function mediana(vals) {
  const s = [...vals].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * `meses` = os 12 valores do ano; `anteriores` = os 12 do ano anterior (ou null); `soMeses` = os
 * índices (0–11) a verificar — os que se mudaram, ao gravar — ou null para todos.
 * Devolve [{ i, mes, tipo: 'subida' | 'descida' | 'acima' | 'abaixo', valor, ref, razao }], em que
 * `ref` é o valor do ano anterior ou a mediana, e `razao` = valor / ref.
 */
export function avisosDePlausibilidade(meses, anteriores = null, soMeses = null) {
  const v = Array.from({ length: 12 }, (_, i) => num(meses && meses[i]));
  const a = Array.from({ length: 12 }, (_, i) => num(anteriores && anteriores[i]));
  const avisos = [];
  for (let i = 0; i < 12; i++) {
    if (soMeses && !soMeses.includes(i)) continue;
    const x = v[i];
    if (x == null) continue;
    if (a[i] != null && a[i] > 0) {
      const razao = x / a[i];
      if (razao >= LIMITES.subida || razao <= LIMITES.descida) {
        avisos.push({ i, mes: MESES[i], tipo: razao >= LIMITES.subida ? 'subida' : 'descida', valor: x, ref: a[i], razao });
        continue;
      }
    }
    if (x <= 0) continue;
    const outros = v.filter((y, j) => j !== i && y != null && y > 0);
    if (outros.length < LIMITES.minMeses) continue;
    const med = mediana(outros);
    const razao = x / med;
    if (razao >= LIMITES.mediana || razao <= 1 / LIMITES.mediana) {
      avisos.push({ i, mes: MESES[i], tipo: razao >= 1 ? 'acima' : 'abaixo', valor: x, ref: med, razao });
    }
  }
  return avisos;
}

/** Uma frase curta para cada aviso («Set: +1 441% face a Set de 2025»), para o ecrã. */
export function textoDoAviso(av, anoAnterior) {
  const m = av.mes.slice(0, 3);
  if (av.tipo === 'subida' || av.tipo === 'descida') {
    const p = (av.razao - 1) * 100;
    const pct = (p >= 0 ? '+' : '−') + String(Math.round(Math.abs(p))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '%';
    return `${m}: ${pct} face a ${m}${anoAnterior != null ? ' de ' + anoAnterior : ' do ano anterior'}`;
  }
  return `${m}: ${av.razao.toFixed(1).replace('.', ',')}× a mediana dos outros meses`;
}

/**
 * A origem de uma gravação, pelas alterações que leva: `sistema` (vendas do sistema), `importacao`
 * (o PowerPoint da loja) ou `manual`; `misto` quando há mais do que uma. Sem alterações aos meses
 * (só o mês em curso, por exemplo), `manual`.
 */
export function origemDasAlteracoes({ sistema = 0, importacao = 0, manual = 0 } = {}) {
  const tipos = [['sistema', sistema], ['importacao', importacao], ['manual', manual]].filter(([, n]) => n > 0);
  if (!tipos.length) return 'manual';
  return tipos.length === 1 ? tipos[0][0] : 'misto';
}

/**
 * Os meses que uma substituição troca e que já tinham valor: [{ i, mes, de, para }]. É o que se
 * pede para confirmar antes de «Substituir os meses com vendas» — as vendas do sistema são só as do
 * site, e trocar por elas o total de uma loja (que inclui o balcão) baixa-o quase sempre.
 */
export function substituicoesComValor(mudou) {
  return (mudou || []).filter((m) => m.de != null && m.de !== m.para);
}
