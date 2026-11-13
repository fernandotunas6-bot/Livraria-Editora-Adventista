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
    return { ligacoes: [], repetidos: [], paraODono: [] };
  }
  const d = JSON.parse(bruto);
  return {
    exportacao: d.exportacao ?? '',
    ligacoes: d.ligacoes ?? [],
    repetidos: d.repetidos ?? [],
    paraODono: d.ficam_para_o_dono ?? [],
  };
}

// Aplica as decisões ao catálogo e à lista de artigos, antes de conciliar.
//
// Uma ligação escreve o kigest_ref no produto do site: a partir daí o emparelhamento pega nele
// pela chave e não tem nada a adivinhar. Um repetido sai da lista de artigos — é o mesmo
// produto lançado duas vezes no KiGest e quem fica é o outro.
//
// Tudo é verificado contra os dados: uma decisão que aponte para um código que não existe, ou
// para um artigo que já não vem na exportação, é um erro e é dito em voz alta. Mais vale parar
// do que escrever preço no produto errado.
export function aplicarDecisoes({ decisoes, produtosSite, artigosKigest, aviso = console.error }) {
  const porCodigo = new Map(produtosSite.filter((p) => p.book_code).map((p) => [p.book_code, p]));
  const porRef = new Map(artigosKigest.map((a) => [a.ref, a]));
  const problemas = [];
  const aplicadas = [];

  for (const l of decisoes.ligacoes) {
    const produto = porCodigo.get(l.book_code);
    const artigo = porRef.get(l.kigest_ref);
    if (!produto) { problemas.push(`ligação ${l.kigest_ref} → ${l.book_code}: não há produto com esse código`); continue; }
    if (!artigo) { problemas.push(`ligação ${l.kigest_ref} → ${l.book_code}: a exportação não traz esse artigo`); continue; }
    if (produto.kigest_ref && produto.kigest_ref !== l.kigest_ref) {
      problemas.push(`ligação ${l.kigest_ref} → ${l.book_code}: o produto já está ligado a ${produto.kigest_ref}`);
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

  for (const p of problemas) aviso(`decisões: ${p}`);
  return {
    artigos: artigosKigest.filter((a) => !aRetirar.has(a.ref)),
    ligacoes: aplicadas,
    retirados: [...aRetirar],
    problemas,
  };
}
