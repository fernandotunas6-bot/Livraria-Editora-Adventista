import { describe, expect, it } from 'vitest';
import { applyShopTheme, contrastRatio, ensureContrastOnWhite, hexToRgb, relativeLuminance, resolveShopBgMode } from '@/lib/shopTheme';

const BRANCO = { r: 255, g: 255, b: 255 };
const PRETO = { r: 0, g: 0, b: 0 };

const razaoSobreBranco = (hex) => contrastRatio(hexToRgb(hex), BRANCO);

describe('relativeLuminance', () => {
  it('vai de 0 no preto a 1 no branco', () => {
    expect(relativeLuminance(PRETO)).toBe(0);
    expect(relativeLuminance(BRANCO)).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('preto sobre branco dá o máximo de 21', () => {
    expect(contrastRatio(PRETO, BRANCO)).toBeCloseTo(21, 1);
  });

  it('a mesma cor dá 1', () => {
    expect(contrastRatio(BRANCO, BRANCO)).toBeCloseTo(1, 5);
  });

  it('não depende da ordem', () => {
    const a = hexToRgb('#0ea5c9');
    expect(contrastRatio(a, BRANCO)).toBeCloseTo(contrastRatio(BRANCO, a), 5);
  });

  it('confirma o problema que originou isto', () => {
    // A cor da marca desta loja sobre branco: era a cor dos preços.
    expect(razaoSobreBranco('#0ea5c9')).toBeLessThan(4.5);
    expect(razaoSobreBranco('#0ea5c9')).toBeCloseTo(2.9, 1);
  });
});

describe('ensureContrastOnWhite', () => {
  it('escurece até passar o mínimo, com folga', () => {
    // Mira acima dos 4,5 da WCAG: poucos fundos da loja são branco puro — há cinzentos
    // claros, cartões com tinta da marca a 5% e caixas de destaque, e sobre esses a mesma
    // cor ficava abaixo do mínimo.
    const corrigida = ensureContrastOnWhite('#0ea5c9');
    expect(razaoSobreBranco(corrigida)).toBeGreaterThanOrEqual(5.2);
  });

  it('mantém o tom — continua o mesmo azul, só mais fundo', () => {
    // Escurecer proporcionalmente preserva a relação entre canais: o canal com mais força
    // continua a ser o mesmo, por isso a cor não muda de família.
    const original = hexToRgb('#0ea5c9');
    const corrigida = hexToRgb(ensureContrastOnWhite('#0ea5c9'));
    expect(corrigida.b).toBeGreaterThan(corrigida.g);
    expect(corrigida.g).toBeGreaterThan(corrigida.r);
    expect(original.b).toBeGreaterThan(original.g);
    expect(original.g).toBeGreaterThan(original.r);
    // E é mesmo mais escura.
    expect(relativeLuminance(corrigida)).toBeLessThan(relativeLuminance(original));
  });

  it('não mexe no que já passa', () => {
    // Um azul-escuro que já cumpre fica exactamente como estava.
    const escuro = '#1b365d';
    expect(razaoSobreBranco(escuro)).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrastOnWhite(escuro)).toBe(escuro);
  });

  it('funciona com qualquer cor que configurem no painel', () => {
    // É por isto que se calcula em vez de fixar um valor: a cor da marca é editável.
    for (const hex of ['#0ea5c9', '#22c55e', '#facc15', '#f97316', '#ec4899', '#84cc16']) {
      const corrigida = ensureContrastOnWhite(hex);
      expect(razaoSobreBranco(corrigida), `${hex} → ${corrigida}`).toBeGreaterThanOrEqual(5.19);
    }
  });

  it('aceita um mínimo diferente', () => {
    // 3:1 é o que a WCAG pede a texto grande e a elementos gráficos.
    const paraIcone = ensureContrastOnWhite('#0ea5c9', 3);
    expect(razaoSobreBranco(paraIcone)).toBeGreaterThanOrEqual(3);
    // E dá uma cor mais clara do que a exigência de 4,5.
    expect(relativeLuminance(hexToRgb(paraIcone)))
      .toBeGreaterThan(relativeLuminance(hexToRgb(ensureContrastOnWhite('#0ea5c9', 4.5))));
  });

  it('devolve preto quando nem escurecer chega', () => {
    // Amarelo puro só passa 4,5 muito escuro; o preto é o limite seguro.
    const corrigida = ensureContrastOnWhite('#ffff00', 15);
    expect(razaoSobreBranco(corrigida)).toBeGreaterThanOrEqual(15);
  });

  it('aguenta entradas estranhas', () => {
    expect(() => ensureContrastOnWhite(null)).not.toThrow();
    expect(() => ensureContrastOnWhite('')).not.toThrow();
    expect(() => ensureContrastOnWhite('#abc')).not.toThrow();
  });
});

describe('resolveShopBgMode', () => {
  // Esta função é a rede de segurança do herói da loja: é ela que garante que nenhuma
  // configuração deixa o fundo por pintar. Sem fundo, o texto branco do herói fica sobre o
  // fundo claro da página e não se lê — e nada no ecrã denuncia a causa.
  it('aceita os quatro modos quando têm o que precisam', () => {
    expect(resolveShopBgMode({ shop_bg_mode: 'gradient' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: 'image', shop_bg_image_url: '/a.webp' })).toBe('image');
    expect(resolveShopBgMode({ shop_bg_mode: 'video', shop_bg_video_url: 'https://v/a.mp4' })).toBe('video');
    expect(resolveShopBgMode({ shop_bg_mode: 'slides' })).toBe('slides');
  });

  it('volta ao gradiente quando falta a imagem ou o vídeo', () => {
    // O painel deixa escolher o modo e limpar o endereço em passos separados, por isso este
    // par existe mesmo: modo escolhido, media por preencher.
    expect(resolveShopBgMode({ shop_bg_mode: 'image' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: 'image', shop_bg_image_url: '' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: 'video' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: 'video', shop_bg_video_url: '' })).toBe('gradient');
  });

  it('não se deixa levar por um modo que não conhece', () => {
    // Um valor escrito à mão na base de dados, ou um modo de uma versão futura.
    expect(resolveShopBgMode({ shop_bg_mode: 'carrossel' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: 'IMAGE' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: 123 })).toBe('gradient');
  });

  it('aguenta não receber nada', () => {
    expect(resolveShopBgMode()).toBe('gradient');
    expect(resolveShopBgMode({})).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: '' })).toBe('gradient');
    expect(resolveShopBgMode({ shop_bg_mode: null })).toBe('gradient');
  });
});

describe('applyShopTheme: cor de destaque', () => {
  it('escurece a cor de destaque até o texto branco do hover se ler', () => {
    applyShopTheme({ primary_color: '#1b365d', accent_color: '#0ea3c8' });
    const hsl = document.documentElement.style.getPropertyValue('--brand-accent-hsl');
    // A cor original (#0ea3c8) dá 2,96:1 com branco; a aplicada já não é essa.
    expect(hsl).not.toBe('');
    const [h, s, l] = hsl.split(' ').map((v) => parseFloat(v));
    expect(h).toBeGreaterThan(180);
    expect(h).toBeLessThan(200);
    expect(s).toBeGreaterThan(50);
    expect(l).toBeLessThan(35);
  });
});
