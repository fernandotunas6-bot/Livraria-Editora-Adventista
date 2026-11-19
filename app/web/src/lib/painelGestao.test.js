import { describe, expect, it } from 'vitest';
import {
  escreverFiltros, estadoMeta, fmtCompacto, fmtKz, horaDe, lerFiltros, lerTv, mensagensDeHoje, nomeCurto, noticias, playlist,
  proximo, rodaDeLojas, tipoDoUrl, variacao, youtubeEmbed, estadoYoutube, estiloDaPassagem, livrosParaRodape, sequenciaTv,
} from '@/lib/painelGestao';

describe('formatos', () => {
  it('Kz inteiros com espaço nos milhares', () => {
    expect(fmtKz(24810000)).toBe('24 810 000 Kz');
    expect(fmtKz(5700.4)).toBe('5 700 Kz');
    expect(fmtKz(null)).toBe('0 Kz');
    expect(fmtKz('x')).toBe('—');
  });
  it('compacto para os cartões e os eixos', () => {
    expect(fmtCompacto(24810000)).toBe('24,8 M');
    expect(fmtCompacto(590000)).toBe('590 mil');
    expect(fmtCompacto(950)).toBe('950');
    expect(fmtCompacto(-3500)).toBe('−3 500');
    expect(fmtCompacto(1.2e9)).toBe('1,2 mil M');
  });
  it('a hora de uma venda', () => {
    expect(horaDe('2026-11-19T10:42:07')).toBe('10:42');
  });
});

describe('variação e meta', () => {
  it('hoje contra o mesmo dia da semana passada', () => {
    expect(variacao(112, 100)).toMatchObject({ sobe: true, texto: '▲ 12 %' });
    expect(variacao(90, 100)).toMatchObject({ sobe: false, texto: '▼ 10 %' });
    expect(variacao(50, 0)).toBeNull();
  });
  it('a cor da meta conta com o ritmo do mês, não só com a meta', () => {
    expect(estadoMeta({ vendido: 120, meta: 100, ritmoIdeal: 60 })).toBe('atingida');
    expect(estadoMeta({ vendido: 55, meta: 100, ritmoIdeal: 50 })).toBe('adiantada');
    expect(estadoMeta({ vendido: 40, meta: 100, ritmoIdeal: 50 })).toBe('atras');
    expect(estadoMeta({ vendido: 30, meta: 100, ritmoIdeal: 50 })).toBe('critica');
    expect(estadoMeta({ vendido: 30, meta: null })).toBe('sem-meta');
  });
});

describe('lojas e filtros', () => {
  it('nome curto', () => {
    expect(nomeCurto('x', 'Livraria Adventista — Huambo')).toBe('Huambo');
    expect(nomeCurto('online', 'A loja online')).toBe('Loja online');
    expect(nomeCurto('y', 'Lubango')).toBe('Lubango');
  });
  it('os filtros vão e voltam do endereço', () => {
    expect(lerFiltros('?loja=abc&canal=online&tv=1')).toEqual({ alvo: 'abc', canal: 'online', tv: true });
    expect(lerFiltros('?canal=outro')).toEqual({ alvo: '', canal: '', tv: false });
    expect(escreverFiltros('?x=1', { alvo: 'abc', canal: '', tv: true })).toBe('?x=1&loja=abc&tv=1');
    expect(escreverFiltros('?loja=abc', { alvo: '', canal: '', tv: false })).toBe('');
  });
  it('a roda do modo TV: todas e cada loja', () => {
    expect(rodaDeLojas([{ id: 'h' }, { id: 'online' }])).toEqual(['', 'h', 'online']);
  });
});

describe('modo TV', () => {
  it('a configuração deste aparelho, com valores seguros', () => {
    expect(lerTv(null)).toEqual({ layout: '40-60', lado: 'esquerda', rodarLojas: true, som: false, segundosPorLoja: 30, transicao: 'esbater', vinhetas: true });
    expect(lerTv('{"layout":"50-50","lado":"direita","rodarLojas":false,"som":true,"segundosPorLoja":5,"transicao":"cortina","vinhetas":false}'))
      .toEqual({ layout: '50-50', lado: 'direita', rodarLojas: false, som: true, segundosPorLoja: 10, transicao: 'cortina', vinhetas: false });
    expect(lerTv('{"transicao":"inventada"}').transicao).toBe('esbater');
    expect(lerTv('{estragado').layout).toBe('40-60');
    expect(lerTv({ layout: 'inventado' }).layout).toBe('40-60');
  });
  it('a publicidade: só a activa, por ordem, em ciclo', () => {
    const l = playlist([
      { id: 3, ordem: 2, url: 'https://x/c.jpg' }, { id: 1, ordem: 1, url: 'https://x/a.mp4' },
      { id: 2, ordem: 1, url: 'https://x/b.jpg', activo: false }, { id: 4, ordem: 0, url: 'http://x/inseguro.jpg' },
    ]);
    expect(l.map((m) => m.id)).toEqual([1, 3]);
    expect([proximo(0, 2), proximo(1, 2), proximo(0, 0)]).toEqual([1, 0, 0]);
  });
  it('YouTube sem cookies, a tocar sem som, com a interface que avisa do fim; o tipo pelo endereço', () => {
    expect(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { origem: 'https://gestao.livrariaadventista.ao' })).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=https%3A%2F%2Fgestao.livrariaadventista.ao');
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ', { som: true })).toContain('mute=0');
    // sem repetir, o vídeo termina e a TV passa ao seguinte; o único da lista repete
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ')).not.toContain('loop=1');
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ', { repetir: true })).toContain('loop=1&playlist=dQw4w9WgXcQ');
    expect(youtubeEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ?');
    expect(youtubeEmbed('https://x.ao/v.mp4')).toBeNull();
    expect(tipoDoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(tipoDoUrl('https://x.supabase.co/storage/v1/object/public/media/promo.MP4')).toBe('video');
    expect(tipoDoUrl('https://x.ao/cartaz.webp')).toBe('imagem');
  });
});

describe('rodapé (notícias)', () => {
  const dados = {
    mes: 11,
    resumo: { hoje: 1245300, hoje_vendas: 87, semana_passada: 1111875, mes: 24810000, mes_vendas: 1200, meta: 31400000, percentagem: 79, falta: 6590000, ritmo_necessario: 549167, ritmo_ideal: 19887000, projeccao: 39200000 },
    lojas: [
      { id: 'h', nome: 'Livraria Adventista — Huambo', mes: 12100000, hoje: 500000, meta: 14000000, percentagem: 86 },
      { id: 'l', nome: 'Livraria Adventista — Lubango', mes: 7300000, hoje: 0, meta: 10000000, percentagem: 73 },
      { id: 'online', nome: 'A loja online', mes: 1300000, hoje: 7200, meta: 1500000, percentagem: 88 },
    ],
    mais_vendidos_hoje: [{ titulo: 'O Desejado de Todas as Nações', quantidade: 48 }],
    ultimas: [{ quando: '2026-11-19T10:42:07', alvo: 'h', loja: 'Livraria Adventista — Huambo', total: 11400, artigo: 'O Desejado', anulado: false }],
  };
  it('as mensagens da direcção primeiro, depois os números', () => {
    const n = noticias(dados, [{ texto: 'Bíblias com 20 % esta semana' }]);
    expect(n[0]).toMatchObject({ etiqueta: 'AVISO', texto: 'Bíblias com 20 % esta semana', tom: 'aviso' });
    expect(n.map((x) => x.etiqueta)).toEqual(['AVISO', 'HOJE', 'META', 'PROJECÇÃO', 'LIDERA', 'HUAMBO', 'LOJA ONLINE', 'MAIS VENDIDO HOJE', 'ÚLTIMA VENDA']);
  });
  it('hoje com a variação, a meta com o que falta, quem lidera', () => {
    const n = noticias(dados);
    expect(n.find((x) => x.etiqueta === 'HOJE')).toMatchObject({ texto: '1 245 300 Kz em 87 vendas · ▲ 12 % face ao mesmo dia da semana passada', tom: 'bom' });
    expect(n.find((x) => x.etiqueta === 'META').texto).toBe('79 % da meta de Novembro · faltam 6 590 000 Kz · 549 167 Kz por dia até ao fim do mês');
    expect(n.find((x) => x.etiqueta === 'LIDERA').texto).toBe('Loja online, com 88 % da meta do mês');
    expect(n.find((x) => x.etiqueta === 'ÚLTIMA VENDA').texto).toBe('10:42 · Huambo · 11 400 Kz · O Desejado');
  });
  it('meta atingida: os parabéns', () => {
    const n = noticias({ ...dados, resumo: { ...dados.resumo, mes: 32000000, percentagem: 102 } });
    expect(n.find((x) => x.etiqueta === 'META ATINGIDA')).toMatchObject({ tom: 'bom' });
  });
  it('sem dados, sem notícias; sem meta, o mês', () => {
    expect(noticias(null)).toEqual([]);
    const n = noticias({ ...dados, resumo: { ...dados.resumo, meta: null } });
    expect(n.find((x) => x.etiqueta === 'NOVEMBRO').texto).toBe('24 810 000 Kz em 1200 vendas');
  });
  it('as mensagens que passam hoje: activas e dentro do prazo, por ordem', () => {
    const l = mensagensDeHoje([
      { id: 1, ordem: 2, texto: 'b' }, { id: 2, ordem: 1, texto: 'a', ate: '2026-11-19' },
      { id: 3, ordem: 0, texto: 'velha', ate: '2026-11-18' }, { id: 4, ordem: 0, texto: 'desligada', activo: false },
    ], '2026-11-19');
    expect(l.map((m) => m.id)).toEqual([2, 1]);
  });
});

describe('fim dos vídeos do YouTube', () => {
  it('lê o estado nas mensagens do leitor do YouTube', () => {
    expect(estadoYoutube('{"event":"onStateChange","info":0}')).toBe('terminou');
    expect(estadoYoutube('{"event":"infoDelivery","info":{"playerState":0,"currentTime":212.3}}')).toBe('terminou');
    expect(estadoYoutube({ event: 'infoDelivery', info: { playerState: 1 } })).toBe('a-tocar');
    expect(estadoYoutube('{"event":"onError","info":150}')).toBe('erro');
    expect(estadoYoutube('{"event":"infoDelivery","info":{"currentTime":3}}')).toBeNull();
    expect(estadoYoutube('não é json')).toBeNull();
    expect(estadoYoutube(null)).toBeNull();
  });
});

describe('TV avançada', () => {
  const m = (id, papel = 'publicidade', ordem = id) => ({ id, ordem, papel, url: `https://x/${id}.mp4` });
  it('uma vinheta depois de cada anúncio, a rodar entre as vinhetas', () => {
    expect(sequenciaTv([m(1), m(2), m(3), m(8, 'vinheta'), m(9, 'vinheta')]).map((x) => x.id)).toEqual([1, 8, 2, 9, 3, 8]);
    expect(sequenciaTv([m(1), m(2), m(8, 'vinheta')], { vinhetas: false }).map((x) => x.id)).toEqual([1, 2]);
    expect(sequenciaTv([m(1), m(2)]).map((x) => x.id)).toEqual([1, 2]);
    expect(sequenciaTv([m(8, 'vinheta')]).map((x) => x.id)).toEqual([8]);
  });
  it('a transição de cada passagem: a escolhida, ou a rodar na aleatória', () => {
    expect(estiloDaPassagem('cortina', 7)).toBe('cortina');
    expect([0, 1, 2, 3, 4].map((k) => estiloDaPassagem('aleatoria', k))).toEqual(['esbater', 'deslizar', 'zoom', 'cortina', 'esbater']);
    expect(estiloDaPassagem('inventada', 1)).toBe('esbater');
  });
});

describe('livros no rodapé', () => {
  const agora = new Date('2026-11-19T12:00:00Z');
  const livros = [
    { title: 'Promoção válida', price: 9000, sale_price: 7000, sale_ends_at: '2026-11-30T00:00:00Z', stock: 3, cover_image: 'https://x/a.jpg', created: '2026-01-01' },
    { title: 'Promoção acabada', price: 9000, sale_price: 7000, sale_ends_at: '2026-11-01T00:00:00Z', stock: 3, created: '2026-11-18' },
    { title: 'Novo', author: 'Ellen G. White', price: 5700, stock: 2, cover: 'https://x/b.jpg', created: '2026-11-17' },
    { title: 'Esgotado', price: 100, stock: 0, created: '2026-11-19' },
    { title: 'Oculto', price: 100, stock: 9, active: false, created: '2026-11-19' },
  ];
  it('promoções em vigor e novidades com stock, com a capa', () => {
    const r = livrosParaRodape(livros, agora);
    expect(r.promocoes).toEqual([{ titulo: 'Promoção válida', preco: 9000, promocao: 7000, capa: 'https://x/a.jpg' }]);
    expect(r.novidades.map((x) => x.titulo)).toEqual(['Promoção acabada', 'Novo']);
    expect(r.novidades[1]).toMatchObject({ autor: 'Ellen G. White', capa: 'https://x/b.jpg' });
  });
  it('no rodapé: promoção e novidade com a capa; a mensagem com a sua imagem', () => {
    const d = { mes: 11, resumo: { hoje: 0, hoje_vendas: 0, mes: 0 }, lojas: [], ultimas: [], mais_vendidos_hoje: [] };
    const n = noticias(d, [{ texto: 'Feira do livro no sábado', imagem: 'https://x/cartaz.jpg' }], livrosParaRodape(livros, agora));
    expect(n[0]).toMatchObject({ etiqueta: 'AVISO', imagem: 'https://x/cartaz.jpg', forma: 'quadrada' });
    expect(n.find((x) => x.etiqueta === 'PROMOÇÃO')).toMatchObject({ texto: 'Promoção válida — de 9 000 Kz por 7 000 Kz', imagem: 'https://x/a.jpg', forma: 'capa' });
    expect(n.find((x) => x.etiqueta === 'NOVIDADE' && x.texto.startsWith('Novo')).texto).toBe('Novo · Ellen G. White · 5 700 Kz');
  });
});
