// Testes dos módulos do KiGest. Correm no `npm test` (o vitest inclui scripts/**/*.test.mjs) e
// não tocam na rede nem na base de dados: a exportação de exemplo é escrita aqui.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARMAZEM_LOJA, artigos, codigoEan, lerExportacao } from './exportacao.mjs';
import { conciliar, diferencas, duplicados, jaccard, palavras, semelhanca, tituloBase } from './conciliar.mjs';
import { prateleira, tipoDeProduto, titulo } from './titulos.mjs';
import { descricaoEmFalta, gerar } from './migracao.mjs';

const pasta = mkdtempSync(join(tmpdir(), 'kigest-'));
afterAll(() => { /* a pasta é temporária do sistema; não faz mal ficar */ });

function exportacaoDeExemplo({ artigos: arts, stock, comprimido = true, registosDoFecho = null } = {}) {
  const linhas = [
    JSON.stringify({ formato: 'kigest-exportacao', versao: 1, origem: 'TESTE/KigestGC', data: '2026-11-12 12:53:23', objectos: 3 }),
    JSON.stringify({ tabela: 'tbArtigosSubFamilia', tipo: 'TABELA', colunas: ['Id', 'IdFamilia', 'Descricao'] }),
    JSON.stringify([2, 1, 'LIVROS ']),
    JSON.stringify({ fim: 'tbArtigosSubFamilia', registos: 1 }),
    JSON.stringify({
      tabela: 'tbArtigos',
      tipo: 'TABELA',
      colunas: ['IdArtigo', 'Referencia', 'Descricao', 'CoBar', 'IdSubFamilia', 'Preco1', 'QtdStock', 'Descontinuado', 'Bloqueio'],
    }),
    ...(arts ?? [
      [1, '00001', 'MEDITAÇÕES DIARIAS - MARAVILHOSO DEUS', '9788534529860', 2, 10000, 47, 0, '0'],
      [2, '', 'ADVENTISMO', '', 2, 36135, 9, 0, '0'],
    ]).map((a) => JSON.stringify(a)),
    JSON.stringify({ fim: 'tbArtigos', registos: registosDoFecho ?? (arts ?? [1, 2]).length }),
    JSON.stringify({ tabela: 'tbArtigosStock', tipo: 'TABELA', colunas: ['IdArtigo', 'IdArmazem', 'QtdExistente', 'UltimaSaida'] }),
    ...(stock ?? [[1, ARMAZEM_LOJA, 12, '2026-11-10'], [1, 9, 999, null]]).map((s) => JSON.stringify(s)),
    JSON.stringify({ fim: 'tbArtigosStock', registos: (stock ?? [1, 2]).length }),
  ];
  const texto = `${linhas.join('\n')}\n`;
  const ficheiro = join(pasta, `exemplo-${Math.random().toString(36).slice(2)}.kigest`);
  writeFileSync(ficheiro, comprimido ? gzipSync(Buffer.from(texto, 'utf8')) : Buffer.from(texto, 'utf8'));
  return ficheiro;
}

describe('lerExportacao', () => {
  it('lê o ficheiro gzip e o JSON à vista', () => {
    for (const comprimido of [true, false]) {
      const e = lerExportacao(exportacaoDeExemplo({ comprimido }));
      expect(e.meta.origem).toBe('TESTE/KigestGC');
      expect(e.tabelas.get('tbArtigos').registos).toHaveLength(2);
    }
  });

  it('recusa um ficheiro que não é do KiGest', () => {
    const f = join(pasta, 'outro.json');
    writeFileSync(f, '{"formato":"outra-coisa"}\n');
    expect(() => lerExportacao(f)).toThrow(/não é uma exportação do KiGest/);
  });

  it('recusa uma exportação que ficou a meio', () => {
    // O fecho de cada tabela diz quantos registos devia trazer: é o que apanha o download
    // interrompido, que de outra maneira passaria por um catálogo com menos livros.
    expect(() => lerExportacao(exportacaoDeExemplo({ registosDoFecho: 7 })))
      .toThrow(/vieram 2 registos e o fecho diz 7/);
  });
});

describe('artigos', () => {
  const lista = () => artigos(lerExportacao(exportacaoDeExemplo()));

  it('traz produto, preço e existência, e nada de clientes', () => {
    const [a] = lista();
    expect(a).toEqual({
      id: 1,
      referencia: '00001',
      ref: '00001',
      descricao: 'MEDITAÇÕES DIARIAS - MARAVILHOSO DEUS',
      ean: '9788534529860',
      codigoBarras: '9788534529860',
      preco: 10000,
      stock: 12,
      subfamilia: 'LIVROS',
      descontinuado: false,
      ultimaSaida: '2026-11-10',
    });
  });

  it('conta só o armazém da loja', () => {
    expect(lista()[0].stock).toBe(12);
  });

  it('usa o QtdStock do artigo quando não há linha de stock', () => {
    expect(lista()[1].stock).toBe(9);
  });

  it('dá uma chave ao artigo sem referência, a partir do IdArtigo', () => {
    expect(lista()[1].ref).toBe('id-2');
  });

  it('só aceita 13 dígitos como código de barras', () => {
    expect(codigoEan('978-85-345-2986-0')).toBe('9788534529860');
    expect(codigoEan('12345')).toBe('');
    expect(codigoEan(null)).toBe('');
  });
});

describe('titulo', () => {
  it('arruma a caixa pelas regras do português', () => {
    expect(titulo('O DESEJADO DE TODAS AS NAÇÕES')).toBe('O Desejado de Todas as Nações');
    expect(titulo('A FÉ DE JESUS')).toBe('A Fé de Jesus');
  });

  it('corrige as gralhas que estão na tabela e deixa as outras como vieram', () => {
    expect(titulo('COMO CONHECER A VONTE DE DEUS')).toBe('Como Conhecer a Vontade de Deus');
    expect(titulo('BIBLIA SGARADA')).toBe('Bíblia Sagrada');
    // «TORSAL» não se confirmou — fica como está, para o dono ver.
    expect(titulo('TORSAL')).toBe('Torsal');
  });

  it('troca o separador do subtítulo pelo travessão', () => {
    expect(titulo('MEDITAÇÕES DIARIAS - MARAVILHOSO DEUS')).toBe('Meditações Diárias — Maravilhoso Deus');
  });

  it('guarda a pontuação, as marcas e os volumes', () => {
    expect(titulo('100 ANOS DE MISSÃO, FÉ E ESPERANÇA')).toBe('100 Anos de Missão, Fé e Esperança');
    expect(titulo('T-CHERT UMA VOZ 27')).toBe('T-shirt UmaVoz27');
    expect(titulo('MENTE CARATER PERSSONALIDADE VL1')).toBe('Mente Carácter Personalidade Vol. 1');
  });

  it('põe maiúscula depois de um parêntese', () => {
    expect(titulo('LENÇO DE LÍDER (DESBRAVADORES)')).toBe('Lenço de Líder (Desbravadores)');
  });

  it('não devolve nada para um nome vazio', () => {
    expect(titulo('')).toBe('');
    expect(titulo(null)).toBe('');
  });
});

describe('tipoDeProduto e prateleira', () => {
  it('classifica pelo nome e não pela subfamília do KiGest', () => {
    // No KiGest a «BIBLIA DISCIPLOS» está em UNIFORME e o «101 SEGREDOS» em CARTÃO.
    expect(tipoDeProduto('Bíblia dos Discípulos')).toBe('biblia');
    expect(tipoDeProduto('101 Segredos')).toBe('livro');
    expect(tipoDeProduto('Hinário Novo')).toBe('musica');
    expect(tipoDeProduto('Lenço de Líder (Desbravadores)')).toBe('desbravadores');
    expect(tipoDeProduto('T-shirt UmaVoz27')).toBe('vestuario');
    expect(tipoDeProduto('Certificado de Batismo')).toBe('papelaria');
    expect(tipoDeProduto('Vinho de Santa Ceia')).toBe('papelaria');
  });

  it('usa as prateleiras que o catálogo já tem', () => {
    expect(prateleira('Bíblia Sagrada RA Rosa')).toBe('Bíblias');
    expect(prateleira('Vinho de Santa Ceia')).toBe('Santa Ceia');
    expect(prateleira('Envelope de Dízimo')).toBe('Material de Igreja');
    expect(prateleira('Profetas e Reis')).toBe('Apocalipse & Profecia');
    expect(prateleira('Um Livro Qualquer')).toBe('Catálogo Geral');
  });
});

describe('semelhança de títulos', () => {
  it('deixa cair as palavras vazias', () => {
    expect([...palavras('O Desejado de Todas as Nações')].sort()).toEqual(['desejado', 'nacoes', 'todas']);
  });

  it('corta o subtítulo do título do site', () => {
    expect(tituloBase('Sobreviventes — Histórias reais')).toBe('Sobreviventes');
    expect(tituloBase('Nisto Cremos - As 28 Crenças')).toBe('Nisto Cremos');
  });

  it('dá nota cheia ao título abreviado que cabe todo no completo', () => {
    expect(semelhanca(palavras('MÚSICA NA IGREJA'), palavras('Música na Igreja — Aspectos Teológicos'))).toBe(1);
    // De Jaccard puro seriam só 2 em 4: é a cobertura que salva o emparelhamento.
    expect(jaccard(palavras('MÚSICA NA IGREJA'), palavras('Música na Igreja — Aspectos Teológicos'))).toBeLessThan(1);
  });
});

describe('conciliar', () => {
  const site = (ps) => ps.map((p, i) => ({
    id: `id${i}`, book_code: p.book_code, title: p.title, price: p.price ?? 0, stock: p.stock ?? 0,
    isbn: p.isbn ?? '', product_type: 'livro', genre: '', active: true, description: p.description ?? '<p>texto</p>',
    kigest_ref: p.kigest_ref ?? '',
  }));

  it('liga um para um e separa o que é ambíguo', () => {
    const arts = [
      { ref: 'A', referencia: 'A', descricao: 'SOBREVIVENTES', ean: '', preco: 11030, stock: 6 },
      { ref: 'B', referencia: 'B', descricao: 'BIBLIA SAGRADA', ean: '', preco: 6500, stock: 4 },
    ];
    const r = conciliar(arts, site([
      { book_code: 'LIV-090', title: 'Sobreviventes — Histórias reais', price: 11030, stock: 2 },
      { book_code: 'BIB-010', title: 'Bíblia Sagrada — capa castanha', price: 20500, stock: 6 },
      { book_code: 'BIB-013', title: 'Bíblia Sagrada — capa bordô', price: 20500, stock: 6 },
    ]));
    expect(r.firmes.map((f) => f.produto.book_code)).toEqual(['LIV-090']);
    expect(r.ambiguos.map((a) => a.alvos.map((p) => p.book_code))).toEqual([['BIB-010', 'BIB-013']]);
    expect(r.soNoSite.map((p) => p.book_code)).toEqual(['BIB-010', 'BIB-013']);
  });

  it('fica com o artigo que ganha com folga quando dois disputam o mesmo produto', () => {
    // Na loja há o lenço do membro e o do líder, a preços diferentes; no site há um só. O do
    // membro ganha com folga (o do líder tem «líder» a mais) e é esse o par.
    const arts = [
      { ref: 'A', referencia: 'A', descricao: 'LENÇO DE DESBRAVADORES', ean: '', preco: 2500, stock: 78 },
      { ref: 'B', referencia: 'B', descricao: 'LENÇO DE LÍDER (DESBRAVADORES)', ean: '', preco: 5000, stock: 10 },
    ];
    const r = conciliar(arts, site([{ book_code: 'DBV-004', title: 'Lenço do Clube de Desbravadores', price: 2500, stock: 78 }]));
    expect(r.firmes).toHaveLength(1);
    expect(r.firmes[0].artigo.ref).toBe('A');
    expect(r.ambiguos.map((a) => a.artigo.ref)).toEqual(['B']);
  });

  it('não escolhe nenhum quando a gralha põe os dois à mesma distância', () => {
    // O caso verdadeiro da exportação de 2026-11-12: o lenço do membro está lançado no
    // singular («DESBRAVADORE»), o que lhe tira a palavra que o identificava. Sem folga entre
    // os dois, o site ficaria a vender o lenço do membro a 5 000 Kz, o preço do de líder.
    const arts = [
      { ref: 'A', referencia: 'A', descricao: 'LENÇO DE DESBRAVADORE', ean: '', preco: 2000, stock: 6 },
      { ref: 'B', referencia: 'B', descricao: 'LENÇO DE LÍDER (DESBRAVADORES)', ean: '', preco: 5000, stock: 10 },
    ];
    const r = conciliar(arts, site([{ book_code: 'DBV-004', title: 'Lenço do Clube de Desbravadores', price: 2500, stock: 78 }]));
    // Nenhum dos dois escreve no DBV-004.
    expect(r.firmes).toHaveLength(0);
    // O do líder fica ambíguo, com o produto do site à vista para o dono escolher.
    expect(r.ambiguos.map((a) => a.artigo.ref)).toEqual(['B']);
    expect(r.ambiguos[0].alvos.map((p) => p.book_code)).toEqual(['DBV-004']);
    // O do membro, que a gralha afastou, entra como produto novo — mas com o aviso de que se
    // parece com um que já existe.
    expect(r.semPar.map((a) => a.ref)).toEqual(['A']);
    expect(r.semPar[0].parecidos).toEqual(['DBV-004']);
  });

  it('prefere a ligação já feita ao emparelhamento por palavras', () => {
    const arts = [{ ref: '0008', referencia: '0008', descricao: 'NISTO CREMOS', ean: '', preco: 20000, stock: 67 }];
    const r = conciliar(arts, site([{ book_code: 'LIV-063', title: 'Outro Título Qualquer', kigest_ref: '0008' }]));
    expect(r.firmes[0].via).toBe('ref');
    expect(r.firmes[0].produto.book_code).toBe('LIV-063');
  });

  it('liga pelo código de barras quando os títulos não se parecem', () => {
    const arts = [{ ref: 'A', referencia: 'A', descricao: 'BIBLIA FIEL', ean: '7898521811150', preco: 33875, stock: 4 }];
    const r = conciliar(arts, site([{ book_code: 'BIB-018', title: 'Bíblia Almeida Revista', isbn: '7898521811150' }]));
    expect(r.firmes[0].via).toBe('codigo');
  });

  it('aponta o que o site vende sem haver na loja e o que esconde tendo', () => {
    const arts = [
      { ref: 'A', referencia: 'A', descricao: 'INTERPRETANDO AS ESCRITURAS', ean: '', preco: 31820, stock: 0 },
      { ref: 'B', referencia: 'B', descricao: 'OS CAMPEOES SAÕ VEGETARIANOS', ean: '', preco: 11030, stock: 4 },
    ];
    const r = conciliar(arts, site([
      { book_code: 'LIV-049', title: 'Interpretando as Escrituras', price: 31820, stock: 12 },
      { book_code: 'LIV-013', title: 'Os Campeões São Vegetarianos', price: 11030, stock: 0 },
    ]));
    const d = diferencas(r.firmes);
    expect(d.find((x) => x.produto.book_code === 'LIV-049').vendeSemTer).toBe(true);
    expect(d.find((x) => x.produto.book_code === 'LIV-013').escondeOQueTem).toBe(true);
  });
});

describe('duplicados', () => {
  const art = (ref, descricao, preco, stock) => ({ ref, referencia: ref, descricao, ean: '', preco, stock });

  it('junta o mesmo artigo lançado duas vezes', () => {
    const g = duplicados([
      art('A', 'A CIENCIA DO BOM VIVER', 26030, 1),
      art('B', 'CIENCIA DO BOM VIVER', 26030, 0),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0][0].ref).toBe('A');
  });

  it('não junta livros diferentes que custam o mesmo', () => {
    expect(duplicados([
      art('A', 'FELIZES NO AMOR', 40000, 1),
      art('B', 'BANDEJA DE SANTA CEIA', 40000, 1),
      art('C', 'AINDA EXISTE ESPERANÇA', 3571, 5),
      art('D', 'TEMPO DE ESPERANÇA', 3571, 18),
    ])).toHaveLength(0);
  });

  it('não junta um nome de uma palavra ao que o contém', () => {
    expect(duplicados([
      art('A', 'CERTIFICADO', 250, 7295),
      art('B', 'CERTIFICADO DO MINISTERIO PESSOAL', 250, 5),
    ])).toHaveLength(0);
  });

  it('fica com o que tem existência e, em empate, com o que está melhor escrito', () => {
    const [g] = duplicados([
      art('A', 'A GRANDE EXTENÇAÕ EM MASSA', 51561, 0),
      art('B', 'A GRANDE EXTINÇÃO EM MASSA', 51561, 0),
    ]);
    expect(g[0].ref).toBe('B');
  });
});

describe('descricaoEmFalta', () => {
  it('apanha a vazia, a curta e a que é um pedaço do título', () => {
    expect(descricaoEmFalta({ title: 'Bíblia Sagrada — capa castanha', description: '' })).toBe(true);
    expect(descricaoEmFalta({ title: 'Bíblia Sagrada — capa castanha', description: 'Biblia Sagrada' })).toBe(true);
    expect(descricaoEmFalta({ title: 'T-shirt UmaVoz27', description: '<p>T-shirt branca UmaVoz27</p>' })).toBe(true);
  });

  it('deixa em paz uma descrição a sério, mesmo que nomeie o livro', () => {
    expect(descricaoEmFalta({
      title: '9 Virtudes da Fé',
      description: '<p>Os autores examinam nove hábitos. 9 Virtudes da Fé traz tarefas práticas para o dia a dia de quem quer crescer.</p>',
    })).toBe(false);
  });
});

describe('gerar', () => {
  const exportacao = { meta: { data: '2026-11-12 12:53:23', origem: 'TESTE/KigestGC' } };
  const correr = (arts, produtos) => gerar({ exportacao, artigosKigest: arts, produtosSite: produtos });

  it('escreve o update dos ligados e o insert dos novos, e nada mais', () => {
    const { sql, pares, novos } = correr(
      [
        { ref: '00061', referencia: '00061', descricao: 'OS CAMPEOES SAÕ VEGETARIANOS', ean: '9788534503082', preco: 11030, stock: 4 },
        { ref: '00005', referencia: '00005', descricao: 'VIDA DE JESUS', ean: '', preco: 18000, stock: 101 },
      ],
      [{ id: 'x', book_code: 'LIV-013', title: 'Os Campeões São Vegetarianos', price: 11030, stock: 0, isbn: '', product_type: 'livro', genre: '', active: true, description: '<p>uma descrição comprida o suficiente para não contar como em falta</p>', kigest_ref: '' }],
    );
    expect(pares).toHaveLength(1);
    expect(novos).toHaveLength(1);
    expect(sql).toContain('add column if not exists kigest_ref');
    expect(sql).toContain("'LIV-013'");
    expect(sql).toContain("'Vida de Jesus'");
    expect(sql).toContain('active, featured');
    // Nada de apagar nem de activar nada.
    expect(sql).not.toMatch(/\bdelete\b|\bdrop table\b|set active = true/i);
  });

  it('só escreve o ISBN que é de livro', () => {
    // O código começado em 2 é interno da loja e não identifica o produto fora dela.
    const { sql } = correr(
      [{ ref: 'CDC0001', referencia: 'CDC0001', descricao: 'CARTÃO DE DEDICAÇÃO DE CRIANÇAS', ean: '2543141245842', preco: 200, stock: 135 }],
      [],
    );
    expect(sql).not.toContain('2543141245842');
  });

  it('não deixa um apóstrofo nem um delimitador fechar o literal', () => {
    const { sql } = correr([{ ref: 'X', referencia: 'X', descricao: "LIVRO D'ALGO $kg$ --", ean: '', preco: 1, stock: 1 }], []);
    expect(sql).toContain("'Livro D''algo $kg$ --'");
    // E o preço e o stock entram como números, nunca como texto vindo do ficheiro.
    expect(sql).toMatch(/, 1::numeric, 1::numeric\)/);
  });
});
