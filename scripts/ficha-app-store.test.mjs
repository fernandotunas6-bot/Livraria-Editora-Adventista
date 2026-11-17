import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APARELHOS, PAGINAS, nomeDaCaptura, pixeis } from './capturas-app-store.mjs';

// As fichas da App Store e da Play Store (app/mobile/fastlane/metadata/{ios,android}) e as capturas
// (scripts/capturas-app-store.mjs): as lojas recusam o envio inteiro quando um texto passa do
// limite ou uma imagem não tem um dos tamanhos delas. Melhor saber aqui do que no fim do workflow.

const META = resolve(__dirname, '../app/mobile/fastlane/metadata/ios');
const META_ANDROID = resolve(__dirname, '../app/mobile/fastlane/metadata/android');
const ler = (f) => readFileSync(resolve(META, f), 'utf8').trim();

describe('textos da ficha (pt-PT)', () => {
  // Os limites da App Store Connect, em caracteres.
  const LIMITES = {
    'name.txt': 30,
    'subtitle.txt': 30,
    'keywords.txt': 100,
    'promotional_text.txt': 170,
    'description.txt': 4000,
    'release_notes.txt': 4000,
  };

  for (const [ficheiro, max] of Object.entries(LIMITES)) {
    it(`${ficheiro} cabe em ${max} caracteres`, () => {
      const texto = ler(`pt-PT/${ficheiro}`);
      expect(texto.length).toBeGreaterThan(0);
      expect([...texto].length).toBeLessThanOrEqual(max);
    });
  }

  it('palavras-chave separadas por vírgulas, sem espaços à volta nem repetidas', () => {
    const palavras = ler('pt-PT/keywords.txt').split(',');
    expect(palavras.every((p) => p === p.trim() && p.length > 0)).toBe(true);
    expect(new Set(palavras.map((p) => p.toLowerCase())).size).toBe(palavras.length);
  });

  it('os endereços são do site, em https', () => {
    for (const f of ['support_url.txt', 'marketing_url.txt', 'privacy_url.txt']) {
      expect(ler(`pt-PT/${f}`)).toMatch(/^https:\/\/livrariaadventista\.ao(\/|$)/);
    }
  });

  it('a ficha não promete comprar livros digitais no app (regra 3.1.1)', () => {
    const texto = `${ler('pt-PT/description.txt')}\n${ler('pt-PT/promotional_text.txt')}`.toLowerCase();
    expect(texto).not.toMatch(/compr\w* (o |os |as )?(livros? )?digita|edi[cç][aã]o digital à venda/);
  });

  it('categorias que o fastlane conhece', () => {
    expect(['SHOPPING', 'BOOKS']).toContain(ler('primary_category.txt'));
    expect(['SHOPPING', 'BOOKS']).toContain(ler('secondary_category.txt'));
  });
});

describe('textos da ficha da Play Store (pt-PT)', () => {
  const lerAndroid = (f) => readFileSync(resolve(META_ANDROID, f), 'utf8').trim();
  const LIMITES = { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000 };

  for (const [ficheiro, max] of Object.entries(LIMITES)) {
    it(`${ficheiro} cabe em ${max} caracteres`, () => {
      const texto = lerAndroid(`pt-PT/${ficheiro}`);
      expect(texto.length).toBeGreaterThan(0);
      expect([...texto].length).toBeLessThanOrEqual(max);
    });
  }

  it('não fala do iPhone nem da Apple, nem promete livros digitais à venda', () => {
    const texto = `${lerAndroid('pt-PT/full_description.txt')}\n${lerAndroid('pt-PT/short_description.txt')}`;
    expect(texto).not.toMatch(/iPhone|iPad|Apple/);
    expect(texto.toLowerCase()).not.toMatch(/compr\w* (o |os |as )?(livros? )?digita/);
  });
});

describe('imagens da ficha da Play Store', () => {
  // A Play Console não deixa publicar sem estas duas, e recusa outros tamanhos.
  const tamanhoPng = (f) => {
    const b = readFileSync(resolve(META_ANDROID, 'pt-PT/images', f));
    expect(b.subarray(1, 4).toString()).toBe('PNG');
    return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  };

  it('o ícone de 512 x 512 e o gráfico de destaque de 1024 x 500', () => {
    expect(tamanhoPng('icon.png')).toBe('512x512');
    expect(tamanhoPng('featureGraphic.png')).toBe('1024x500');
  });
});

describe('capturas de ecrã', () => {
  it('nos tamanhos que a App Store aceita (iPhone 6,9" e iPad 13")', () => {
    const aceites = ['1320x2868', '1290x2796', '2064x2752', '2048x2732'];
    for (const a of APARELHOS.filter((x) => x.loja === 'apple')) {
      const { largura, altura } = pixeis(a);
      expect(aceites).toContain(`${largura}x${altura}`);
    }
  });

  it('nos tamanhos que a Play Store aceita (entre 320 e 3840 px, o lado maior até ao dobro do menor)', () => {
    const android = APARELHOS.filter((x) => x.loja === 'google');
    expect(android.length).toBeGreaterThan(0);
    for (const a of android) {
      const { largura, altura } = pixeis(a);
      for (const lado of [largura, altura]) expect(lado).toBeGreaterThanOrEqual(320);
      for (const lado of [largura, altura]) expect(lado).toBeLessThanOrEqual(3840);
      expect(Math.max(largura, altura) / Math.min(largura, altura)).toBeLessThanOrEqual(2);
    }
  });

  it('no máximo 10 por aparelho, com nomes únicos e pela ordem', () => {
    expect(PAGINAS.length).toBeLessThanOrEqual(10);
    const nomes = APARELHOS.flatMap((a) => PAGINAS.map((p) => nomeDaCaptura(a, p)));
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(PAGINAS.map((p) => p.id)).toEqual([...PAGINAS.map((p) => p.id)].sort());
  });
});

describe('manifesto de privacidade', () => {
  const manifesto = readFileSync(resolve(__dirname, '../app/mobile/ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
  const xcode = readFileSync(resolve(__dirname, '../app/mobile/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

  it('sem rastreio, e entra no app', () => {
    expect(manifesto).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifesto).not.toMatch(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
    expect(xcode).toContain('PrivacyInfo.xcprivacy in Resources');
  });

  it('declara a localização precisa e o contacto (o que o site recolhe)', () => {
    for (const tipo of ['PreciseLocation', 'Name', 'EmailAddress', 'PhoneNumber', 'PhysicalAddress', 'PurchaseHistory']) {
      expect(manifesto).toContain(`NSPrivacyCollectedDataType${tipo}<`);
    }
  });
});
