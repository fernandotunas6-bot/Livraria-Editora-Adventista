// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import { describe, expect, it } from 'vitest';
import { isPersistableImageUrl, normalizeImageUrl, sanitizeImageUrlForSave, siteSrcSet, toSiteRelativeUrl } from './imageUrl';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import SLIDE_VARIANTS from './slideVariants.json';

describe('toSiteRelativeUrl', () => {
  it('tira o endereço do próprio site, em qualquer dos projectos e nos domínios próprios', () => {
    expect(toSiteRelativeUrl('https://livraria-adventista.pages.dev/images/site/slide-1.webp')).toBe('/images/site/slide-1.webp');
    expect(toSiteRelativeUrl('https://livraria-editora-adventista.pages.dev/images/a.png?v=2')).toBe('/images/a.png?v=2');
    expect(toSiteRelativeUrl('https://main.livraria-adventista.pages.dev/images/a.png')).toBe('/images/a.png');
    expect(toSiteRelativeUrl('https://www.livrariaadventista.ao/images/a.png')).toBe('/images/a.png');
    expect(toSiteRelativeUrl('https://livrariaadventista.com/images/a.png')).toBe('/images/a.png');
    expect(toSiteRelativeUrl('https://www.livrariaadventista.com/images/a.png')).toBe('/images/a.png');
    expect(toSiteRelativeUrl('https://livraria-editora-adventista-ben.pages.dev/images/a.png')).toBe('/images/a.png');
    expect(toSiteRelativeUrl('https://main.livraria-editora-adventista-ben.pages.dev/images/a.png')).toBe('/images/a.png');
  });

  it('deixa como estão os endereços de outros sites', () => {
    const fora = [
      'https://images.unsplash.com/photo-1?w=800',
      'https://bggqkjjqbjhbjsckzopj.supabase.co/storage/v1/object/public/media/a.jpg',
      // Parecidos, mas não são o site: não podem passar a caminho relativo.
      'https://livraria-adventista.pages.dev.exemplo.invalid/a.png',
      'https://outra-livraria-adventista.pages.dev.invalid/a.png',
      'https://livrariaadventista.com.exemplo.invalid/a.png',
      'https://livraria-editora-adventista-bento.pages.dev/a.png',
    ];
    for (const u of fora) expect(toSiteRelativeUrl(u)).toBe(u);
  });

  it('aceita vazio e caminhos já relativos', () => {
    expect(toSiteRelativeUrl('')).toBe('');
    expect(toSiteRelativeUrl(undefined)).toBe('');
    expect(toSiteRelativeUrl('/images/a.png')).toBe('/images/a.png');
  });
});

describe('guardar imagens', () => {
  it('guarda caminhos do site e URLs https, e recusa o resto', () => {
    expect(isPersistableImageUrl('/images/site/opcoes/a.webp')).toBe(true);
    expect(isPersistableImageUrl('https://cdn.exemplo.invalid/a.jpg')).toBe(true);
    expect(isPersistableImageUrl('blob:https://x/1')).toBe(false);
    expect(isPersistableImageUrl('javascript:alert(1)')).toBe(false);
    expect(isPersistableImageUrl('imagem.png')).toBe(false);
  });

  it('um endereço completo do site é guardado como caminho relativo', () => {
    expect(sanitizeImageUrlForSave('https://livraria-adventista.pages.dev/images/a.png')).toBe('/images/a.png');
    expect(normalizeImageUrl('  https://livraria-adventista.pages.dev/images/a.png ')).toBe('/images/a.png');
  });

  it('"//outro.site" não é tratado como caminho do site', () => {
    expect(normalizeImageUrl('//cdn.exemplo.invalid/a.png')).toBe('https://cdn.exemplo.invalid/a.png');
  });
});

describe('siteSrcSet', () => {
  it('um slide do site ganha as variantes de 960 e 1280 px', () => {
    expect(siteSrcSet('/images/site/slide-catalogo.webp')).toBe(
      '/images/site/960/slide-catalogo.webp 960w, /images/site/1280/slide-catalogo.webp 1280w, /images/site/slide-catalogo.webp 1920w');
    expect(siteSrcSet('/images/site/opcoes/slide-saude-destaque.webp')).toBe(
      '/images/site/960/opcoes/slide-saude-destaque.webp 960w, /images/site/1280/opcoes/slide-saude-destaque.webp 1280w, '
      + '/images/site/opcoes/slide-saude-destaque.webp 1920w');
  });

  it('com o endereço completo do próprio site também (slides gravados com o domínio)', () => {
    expect(siteSrcSet('https://livrariaadventista.ao/images/site/slide-catalogo.webp?v=2'))
      .toMatch(/^\/images\/site\/960\/slide-catalogo\.webp 960w, /);
  });

  it('o resto fica sem srcset: imagens do painel, de outros sites, sem variante', () => {
    expect(siteSrcSet('https://bggqkjjqbjhbjsckzopj.supabase.co/storage/v1/object/public/media/x.webp')).toBe('');
    expect(siteSrcSet('/images/site/loja-banner.webp')).toBe('');
    expect(siteSrcSet('')).toBe('');
    expect(siteSrcSet(undefined)).toBe('');
  });

  it('cada variante da lista existe em public/', () => {
    for (const path of SLIDE_VARIANTS) {
      expect(existsSync(resolve(__dirname, '../../public', path.replace(/^\//, '')))).toBe(true);
      for (const w of [960, 1280]) {
        expect(existsSync(resolve(__dirname, '../../public', path.replace(/^\/images\/site\//, `images/site/${w}/`)))).toBe(true);
      }
    }
    expect(SLIDE_VARIANTS.length).toBeGreaterThanOrEqual(20);
  });
});
