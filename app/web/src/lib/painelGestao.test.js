import { describe, expect, it } from 'vitest';
import {
  escreverFiltros, estadoMeta, fmtCompacto, fmtKz, horaDe, lerFiltros, lerTv, nomeCurto, playlist, proximo, rodaDeLojas,
  tipoDoUrl, variacao, youtubeEmbed,
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
    expect(lerTv(null)).toEqual({ layout: '40-60', lado: 'esquerda', rodarLojas: true, som: false, segundosPorLoja: 30 });
    expect(lerTv('{"layout":"50-50","lado":"direita","rodarLojas":false,"som":true,"segundosPorLoja":5}'))
      .toEqual({ layout: '50-50', lado: 'direita', rodarLojas: false, som: true, segundosPorLoja: 10 });
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
  it('YouTube sem cookies, a tocar sem som; o tipo pelo endereço', () => {
    expect(youtubeEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=0&loop=1&playlist=dQw4w9WgXcQ&rel=0&modestbranding=1&playsinline=1');
    expect(youtubeEmbed('https://youtu.be/dQw4w9WgXcQ', { som: true })).toContain('mute=0');
    expect(youtubeEmbed('https://x.ao/v.mp4')).toBeNull();
    expect(tipoDoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(tipoDoUrl('https://x.supabase.co/storage/v1/object/public/media/promo.MP4')).toBe('video');
    expect(tipoDoUrl('https://x.ao/cartaz.webp')).toBe('imagem');
  });
});
