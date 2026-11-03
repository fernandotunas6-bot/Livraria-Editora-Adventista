import { describe, expect, it } from 'vitest';
import { isPersistableImageUrl, normalizeImageUrl, sanitizeImageUrlForSave, toSiteRelativeUrl } from './imageUrl';

describe('toSiteRelativeUrl', () => {
  it('tira o endereço do próprio site, em qualquer dos projectos e no domínio .ao', () => {
    expect(toSiteRelativeUrl('https://livraria-adventista.pages.dev/images/site/slide-1.webp')).toBe('/images/site/slide-1.webp');
    expect(toSiteRelativeUrl('https://livraria-editora-adventista.pages.dev/images/a.png?v=2')).toBe('/images/a.png?v=2');
    expect(toSiteRelativeUrl('https://main.livraria-adventista.pages.dev/images/a.png')).toBe('/images/a.png');
    expect(toSiteRelativeUrl('https://www.livrariaadventista.ao/images/a.png')).toBe('/images/a.png');
  });

  it('deixa como estão os endereços de outros sites', () => {
    const fora = [
      'https://images.unsplash.com/photo-1?w=800',
      'https://bggqkjjqbjhbjsckzopj.supabase.co/storage/v1/object/public/media/a.jpg',
      // Parecidos, mas não são o site: não podem passar a caminho relativo.
      'https://livraria-adventista.pages.dev.exemplo.invalid/a.png',
      'https://outra-livraria-adventista.pages.dev.invalid/a.png',
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
