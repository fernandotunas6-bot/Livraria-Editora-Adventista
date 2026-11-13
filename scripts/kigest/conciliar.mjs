// Conciliação entre o catálogo do site (public.stock_books) e o catálogo da loja (KiGest).
//
// Os dois catálogos nasceram da mesma lista de preços da Casa Publicadora Brasileira, mas
// seguiram caminhos diferentes: no site os produtos foram escritos com o título completo da
// editora («Sobreviventes», «O Sábado na Bíblia — Por que Deus Faz Questão…») e no KiGest
// com o título abreviado em maiúsculas e com as gralhas de quem o digitou ao balcão
// («SOBREVIVENTES», «O SÁBADO NA BIBLIA», «COMO SAIR SAIR DA DEPRESSAÕ»). Não há nenhuma
// chave comum: o código de barras só está preenchido num lado ou no outro e o book_code
// (LIV-0xx) é do site. Daí o emparelhamento por palavras.
//
// Compara-se o título JÁ CORRIGIDO do artigo (scripts/kigest/titulos.mjs), e não o nome cru.
// É o corrigido que vai para a loja, e é com ele que a comparação faz sentido: o «LENÇO DE
// DESBRAVADORE» do KiGest, que está lançado no singular, não se parecia com o «Lenço do Clube
// de Desbravadores» do site e entrava como produto novo — mas o nome com que entrava era
// «Lenço de Desbravadores», que é o mesmo produto. Doze produtos entravam repetidos assim.
//
// A regra é conservadora de propósito — o que se vai escrever é preço e stock, e um par errado
// põe o preço de um livro noutro. Só conta como par FIRME quando é um para um: o artigo do
// KiGest tem um único candidato no topo e esse produto do site não é reclamado por mais nenhum
// artigo. Tudo o resto fica para o dono decidir à mão. É o caso das bíblias: o site tem seis
// («capa dura castanha», «bordô com flores»…) e o KiGest tem vinte («RA», «NTLH», «SLIM»,
// «LETRA GIGANTE», «UMBUNDU»…) — ninguém consegue dizer de fora qual é qual.

import { CORRECCOES, titulo as corrigirTitulo } from './titulos.mjs';

const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'e', 'em', 'no', 'na', 'para', 'com', 'um', 'uma',
  'os', 'as', 'ao', 'que', 'se', 'por', 'the', 'livro', 'livros',
]);

export function palavras(titulo, emOrdem = false) {
  const limpo = String(titulo ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const lista = limpo.split(/[^a-z0-9]+/).filter((p) => p.length > 1 && !VAZIAS.has(p));
  return emOrdem ? lista : new Set(lista);
}

// O título do site traz o subtítulo depois de um travessão ou de um hífen solto; o do KiGest
// quase nunca o tem. Daí haver duas comparações, e valer a melhor: contra a parte antes do
// subtítulo, senão «Sobreviventes» nunca chegaria a «Sobreviventes — Histórias de quem…»; e
// contra o título inteiro, senão «Música Sua Influencia» não chegava ao «Música - Sua
// Influência na Vida do Cristão», cuja parte de antes é só «Música».
export const tituloBase = (t) => String(t ?? '').split(/\s[—–-]\s/)[0];

// Dois números: quanto os dois títulos se parecem (Jaccard) e quanto do título do KiGest cabe
// no do site (cobertura). A cobertura é o que salva os títulos abreviados — «MÚSICA NA IGREJA»
// está todo dentro de «Música na Igreja — Aspectos Teológicos, Críticos…».
export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  for (const p of a) if (b.has(p)) comuns += 1;
  return comuns / (a.size + b.size - comuns);
}

// Quanto os dois títulos se parecem. Vale a melhor de duas medidas: o Jaccard, que conta o que
// têm em comum contra tudo o que têm; e a cobertura, que conta só quanto do título do KiGest
// cabe no do site — é ela que salva os títulos abreviados do balcão.
//
// A cobertura sozinha engana: «Vida de Jesus» tem as suas duas palavras dentro de «Jesus
// Extremo — Paradoxos que dão vida» e dava nota cheia, quando são dois livros diferentes. Por
// isso, quando é a cobertura que manda, exige-se que os dois títulos COMECEM pela mesma
// palavra — «Música Sua Influencia» e «Música - Sua Influência na Vida do Cristão» começam;
// «Vida de Jesus» e «Jesus Extremo» não. É o que distingue um título abreviado de uma coincidência
// de palavras soltas.
export function semelhanca(a, b, primeiraA = '', primeiraB = '') {
  if (a.size === 0 || b.size === 0) return 0;
  let comuns = 0;
  for (const p of a) if (b.has(p)) comuns += 1;
  const j = jaccard(a, b);
  const cobertura = comuns / a.size;
  if (cobertura <= j) return j;
  if (!mesmaPrimeiraPalavra(primeiraA, primeiraB)) return j;
  return cobertura;
}

// A primeira palavra com peso de um título.
export const primeiraPalavra = (titulo) => palavras(titulo, true)[0] ?? '';

// Distância de edição, com tecto: quantas letras é preciso mexer para passar de uma palavra à
// outra. Pára assim que passa do tecto — não interessa saber se são 5 ou 12.
export function distancia(a, b, tecto = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tecto) return tecto + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const linha = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      linha[j] = Math.min(linha[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
      if (linha[j] < menor) menor = linha[j];
    }
    if (menor > tecto) return tecto + 1;
    anterior = linha;
  }
  return anterior[b.length];
}

// A mesma palavra, com a tolerância de quem a digitou ao balcão: «ETRE» por «Entre», «AMAHÃ»
// por «Amanhã». Uma letra até às seis, duas daí para cima — e nunca em palavras de três letras
// ou menos, onde uma letra já muda tudo.
export function mesmaPrimeiraPalavra(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  const curto = Math.min(a.length, b.length);
  if (curto <= 3) return false;
  return distancia(a, b, curto <= 6 ? 1 : 2) <= (curto <= 6 ? 1 : 2);
}

// Fasquia para um artigo poder ser par de um produto.
const MINIMO_PAR = 0.6;
// Abaixo desta nota um artigo não conta para nada.
const MINIMO_PRETENDENTE = 0.45;
// E um par só vale quando ganha com folga: se outro artigo da loja fica a menos disto do
// vencedor, ninguém decide por adivinhação.
//
// É o que salva três lenços. O site tem «Lenço do Clube de Desbravadores» e a loja tem o do
// membro («LENÇO DE DESBRAVADORE», 2 000 Kz, com a gralha no singular) e o do líder («LENÇO DE
// LÍDER (DESBRAVADORES)», 5 000 Kz). O do líder dá 0,67 e o do membro 0,50 — folga de 0,17, que
// não chega: o site estava a ficar com o lenço do membro ao preço do líder. Agora os dois vão
// para o relatório. Quando o par é mesmo o par, a folga é outra: dá 1,00 contra 0,50 de quem
// apenas tem palavras em comum.
const FOLGA = 0.25;

export function conciliar(artigosKigest, produtosSite) {
  const site = produtosSite.map((p) => ({
    produto: p,
    palavras: palavras(tituloBase(p.title)),
    palavrasInteiro: palavras(p.title),
    primeira: primeiraPalavra(p.title),
    ean: String(p.isbn ?? '').replace(/\D/g, ''),
    // Já ligado numa conciliação anterior.
    kigestRef: String(p.kigest_ref ?? '').trim(),
    cpb: String(p.cpb ?? '').trim(),
  }));
  const porRef = new Map(site.filter((s) => s.kigestRef).map((s) => [s.kigestRef, s]));
  // O id do produto na loja da editora. Em muitos artigos o KiGest usa-o como referência, e a
  // ronda das fotografias (scripts/catalogo/produtos.py) guardou-o para 44 produtos do site:
  // quando os dois batem, é o mesmo produto e não há nada a adivinhar.
  const porCpb = new Map(site.filter((s) => s.cpb).map((s) => [String(s.cpb), s]));
  const porEan = new Map();
  for (const s of site) if (s.ean.length === 13) (porEan.get(s.ean) ?? porEan.set(s.ean, []).get(s.ean)).push(s);

  const avaliados = artigosKigest.map((artigo) => {
    const nome = artigo.titulo ?? corrigirTitulo(artigo.descricao);
    // Decidido à mão que é outro produto, por muito que o nome se pareça: não se lhe procura par.
    if (artigo.eMesmoNovo) return { artigo, candidatos: [], pretendentes: [], via: 'decisao' };
    // 1. Já ligado pelo kigest_ref: é a chave boa e dispensa adivinhar.
    const ligado = porRef.get(artigo.ref);
    if (ligado) return { artigo, candidatos: [{ nota: 1, alvo: ligado }], pretendentes: [], via: 'ref' };
    // 2. Mesmo id na loja da editora.
    const pelaEditora = porCpb.get(artigo.ref);
    if (pelaEditora) return { artigo, candidatos: [{ nota: 1, alvo: pelaEditora }], pretendentes: [], via: 'cpb' };
    // 3. Mesmo código de barras de 13 dígitos nos dois lados.
    const porCodigo = artigo.ean ? porEan.get(artigo.ean) ?? [] : [];
    if (porCodigo.length > 0) {
      const candidatos = porCodigo.map((alvo) => ({ nota: 1, alvo }));
      return { artigo, candidatos, pretendentes: candidatos, via: 'codigo' };
    }
    // 4. Palavras do título. Do lado do KiGest conta o título INTEIRO: é a parte depois do
    // travessão que distingue um devocional do outro — «Meditações Diárias — Maravilhoso Deus»
    // ficava reduzido a «Meditações Diárias» e empatava com todos os devocionais da série.
    const pa = palavras(nome);
    const primeira = primeiraPalavra(nome);
    const pretendentes = site
      .map((alvo) => ({
        nota: Math.max(semelhanca(pa, alvo.palavras, primeira, alvo.primeira),
          semelhanca(pa, alvo.palavrasInteiro, primeira, alvo.primeira)),
        alvo,
      }))
      .filter((c) => c.nota >= MINIMO_PRETENDENTE)
      .sort((x, y) => y.nota - x.nota);
    const topo = pretendentes.length > 0 ? pretendentes[0].nota : 0;
    const candidatos = topo >= MINIMO_PAR ? pretendentes.filter((c) => c.nota === topo) : [];
    return { artigo, candidatos, pretendentes, via: 'titulo' };
  });

  // Quantos artigos do KiGest apontam para cada produto do site. Dois a apontar para o mesmo
  // produto significa que um deles está errado — ou que o site junta num produto aquilo que a
  // loja vende como dois (os lenços de líder e os normais, as bíblias).
  // Quem disputa cada produto do site, e com que nota.
  const disputas = new Map();
  avaliados.forEach((a, i) => {
    for (const c of [...a.candidatos, ...(a.pretendentes ?? [])]) {
      const lista = disputas.get(c.alvo.produto.id) ?? [];
      if (!lista.some((d) => d.quem === i)) lista.push({ quem: i, nota: c.nota });
      disputas.set(c.alvo.produto.id, lista);
    }
  });
  const ganhaComFolga = (indice, candidato) => (disputas.get(candidato.alvo.produto.id) ?? [])
    .every((d) => d.quem === indice || d.nota < candidato.nota - FOLGA);

  const firmes = [];
  const ambiguos = [];
  const semPar = [];
  avaliados.forEach((a, i) => {
    if (a.candidatos.length === 0) {
      // Entra como produto novo, mas se havia algum pretendente fica dito: pode ser o mesmo
      // produto com outro nome, e é no relatório que o dono o vê antes de publicar.
      semPar.push({ ...a.artigo, parecidos: (a.pretendentes ?? []).map((c) => c.alvo.produto.book_code) });
    } else if (a.candidatos.length === 1 && ganhaComFolga(i, a.candidatos[0])) {
      firmes.push({ artigo: a.artigo, produto: a.candidatos[0].alvo.produto, nota: a.candidatos[0].nota, via: a.via });
    } else {
      // No ambíguo mostram-se também os pretendentes: é a lista que o dono precisa de ver para
      // decidir, e o pretendente de fora da fasquia é muitas vezes o par certo.
      const alvos = [...new Map([...a.candidatos, ...(a.pretendentes ?? [])]
        .map((c) => [c.alvo.produto.id, c.alvo.produto])).values()];
      ambiguos.push({ artigo: a.artigo, nota: a.candidatos[0]?.nota ?? a.pretendentes[0].nota, via: a.via, alvos });
    }
  });
  const emparelhados = new Set(firmes.map((f) => f.produto.id));
  return {
    firmes,
    ambiguos,
    semPar,
    // Produtos do site que o KiGest não conhece: ou são só da loja online, ou estão no KiGest
    // com um nome que não se reconhece.
    soNoSite: produtosSite.filter((p) => !emparelhados.has(p.id)),
  };
}

const quase = (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.5;

// As diferenças de cada par firme, já separadas por aquilo que o dono tem de decidir.
export function diferencas(firmes) {
  return firmes.map((f) => ({
    ...f,
    stockIgual: quase(f.produto.stock, f.artigo.stock),
    precoIgual: quase(f.produto.price, f.artigo.preco),
    precoSite: Number(f.produto.price ?? 0),
    precoLoja: f.artigo.preco,
    stockSite: Number(f.produto.stock ?? 0),
    stockLoja: f.artigo.stock,
    // O site a dizer que tem e a loja a dizer que não: é o caso que custa dinheiro e confiança
    // — o cliente paga e depois não há livro.
    vendeSemTer: Number(f.produto.stock ?? 0) > 0 && f.artigo.stock <= 0,
    // Ao contrário: há livros na loja que o site dá por esgotados e ninguém compra.
    escondeOQueTem: Number(f.produto.stock ?? 0) <= 0 && f.artigo.stock > 0,
  }));
}

// Artigos repetidos dentro do próprio KiGest: o mesmo livro lançado duas vezes com nomes
// diferentes («DESCOBERTA» e «DESCOBERTA», «O CICLO DA INFELICIDADE» e «CIRCLO DA INFEICIDADE»).
// Dois sinais ao mesmo tempo, porque nenhum deles basta: títulos parecidos (há livros de nomes
// próximos que são obras diferentes) e o mesmo preço ao cêntimo (há muitos livros a 40 000 Kz).
const gralhas = (artigo) => artigo.descricao.split(/\s+/).filter((p) => CORRECCOES.has(p.toUpperCase())).length;
const nomeDe = (artigo) => artigo.titulo ?? corrigirTitulo(artigo.descricao);

export function duplicados(artigos) {
  const grupos = [];
  const usados = new Set();
  artigos.forEach((a, i) => {
    if (usados.has(i)) return;
    const pa = palavras(nomeDe(a));
    const grupo = [a];
    artigos.forEach((b, j) => {
      if (j <= i || usados.has(j)) return;
      if (Math.abs(a.preco - b.preco) >= 0.5) return;
      // Aqui conta a semelhança pura (Jaccard) e não a cobertura: «CERTIFICADO» cabe todo
      // dentro de «CERTIFICADO DO MINISTÉRIO PESSOAL» e são dois produtos diferentes.
      // E num título de uma palavra só meia semelhança não diz nada: tem de ser igual.
      const pb = palavras(nomeDe(b));
      const nota = jaccard(pa, pb);
      if (nota < 1 && (nota < 0.5 || pa.size < 2 || pb.size < 2)) return;
      grupo.push(b);
      usados.add(j);
    });
    if (grupo.length > 1) {
      usados.add(i);
      // Fica o que tem mais existência e, em caso de empate, o que está melhor escrito —
      // é o título dele que vai para a loja.
      grupo.sort((x, y) => y.stock - x.stock || gralhas(x) - gralhas(y) || y.descricao.length - x.descricao.length);
      grupos.push(grupo);
    }
  });
  return grupos;
}

// Stock que não pode estar certo. Não se apaga nada por causa disto — o produto entra oculto e
// o número vai no relatório para o dono confirmar na loja.
export const STOCK_IMPROVAVEL = 5000;
export const stockPorConfirmar = (artigo) => artigo.stock >= STOCK_IMPROVAVEL;
