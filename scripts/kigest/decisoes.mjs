// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// As decisões tomadas à mão sobre o que o emparelhamento automático não resolve.
//
// O automático é conservador de propósito: só aceita um par quando ganha com folga, e deixa
// para o relatório tudo o que seja dúvida. Muita dessa dúvida resolve-se olhando — «ELLEN
// WHITE» a 48 925 Kz é o «Ellen White - Mulher de Visão», que está no site ao mesmo preço, ao
// cêntimo; «OS EMBAIXADORES» a 18 135 Kz é o livro e não o lenço do clube. Essas decisões
// ficam escritas no docs/catalogo/kigest-decisoes.json, cada uma com a prova que a sustenta, e
// entram na conciliação por aqui.
//
// O que fica de fora fica de fora de propósito: as bíblias (o site descreve-as pela capa e a
// loja pela tradução) e os hinários (três capas no site, um artigo na loja). Essas ninguém as
// decide de fora.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FICHEIRO = 'docs/catalogo/kigest-decisoes.json';

export function lerDecisoes({ raiz = RAIZ, ficheiro = FICHEIRO } = {}) {
  let bruto;
  try {
    bruto = readFileSync(path.join(raiz, ficheiro), 'utf8');
  } catch {
    return { ligacoes: [], repetidos: [], novosMesmo: [], paraODono: [] };
  }
  const d = JSON.parse(bruto);
  return {
    exportacao: d.exportacao ?? '',
    ligacoes: d.ligacoes ?? [],
    repetidos: d.repetidos ?? [],
    novosMesmo: d.sao_mesmo_novos ?? [],
    paraODono: d.ficam_para_o_dono ?? [],
  };
}

// Aplica as decisões ao catálogo e à lista de artigos, antes de conciliar.
//
// Três coisas se podem decidir, e cada uma entra de sua maneira:
//
//  - **ligação**: escreve o kigest_ref no produto do site, e a partir daí o emparelhamento pega
//    nele pela chave. O produto nomeia-se pelo código (`book_code`) ou, quando está oculto e
//    não se sabe o código que o gatilho lhe deu em produção, pelo `titulo` exacto.
//  - **repetido**: sai da lista de artigos — é o mesmo produto lançado duas vezes no KiGest e
//    quem fica é o outro.
//  - **é mesmo novo**: o artigo parece-se com um produto do site mas é outro produto — o lenço
//    de líder ao lado do lenço do membro, a «Esperança para a Família» infantil ao lado da
//    normal. Entra como produto novo em vez de ficar à espera de alguém que decida.
//
// Tudo é verificado contra os dados: uma decisão que aponte para um código que não existe, ou
// para um artigo que já não vem na exportação, é um erro e é dito em voz alta. Mais vale parar
// do que escrever preço no produto errado.
export function aplicarDecisoes({ decisoes, produtosSite, artigosKigest, aviso = console.error }) {
  const porCodigo = new Map(produtosSite.filter((p) => p.book_code).map((p) => [p.book_code, p]));
  const chave = (t) => String(t ?? '').trim().toLowerCase();
  const porTitulo = new Map(produtosSite.map((p) => [chave(p.title), p]));
  const porRef = new Map(artigosKigest.map((a) => [a.ref, a]));
  const problemas = [];
  const aplicadas = [];

  for (const l of decisoes.ligacoes) {
    const alvo = l.book_code || l.titulo || '';
    const produto = l.book_code ? porCodigo.get(l.book_code) : porTitulo.get(chave(l.titulo));
    const artigo = porRef.get(l.kigest_ref);
    if (!l.book_code && !l.titulo) { problemas.push(`ligação ${l.kigest_ref}: falta o book_code ou o titulo do produto`); continue; }
    if (!produto) { problemas.push(`ligação ${l.kigest_ref} → ${alvo}: não há produto nenhum assim`); continue; }
    if (!artigo) { problemas.push(`ligação ${l.kigest_ref} → ${alvo}: a exportação não traz esse artigo`); continue; }
    if (produto.kigest_ref && produto.kigest_ref !== l.kigest_ref) {
      problemas.push(`ligação ${l.kigest_ref} → ${alvo}: o produto já está ligado a ${produto.kigest_ref}`);
      continue;
    }
    produto.kigest_ref = l.kigest_ref;
    aplicadas.push(l);
  }

  const aRetirar = new Set();
  for (const rep of decisoes.repetidos) {
    if (!porRef.has(rep.kigest_ref)) { problemas.push(`repetido ${rep.kigest_ref}: a exportação não traz esse artigo`); continue; }
    if (rep.igual_a && !porRef.has(rep.igual_a)) {
      problemas.push(`repetido ${rep.kigest_ref}: o artigo ${rep.igual_a} de que é repetição não vem na exportação`);
      continue;
    }
    // O que fica tem de ser outro: um artigo não é repetição de si mesmo.
    if (rep.igual_a === rep.kigest_ref) { problemas.push(`repetido ${rep.kigest_ref}: aponta para si mesmo`); continue; }
    aRetirar.add(rep.kigest_ref);
  }

  const mesmoNovos = new Set();
  for (const n of decisoes.novosMesmo ?? []) {
    if (!porRef.has(n.kigest_ref)) { problemas.push(`«é mesmo novo» ${n.kigest_ref}: a exportação não traz esse artigo`); continue; }
    if (aRetirar.has(n.kigest_ref)) { problemas.push(`«é mesmo novo» ${n.kigest_ref}: já está marcado como repetido`); continue; }
    mesmoNovos.add(n.kigest_ref);
  }

  for (const p of problemas) aviso(`decisões: ${p}`);
  return {
    // Os marcados como «é mesmo novo» levam a marca com eles; o emparelhamento não lhes procura
    // par nenhum.
    artigos: artigosKigest
      .filter((a) => !aRetirar.has(a.ref))
      .map((a) => (mesmoNovos.has(a.ref) ? { ...a, eMesmoNovo: true } : a)),
    ligacoes: aplicadas,
    retirados: [...aRetirar],
    novosMesmo: [...mesmoNovos],
    problemas,
  };
}
