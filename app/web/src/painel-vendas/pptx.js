// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Ler o PowerPoint «Painel de Vendas» que as lojas mandam (modelo da Loja do Huambo).
//
// O ficheiro .pptx é um ZIP de XML. Abre-se aqui sem bibliotecas: o índice do ZIP lê-se à mão e
// cada ficheiro descomprime-se com DecompressionStream('deflate-raw'), que existe nos browsers e
// no Node 18+. Puro: não toca no DOM nem na base de dados.
//
// O que se lê:
//   - o diapositivo «QUADRO GERAL»: a tabela Mês | <ano> | <ano> | Crescimento, com o TOTAL;
//   - os diapositivos «PERÍODO EM APRESENTAÇÃO ATÉ <MÊS>»: os dois primeiros valores são a venda
//     do mês em cada ano. Servem para conferir a tabela e para preencher um mês que a tabela ainda
//     não tenha (o diapositivo de Novembro pode chegar antes de o quadro geral ser actualizado);
//   - o nome da loja, do diapositivo de abertura («LOJA DO HUAMBO»).
//
// Resultado: { loja, anos: { 2025: [12], 2026: [12] }, totais: { 2025, 2026 }, avisos: [...] }.
// Um mês sem valor fica null (não 0): para o painel, vazio é «ainda sem valor».

import { MESES } from './modelo.js';

const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const MESES_SEM = MESES.map(sem);

/** O número de um texto como «2 171 368 Kz», «813 662,6 Kz» ou «2.171.368,50». null se não houver. */
export function lerKz(texto) {
  let s = String(texto ?? '').replace(/[\s  ]/g, '').replace(/kz|aoa/gi, '').replace(/^\+/, '');
  if (!s || !/\d/.test(s)) return null;
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const v = s.lastIndexOf(',');
  const p = s.lastIndexOf('.');
  if (v >= 0 && p >= 0) {
    // O último separador é o decimal.
    s = v > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (v >= 0) {
    // Só vírgulas: decimal se tiver 1–2 casas no fim, senão milhares.
    s = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (p >= 0) {
    s = /\.\d{1,2}$/.test(s) && (s.match(/\./g) || []).length === 1 ? s : s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- ZIP ----------

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflar(dados) {
  if (typeof DecompressionStream !== 'function') throw new Error('Este browser não consegue abrir ficheiros .pptx (falta DecompressionStream).');
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([dados]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Os ficheiros de um ZIP: Map nome → () => Promise<Uint8Array>. */
export function lerZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // O fim do índice central (EOCD) está nos últimos 64 KB.
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('O ficheiro não é um .pptx válido.');
  const n = u16(b, eocd + 10);
  let o = u32(b, eocd + 16);
  const dec = new TextDecoder();
  const files = new Map();
  for (let k = 0; k < n; k++) {
    if (u32(b, o) !== 0x02014b50) throw new Error('O índice do .pptx está danificado.');
    const metodo = u16(b, o + 10);
    const tam = u32(b, o + 20);
    const ln = u16(b, o + 28);
    const le = u16(b, o + 30);
    const lc = u16(b, o + 32);
    const local = u32(b, o + 42);
    const nome = dec.decode(b.subarray(o + 46, o + 46 + ln));
    o += 46 + ln + le + lc;
    files.set(nome, async () => {
      const ini = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const dados = b.subarray(ini, ini + tam);
      if (metodo === 0) return dados;
      if (metodo === 8) return inflar(dados);
      throw new Error('O .pptx usa uma compressão que não se consegue ler.');
    });
  }
  return files;
}

// ---------- XML dos diapositivos ----------

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desentidade = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENT[e] ?? m;
});
const textos = (xml) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => desentidade(m[1]));

/** As tabelas de um diapositivo, como listas de linhas de células de texto. */
export function tabelasDoXml(xml) {
  return [...xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)].map((t) => [...t[1].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)]
    .map((tr) => [...tr[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((tc) => textos(tc[0]).join('').replace(/ /g, ' ').trim())));
}

/** Os parágrafos de texto de um diapositivo (cada <a:p> numa linha), fora das tabelas. */
export function paragrafosDoXml(xml) {
  const semTabelas = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, '');
  return [...semTabelas.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => textos(p[1]).join('').replace(/ /g, ' ').trim()).filter(Boolean);
}

const mesDe = (s) => MESES_SEM.indexOf(sem(s));

/** A tabela do quadro geral → { anos: {ano: [12]}, totais: {ano} }, ou null se não for uma. */
export function lerQuadroGeral(linhas) {
  const cab = linhas.find((l) => l.some((c) => /^\d{4}$/.test(c.trim())));
  if (!cab) return null;
  const cols = cab.map((c, i) => [Number(c.trim()), i]).filter(([a]) => a >= 2000 && a <= 2100);
  if (!cols.length) return null;
  const anos = {};
  const totais = {};
  cols.forEach(([a]) => { anos[a] = Array(12).fill(null); });
  let achou = 0;
  for (const l of linhas) {
    const i = mesDe(l[0]);
    if (i >= 0) {
      achou++;
      cols.forEach(([a, c]) => { anos[a][i] = lerKz(l[c]); });
    } else if (sem(l[0]) === 'total') {
      cols.forEach(([a, c]) => { totais[a] = lerKz(l[c]); });
    }
  }
  return achou >= 6 ? { anos, totais } : null;
}

/** Um diapositivo mensal → { mes, valores: [ano1, ano2] }, ou null. */
export function lerDiapositivoMensal(pars) {
  const k = pars.findIndex((p) => /periodo em apresentacao/.test(sem(p)));
  if (k < 0) return null;
  // O mês vem no parágrafo a seguir (ou no mesmo, depois de «ATÉ»).
  const resto = sem(pars[k]).replace(/.*periodo em apresentacao( ate)?/, '').trim();
  const mes = mesDe(resto) >= 0 ? mesDe(resto) : mesDe(pars[k + 1] || '');
  if (mes < 0) return null;
  // Depois de «VENDA MENSAL» e da escala do eixo (0M, 1M…), os dois primeiros valores em Kz.
  const j = pars.findIndex((p) => /venda mensal/.test(sem(p)));
  const valores = [];
  for (let i = (j < 0 ? k : j) + 1; i < pars.length && valores.length < 2; i++) {
    const p = pars[i];
    if (/^\d+\s*m$/i.test(p.trim())) continue; // a escala do gráfico
    const v = lerKz(p);
    if (v != null && /\d{3}/.test(p.replace(/\D/g, ''))) valores.push(v);
  }
  return valores.length === 2 ? { mes, valores } : null;
}

/** O nome da loja: «LOJA DO HUAMBO» → «Huambo». */
export function lerLoja(pars) {
  for (const p of pars) {
    const m = /\bloja\s+d[eoa]s?\s+([^·—–\-,]+)/i.exec(p);
    if (m) {
      const nome = m[1].trim().replace(/\s+/g, ' ');
      return nome.toLowerCase().replace(/(^|\s)\p{L}/gu, (x) => x.toUpperCase());
    }
  }
  return null;
}

const kzTxt = (v) => (v == null ? '—' : new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(v) + ' Kz');

/**
 * Lê um .pptx (ArrayBuffer ou Uint8Array) do modelo «Painel de Vendas».
 * Lança um erro em português quando o ficheiro não tem um quadro de vendas reconhecível.
 */
export async function lerPainelPptx(buf) {
  const zip = lerZip(buf);
  const slides = [...zip.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!slides.length) throw new Error('O ficheiro não tem diapositivos.');
  const dec = new TextDecoder();
  let quadro = null;
  const mensais = [];
  let loja = null;
  for (const n of slides) {
    const xml = dec.decode(await zip.get(n)());
    const pars = paragrafosDoXml(xml);
    if (!loja) loja = lerLoja(pars);
    if (!quadro) {
      for (const t of tabelasDoXml(xml)) { quadro = lerQuadroGeral(t); if (quadro) break; }
    }
    const m = lerDiapositivoMensal(pars);
    if (m) mensais.push(m);
  }
  return montar({ quadro, mensais, loja });
}

/** Junta o quadro geral e os diapositivos mensais (separado para se testar sem ficheiro). */
export function montar({ quadro, mensais = [], loja = null }) {
  const avisos = [];
  let anos;
  let totais = {};
  if (quadro) {
    ({ anos, totais } = quadro);
  } else if (mensais.length) {
    anos = null;
    avisos.push('O ficheiro não tem o «Quadro geral»: os valores vêm dos diapositivos de cada mês.');
  } else {
    throw new Error('Não encontrei o quadro de vendas neste ficheiro. É o «Painel de Vendas» da loja?');
  }
  // Os anos do quadro, ou os dois anos mais prováveis quando só há diapositivos mensais.
  const lista = anos ? Object.keys(anos).map(Number).sort((a, b) => a - b) : null;
  if (!anos) {
    const fim = new Date().getFullYear();
    anos = { [fim - 1]: Array(12).fill(null), [fim]: Array(12).fill(null) };
  }
  const [a1, a2] = lista && lista.length >= 2 ? lista.slice(-2) : Object.keys(anos).map(Number).sort((a, b) => a - b);
  for (const { mes, valores } of mensais) {
    [a1, a2].forEach((a, k) => {
      if (a == null || !anos[a]) return;
      const t = anos[a][mes];
      const s = valores[k];
      if (t == null) {
        anos[a][mes] = s;
        if (quadro) avisos.push(`${MESES[mes]} de ${a}: o quadro geral está em branco; usei o valor do diapositivo do mês (${kzTxt(s)}).`);
      } else if (Math.round(t) !== Math.round(s)) {
        avisos.push(`${MESES[mes]} de ${a}: o quadro geral diz ${kzTxt(t)} e o diapositivo do mês diz ${kzTxt(s)}. Usei o do quadro geral; confirme com a loja.`);
      }
    });
  }
  // O TOTAL do quadro tem de bater com a soma dos meses.
  Object.entries(totais).forEach(([a, t]) => {
    if (t == null) return;
    const soma = anos[a].reduce((s, v) => s + Math.round((v || 0) * 100), 0) / 100;
    if (Math.round(soma) !== Math.round(t)) avisos.push(`${a}: a soma dos meses (${kzTxt(soma)}) não bate com o TOTAL do quadro (${kzTxt(t)}).`);
  });
  const ultimo = {};
  Object.entries(anos).forEach(([a, m]) => { let u = -1; m.forEach((v, i) => { if (v != null) u = i; }); ultimo[a] = u; });
  return { loja, anos, totais, ultimo, avisos };
}

/**
 * Aplica os meses lidos aos actuais, com as regras da migração de Outubro:
 * - um mês em branco no PowerPoint não apaga o que já está no painel;
 * - um valor que, arredondado ao kwanza, já é o do PowerPoint, fica (o PowerPoint arredonda e
 *   reescrevê-lo perdia os cêntimos).
 * Devolve { meses, mudou: [{ i, de, para }] }.
 */
export function aplicarPptx(actuais, doPptx) {
  const meses = Array.from({ length: 12 }, (_, i) => (actuais?.[i] == null ? null : Number(actuais[i])));
  const mudou = [];
  for (let i = 0; i < 12; i++) {
    const p = doPptx?.[i];
    if (p == null) continue;
    const a = meses[i];
    if (a != null && Math.round(a) === Math.round(p)) continue;
    mudou.push({ i, de: a, para: p });
    meses[i] = p;
  }
  return { meses, mudou };
}

/** Encontra a loja do PowerPoint entre as do painel, pelo nome ou pela província, sem acentos. */
export function lojaDoPptx(nome, lojas) {
  if (!nome) return null;
  const n = sem(nome);
  const porNome = lojas.filter((l) => sem(l.name).includes(n));
  if (porNome.length) return porNome.sort((a, b) => sem(a.name).indexOf(n) - sem(b.name).indexOf(n))[0];
  return lojas.find((l) => sem(l.province) === n) || null;
}
