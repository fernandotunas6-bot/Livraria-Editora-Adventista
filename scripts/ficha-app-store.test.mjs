import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APARELHOS, PAGINAS, nomeDaCaptura, pixeis } from './capturas-app-store.mjs';

// A ficha da App Store (app/ios/fastlane/metadata) e as capturas (scripts/capturas-app-store.mjs):
// a App Store Connect recusa o envio inteiro quando um texto passa do limite ou uma imagem não
// tem um dos tamanhos dela. Melhor saber aqui do que no fim do workflow.

const META = resolve(__dirname, '../app/ios/fastlane/metadata');
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

describe('capturas de ecrã', () => {
  it('nos tamanhos que a App Store aceita (iPhone 6,9" e iPad 13")', () => {
    const aceites = ['1320x2868', '1290x2796', '2064x2752', '2048x2732'];
    for (const a of APARELHOS) {
      const { largura, altura } = pixeis(a);
      expect(aceites).toContain(`${largura}x${altura}`);
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
  const manifesto = readFileSync(resolve(__dirname, '../app/ios/ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
  const xcode = readFileSync(resolve(__dirname, '../app/ios/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');

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
