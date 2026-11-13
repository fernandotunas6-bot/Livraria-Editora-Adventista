// Os títulos do KiGest foram escritos ao balcão, em maiúsculas e com as gralhas de quem
// digitou («COMO CONHECER A VONTE DE DEUS», «O DESEJADO DE TODAS AS NOÇOES», «BIBLIA SGARADA»).
// Na loja online não podem aparecer assim. Aqui passam a maiúsculas e minúsculas pelas regras
// do português e as gralhas conhecidas são corrigidas por uma tabela — palavra por palavra,
// nunca por adivinhação: o que não está na tabela fica como veio, só com a caixa arrumada, e o
// produto entra oculto para o dono conferir o nome antes de o publicar.

// Minúsculas no meio do título (nunca na primeira palavra).
const MINUSCULAS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos', 'e', 'em',
  'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'sem', 'sob', 'sobre', 'ao', 'aos', 'à', 'às',
  'que', 'se', 'ou', 'pelo', 'pela', 'entre', 'até', 'como',
]);

// Palavras que ficam em maiúsculas (siglas e marcas).
const SIGLAS = new Set(['JA', 'LJS', 'RA', 'RC', 'ARC', 'ARA', 'NTLH', 'NAA', 'VL', 'A4', 'NEPP']);

// Gralhas e abreviaturas do KiGest, só as que se conseguem confirmar pelo título que a editora
// usa. As dúvidas ficam de fora de propósito (BIBLIA DISCIPLOS, TORSAL, REGRAS PARA QUE…):
// aparecem no relatório para o dono as corrigir no painel.
export const CORRECCOES = new Map(Object.entries({
  ADMINITRAÇAÕ: 'Administração', ADMINITRAR: 'Administrar', ANCIÃOS: 'Anciãos', ANCIÃS: 'Anciãs',
  BIBIA: 'Bíblia', BIBLIA: 'Bíblia', BÍBLIA: 'Bíblia', SGARADA: 'Sagrada', SMEANDO: 'Semeando',
  BRAZIL: 'Brasil', CANTA: 'Santa', CARATER: 'Carácter', CIENCIA: 'Ciência', CIRCLO: 'Ciclo',
  COLPORTOR: 'Colportor', CONCELHO: 'Conselhos', CONSEHOS: 'Conselhos', COSELHOS: 'Conselhos',
  COVERTIDO: 'Convertido', CRENÇA: 'Crenças', CRISTAÕ: 'Cristão', CRISTÃ: 'Cristã',
  DIACONIZAS: 'Diaconisas', DIACONOS: 'Diáconos', ECADERNADO: 'Encadernado',
  ECRITOS: 'Escritos', EDIFICADODORES: 'Edificadores', EDUCAÇAÕ: 'Educação', ELNÇO: 'Lenço',
  ENVAGELICOS: 'Evangélicos', ENVALISTA: 'Evangelista', ESPERANÇÃO: 'Esperança',
  ESPERENÇA: 'Esperança', EXITENCIAL: 'Existencial', EXTENÇAÕ: 'Extinção', FACTURA: 'Factura',
  GRNDE: 'Grande', HISTÓRI: 'História', INFEICIDADE: 'Infelicidade', ITERPRETAÇAÕ: 'Interpretação',
  INTERPRETAÇAÕ: 'Interpretação', JESU: 'Jesus', MAE: 'Mãe', MENBRO: 'Membro',
  MESSAGEM: 'Mensagem', MISSIONRIA: 'Missionária', MISSIORIO: 'Missionário', MORTTE: 'Morte',
  NÉM: 'Nem', NOÇOES: 'Nações', ODNA: 'Onda', ORIETAÇAÕ: 'Orientação', ORIGES: 'Origens',
  PARAQ: 'para', PATRIACAS: 'Patriarcas', PECADO: 'Pecado', PERSSONALIDADE: 'Personalidade',
  PRENDORES: 'Prendedores', PRESSONALIDADE: 'Personalidade', PROFESSORE: 'Professores',
  QUETOES: 'Questões', REAVIMENTO: 'Reavivamento', RIQUESA: 'Riqueza', SALVAÇAÕ: 'Salvação',
  SINAS: 'Sinais', SOBRE_VIVENCIA: 'Sobrevivência', SUPREEDENTES: 'Surpreendentes',
  SURPREEDENTES: 'Surpreendentes', TESTMUNHOS: 'Testemunhos', TEXTE: 'Testes', VERDAEIRO: 'Verdadeiro',
  VIAJEM: 'Viagem', VONTE: 'Vontade', 'T-CHERT': 'T-shirt', 'T-SHIRT': 'T-shirt',
  ARQUIOLOGICA: 'Arqueológica', ANDWRES: 'Andrews', ANDREWSS: 'Andrews', CORDERINNHO: 'Cordeirinho',
  CORDERINHO: 'Cordeirinho', ABELINHAS: 'Abelhinhas', INTERNETE: 'Internet',
  PROIBIDOS: 'Proibido', APOSETADORIA: 'Aposentadoria', VEU: 'Véu', CORAÇA: 'Coração',
  DESBRAVADORE: 'Desbravadores', SABADO: 'Sábado', MIDIA: 'Mídia', ACTA: 'Actas',
  QUITE: 'Kit', COMENTARIOS: 'Comentários', COMENTARIO: 'Comentário', DIARIAS: 'Diárias',
  MEDITAÇAÕ: 'Meditação', SAUDAVEL: 'Saudável', LAÇO: 'Lenço',
  VOCE: 'Você', NAO: 'Não', SO: 'Só', PROPOSITO: 'Propósito', PROPOSITOS: 'Propósitos', AREA: 'Área', PROPRIO: 'Próprio', JUIZO: 'Juízo', PRINCIPIO: 'Princípio', PRINCIPIOS: 'Princípios',
  BIBLICO: 'Bíblico', BIBLICOS: 'Bíblicos', TEOLOGICO: 'Teológico', LAGRIMAS: 'Lágrimas',
  CEU: 'Céu', FAMILIA: 'Família', SAUDE: 'Saúde', PRATICO: 'Prático', HISTORIA: 'História',
  HISTORIAS: 'Histórias', SERIE: 'Série', POLITICA: 'Política', ULTIMO: 'Último',
  SILENCIO: 'Silêncio', BENÇÃOS: 'Bênçãos', DIZIMO: 'Dízimo', MINISTERIO: 'Ministério',
  INIGUALAVEL: 'Inigualável', BILINGUAL: 'Bilingue', SECRETARIA: 'Secretaria',
  DECLARAÇÕES: 'Declarações', ESSENCIAL: 'Essencial', PEDACINHO: 'Pedacinho',
  CARTOES: 'Cartões', EDIÇAÕ: 'Edição', VERM: 'Vermelha', PREGAÇAÕ: 'Pregação',
  ORAÇAÕ: 'Oração', MISSAÕ: 'Missão', SAÕ: 'São', OBJEÇOES: 'Objecções', CAIRAÕ: 'Cairão',
  TAÕ: 'Tão', JOAÕ: 'João', CAMPEOES: 'Campeões', PAIXAÕ: 'Paixão', SOBREVIVENCIA: 'Sobrevivência',
  ESTAREI: 'Estarei', REGISTRO: 'Registo', FUNDAMENTOS: 'Fundamentos', TRIMESSÁRIOS: 'Trimestrais',
}).map(([k, v]) => [k.replace(/_/g, ' '), v]));

// Trocas de expressão, antes de separar as palavras: marcas e volumes, que palavra a palavra
// davam «uma Voz 27» e «VL1».
const EXPRESSOES = [
  [/\bUMA\s*VOZ\s*27\b/gi, 'UmaVoz27'],
  [/\bVL\s*M?\s*(\d+)\b/gi, 'Vol. $1'],
  [/\bVOL\.?\s*(\d+)\b/gi, 'Vol. $1'],
  [/\bSANTA\s+CEIA\b/gi, 'Santa Ceia'],
  // A vírgula ficou no lugar errado na ficha da loja.
  [/PAIS\s+PROFESSORE,?\s+E\s+ESTUDANTES/gi, 'Pais, Professores e Estudantes'],
  [/\bESCOLA\s+SABATINA\b/gi, 'Escola Sabatina'],
];

const semAcento = (p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '');

function palavra(p, primeira) {
  // «(DESBRAVADORES)» e «\"ALGO\"»: a pontuação da frente fica e a palavra conta como primeira.
  const abre = p.match(/^[([«"']+/)?.[0] ?? '';
  if (abre) return abre + palavra(p.slice(abre.length), true);
  // Pontuação no fim: sai, a palavra é tratada e volta a entrar — «MISSÃO,» tem de continuar
  // a ser «Missão,».
  const fecha = p.match(/[)\]»"'.,;:!?]+$/)?.[0] ?? '';
  if (fecha) return palavra(p.slice(0, -fecha.length), primeira) + fecha;
  const cru = p;
  const corrigida = CORRECCOES.get(cru.toUpperCase());
  if (corrigida) return primeira ? corrigida.charAt(0).toUpperCase() + corrigida.slice(1) : corrigida;
  const alto = cru.toUpperCase();
  if (SIGLAS.has(semAcento(alto))) return alto;
  // Números, códigos e medidas ficam como estão (101, 1888, 250, A4, VL1).
  if (/\d/.test(cru)) return alto.length <= 4 ? alto : cru;
  const baixo = cru.toLowerCase();
  if (!primeira && MINUSCULAS.has(semAcento(baixo))) return baixo;
  return baixo.charAt(0).toUpperCase() + baixo.slice(1);
}

export function titulo(bruto) {
  let limpo = String(bruto ?? '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  if (limpo === '') return '';
  for (const [re, por] of EXPRESSOES) limpo = limpo.replace(re, por);
  // «Vol. 1» e «UmaVoz27» já vêm com a caixa certa das EXPRESSOES: protege-os.
  const guardados = [];
  limpo = limpo.replace(/UmaVoz27|Vol\. \d+|Santa Ceia|Escola Sabatina|Pais, Professores e Estudantes/g, (m) => {
    guardados.push(m);
    return `\u0000${guardados.length - 1}\u0000`;
  });
  // O KiGest separa o subtítulo por « - »; no site o travessão é «—».
  const partes = limpo.split(/\s+-\s+/).map((parte) => {
    const ps = parte.split(' ').filter(Boolean);
    return ps.map((p, i) => palavra(p, i === 0)).join(' ');
  });
  return partes.join(' — ').replace(/\u0000(\d+)\u0000/g, (_, i) => guardados[Number(i)]);
}

// Tipo de produto, pelas palavras do nome: a subfamília do KiGest não serve (tem a «BIBLIA
// DISCIPLOS» em UNIFORME e o «101 SEGREDOS» em CARTÃO).
const REGRAS = [
  [/santa ceia|vinho|suco de uva|bandeja/i, 'papelaria'],
  [/\bhinari|\bhinário/i, 'musica'],
  [/\bb[ií]blias?\b|\bb[ií]bia\b|novo testamento/i, 'biblia'],
  [/len[çc]o|emblema|distintivo|apito|cord[ãa]o|prendedor|torsal|insignia|ins[íi]gnia/i, 'desbravadores'],
  [/t-?shirt|t-?chert|camis|blusa|gravata|farda/i, 'vestuario'],
  [/revista|trimes/i, 'revista'],
  [/cart[ãa]o|cart[õo]es|certificado|envelope|folheto|brochura|bloco|factura|cat[áa]logo|livro de (acta|registro|registo)/i, 'papelaria'],
];
export function tipoDeProduto(nome) {
  for (const [re, tipo] of REGRAS) if (re.test(nome)) return tipo;
  return 'livro';
}

// Prateleira (genre) — as mesmas que o catálogo já usa.
const PRATELEIRAS = [
  [/santa ceia|vinho|suco de uva|bandeja/i, 'Santa Ceia'],
  [/hinari|hinário/i, 'Hinários'],
  [/\bb[ií]blias?\b|\bb[ií]bia\b|novo testamento/i, 'Bíblias'],
  [/len[çc]o|emblema|apito|cord[ãa]o|prendedor|desbravador|aventureir|embaixador|\bja\b|cordeirinho|abelhinha|luminares|edificadores/i, 'Desbravadores'],
  [/t-?shirt|t-?chert|camis|blusa/i, 'Vestuário'],
  [/cart[ãa]o|cart[õo]es|certificado|envelope|folheto|brochura|bloco|factura|cat[áa]logo|livro de (acta|registro|registo)/i, 'Material de Igreja'],
  [/sa[úu]de|aliment|receita|peso|suco|vegetarian|temperan|medicina|corpo|emo[çc]/i, 'Saúde & Estilo de Vida'],
  [/apocalipse|profec|profeta|daniel|eventos finais|grande conflito|ju[íi]zo|sinais/i, 'Apocalipse & Profecia'],
  [/fam[íi]lia|lar |namoro|casamento|filho|pais|sexual|amor|m[ãa]e|pai\b/i, 'Família & Relacionamentos'],
  [/ellen white|testemunh|patriarcas|desejado|mensageira|primeiros escritos/i, 'Ellen G. White'],
  [/prega|serm[õo]|l[íi]der|ancia|di[áa]cono|obreir|colportor|pastoral|secretaria|minist[ée]rio/i, 'Pregação & Liderança'],
  [/cren[çc]|doutrin|\bf[ée]\b|sábado|nisto cremos|verdade/i, 'Fé & Doutrina'],
];
export function prateleira(nome) {
  for (const [re, g] of PRATELEIRAS) if (re.test(nome)) return g;
  return 'Catálogo Geral';
}
