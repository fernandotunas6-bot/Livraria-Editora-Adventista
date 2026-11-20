// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { buildDestaques, capaDe, destaqueDe, somar } from './destaques';

const mediaUrl = (t, id, f) => `https://x.supabase.co/storage/v1/object/public/media/${t}/${id}/${f}`;
const S = (loja_id, mes, book_id, titulo, unidades, valor, extra = {}) => ({ loja_id, mes, book_id, titulo, codigo: '', capa: '', capa_ficheiro: '', unidades, valor, encomendas: 1, ...extra });

const sistema = [
  S('hu', 2, 'b1', 'O Desejado', 5, 42500, { capa: 'https://x/capa-b1.jpg' }),
  S('hu', 2, 'b2', 'Bíblia de Estudo', 1, 25000, { capa_ficheiro: 'biblia.jpg' }),
  S('hu', 3, null, 'Revista da Escola Sabatina', 6, 9000),
  S('lu', 2, 'b2', 'Bíblia de Estudo', 4, 100000, { capa_ficheiro: 'biblia.jpg' }),
  S(null, 2, 'b1', 'O Desejado', 2, 17000, { capa: 'https://x/capa-b1.jpg' }),
];

describe('capaDe', () => {
  it('usa o endereço completo ou monta o do ficheiro do catálogo', () => {
    expect(capaDe({ capa: 'https://a/b.jpg' }, mediaUrl)).toBe('https://a/b.jpg');
    expect(capaDe({ book_id: 'b2', capa_ficheiro: 'biblia.jpg' }, mediaUrl)).toBe('https://x.supabase.co/storage/v1/object/public/media/stock_books/b2/biblia.jpg');
    expect(capaDe({ capa: 'relativa.jpg' }, mediaUrl)).toBe('');
    // As capas do próprio site vão pelo caminho (mesma origem, sem precisar de CORS).
    expect(capaDe({ capa: 'https://livrariaadventista.com/images/capas/LIV-001.jpg' })).toBe('/images/capas/LIV-001.jpg');
    expect(capaDe({ capa: 'https://www.livrariaadventista.ao/images/capas/novos/X.jpg?v=2' })).toBe('/images/capas/novos/X.jpg?v=2');
    expect(capaDe({ capa: '/images/capas/LIV-002.jpg' })).toBe('/images/capas/LIV-002.jpg');
    expect(capaDe({ capa: '//outro.com/a.jpg' })).toBe('');
    expect(capaDe({ capa: 'https://livrariaadventista.ao.falso.com/a.jpg' })).toBe('https://livrariaadventista.ao.falso.com/a.jpg');
    expect(capaDe({}, mediaUrl)).toBe('');
  });
});

describe('somar', () => {
  it('junta o mesmo produto pelo id, e sem id pelo título sem maiúsculas', () => {
    const r = somar([[S('a', 1, 'b1', 'X', 2, 100)], [S('b', 1, 'b1', 'X (outra)', 3, 150)], [S('a', 1, null, 'Revista', 1, 10), S('a', 1, null, 'REVISTA', 1, 10)]]);
    expect(r[0]).toMatchObject({ book_id: 'b1', unidades: 5, valor: 250, titulo: 'X' });
    expect(r[1]).toMatchObject({ book_id: null, unidades: 2, valor: 20 });
  });
  it('soma o dinheiro em cêntimos e ordena por unidades, valor e título', () => {
    const r = somar([[S('a', 1, 'c', 'C', 1, 0.1), S('a', 1, 'c', 'C', 1, 0.2), S('a', 1, 'd', 'D', 2, 1), S('a', 1, 'e', 'E', 2, 5)]]);
    expect(r.map((x) => x.titulo)).toEqual(['E', 'D', 'C']);
    expect(r[2].valor).toBe(0.3);
  });
  it('deixa de fora o que não vendeu nada', () => {
    expect(somar([[S('a', 1, 'z', 'Z', 0, 0)]])).toEqual([]);
  });
});

describe('buildDestaques', () => {
  it('só do sistema: o mais vendido de cada mês e do ano, por loja', () => {
    const d = buildDestaques({ sistema, mediaUrl });
    expect(d.porLoja.hu.meses[1][0]).toMatchObject({ titulo: 'O Desejado', unidades: 5, capa: 'https://x/capa-b1.jpg', origem: 'sistema' });
    expect(d.porLoja.hu.meses[2][0]).toMatchObject({ titulo: 'Revista da Escola Sabatina', unidades: 6 });
    expect(d.porLoja.hu.ano[0]).toMatchObject({ titulo: 'Revista da Escola Sabatina', unidades: 6 });
    expect(d.porLoja.hu.ano.find((r) => r.book_id === 'b2').capa).toContain('/stock_books/b2/biblia.jpg');
    expect(d.porLoja.lu.ano[0]).toMatchObject({ titulo: 'Bíblia de Estudo', unidades: 4 });
    expect(d.temDados).toBe(true);
  });

  it('a rede soma as lojas e as encomendas sem loja', () => {
    const d = buildDestaques({ sistema, mediaUrl });
    // O Desejado: 5 no Huambo + 2 sem loja; a Bíblia: 1 + 4.
    expect(d.rede.ano.slice(0, 3).map((r) => [r.titulo, r.unidades])).toEqual([
      ['O Desejado', 7], ['Revista da Escola Sabatina', 6], ['Bíblia de Estudo', 5],
    ]);
    expect(d.rede.meses[1][0]).toMatchObject({ titulo: 'O Desejado', unidades: 7 });
    expect(d.rede.ano[2].lojas.sort()).toEqual(['hu', 'lu']);
  });

  it('o lançado à mão num mês substitui o sistema nesse mês e nessa loja', () => {
    const manual = [{ loja_id: 'hu', mes: 2, book_id: 'b9', titulo: 'Lições da Escola Sabatina', unidades: 40, valor: 60000 }];
    const d = buildDestaques({ sistema, manual, capas: { b9: 'https://x/b9.jpg' }, mediaUrl });
    expect(d.porLoja.hu.meses[1]).toHaveLength(1);
    expect(d.porLoja.hu.meses[1][0]).toMatchObject({ titulo: 'Lições da Escola Sabatina', origem: 'manual', capa: 'https://x/b9.jpg' });
    // Março continua do sistema; o Lubango não muda.
    expect(d.porLoja.hu.meses[2][0].origem).toBe('sistema');
    expect(d.porLoja.lu.meses[1][0].titulo).toBe('Bíblia de Estudo');
    expect(d.porLoja.hu.ano[0]).toMatchObject({ titulo: 'Lições da Escola Sabatina', unidades: 40 });
  });

  it('o lançado à mão para o ano inteiro vale para o ano', () => {
    const manual = [
      { loja_id: 'hu', mes: null, book_id: null, titulo: 'Hinário Adventista', unidades: 120, valor: null },
      { loja_id: 'hu', mes: null, book_id: 'b1', titulo: 'O Desejado', unidades: 90, valor: 765000 },
    ];
    const d = buildDestaques({ sistema, manual, mediaUrl });
    expect(d.porLoja.hu.origemAno).toBe('manual');
    expect(d.porLoja.hu.ano.map((r) => r.titulo)).toEqual(['Hinário Adventista', 'O Desejado']);
    expect(d.porLoja.hu.ano[0].valor).toBeNull();
    // Os meses continuam do sistema.
    expect(d.porLoja.hu.meses[1][0].titulo).toBe('O Desejado');
  });

  it('uma loja só com lançamentos à mão também aparece', () => {
    const d = buildDestaques({ sistema: [], manual: [{ loja_id: 'ca', mes: 5, titulo: 'Bíblia', unidades: 3 }] });
    expect(d.porLoja.ca.meses[4][0]).toMatchObject({ titulo: 'Bíblia', unidades: 3, origem: 'manual' });
    expect(d.rede.ano[0].titulo).toBe('Bíblia');
  });

  it('sem nada, sem destaques', () => {
    const d = buildDestaques({});
    expect(d.temDados).toBe(false);
    expect(d.rede.meses).toHaveLength(12);
    expect(destaqueDe(d.rede)).toBeNull();
  });
});

describe('destaqueDe', () => {
  it('o primeiro do ano, o mês em que mais vendeu e quantos meses liderou', () => {
    const extra = [...sistema, S('hu', 5, 'b1', 'O Desejado', 9, 76500)];
    const d = buildDestaques({ sistema: extra, mediaUrl });
    const h = destaqueDe(d.porLoja.hu);
    expect(h.titulo).toBe('O Desejado');
    expect(h.unidades).toBe(14);
    expect(h.melhorMes).toBe(4);
    expect(h.melhorUnid).toBe(9);
    expect(h.mesesNoTopo).toBe(2);
    expect(h.pesoTop).toBeCloseTo(14 / 21, 10);
  });
});
