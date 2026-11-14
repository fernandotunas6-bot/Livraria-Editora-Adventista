import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOME_CURTO_MAX, manifestoDaApp, nomeCurto, tituloDaAppNoIphone } from './pwa-manifesto.mjs';

const MANIFESTO = readFileSync(resolve(__dirname, '../app/web/public/manifest.webmanifest'), 'utf8');
const INDEX = readFileSync(resolve(__dirname, '../app/web/index.html'), 'utf8');

describe('manifesto da app', () => {
  it('leva o nome, o nome curto e a cor do painel', () => {
    const m = JSON.parse(manifestoDaApp(MANIFESTO, {
      site_name: 'Livraria Adventista', pwa_name: 'Livraria Adventista', pwa_short_name: 'Livraria SWA', pwa_theme_color: '#0c4a6e',
    }));
    expect(m.name).toBe('Livraria Adventista');
    // O caso que motivou isto: o painel dizia «Livraria SWA» e o ícone mostrava «LA».
    expect(m.short_name).toBe('Livraria SWA');
    expect(m.theme_color).toBe('#0c4a6e');
  });

  it('sem nome da app, usa o nome da loja', () => {
    const m = JSON.parse(manifestoDaApp(MANIFESTO, { site_name: 'Loja X', pwa_name: '' }));
    expect(m.name).toBe('Loja X');
  });

  it('o que vem vazio ou inválido fica como está no ficheiro', () => {
    const original = JSON.parse(MANIFESTO);
    const m = JSON.parse(manifestoDaApp(MANIFESTO, { pwa_short_name: '   ', pwa_theme_color: 'azul; display:none' }));
    expect(m.short_name).toBe(original.short_name);
    expect(m.theme_color).toBe(original.theme_color);
    expect(m.name).toBe(original.name);
  });

  it('não mexe em mais nada do manifesto', () => {
    const original = JSON.parse(MANIFESTO);
    const m = JSON.parse(manifestoDaApp(MANIFESTO, { pwa_name: 'Outra', pwa_short_name: 'Outra', pwa_theme_color: '#123456' }));
    for (const campo of ['id', 'start_url', 'scope', 'display', 'icons', 'background_color', 'lang', 'orientation']) {
      expect(m[campo]).toEqual(original[campo]);
    }
  });

  it('corta o nome curto num espaço, sem deixar meia palavra', () => {
    expect(nomeCurto('Livraria Adventista Angola')).toBe('Livraria');
    expect(nomeCurto('Supercalifragilístico')).toHaveLength(NOME_CURTO_MAX);
    expect(nomeCurto('  Livraria   SWA ')).toBe('Livraria SWA');
  });
});

describe('o manifesto do repositório', () => {
  const m = JSON.parse(MANIFESTO);

  it('tem um nome curto que se reconhece por baixo do ícone', () => {
    // «LA» não dizia nada a ninguém. Este é o que vale se as definições não responderem.
    expect(m.short_name).not.toBe('LA');
    expect(m.short_name.length).toBeLessThanOrEqual(NOME_CURTO_MAX);
  });

  it('tem id igual ao que o Chrome calculava, para não mudar a identidade de quem já instalou', () => {
    // Sem `id`, o Chrome usa o start_url. Escrevê-lo igual não reinstala nada.
    expect(new URL(m.id, 'https://x.ao/').href).toBe(new URL(m.start_url, 'https://x.ao/').href);
  });

  it('o ícone SVG declara sizes "any"', () => {
    const svg = m.icons.filter((i) => i.type === 'image/svg+xml');
    expect(svg.length).toBeGreaterThan(0);
    expect(svg.every((i) => i.sizes === 'any')).toBe(true);
  });

  it('tem ícones PNG de 192 e de 512, os dois tamanhos que o Android pede', () => {
    const png = m.icons.filter((i) => i.type === 'image/png').map((i) => i.sizes);
    expect(png).toContain('192x192');
    expect(png).toContain('512x512');
  });
});

describe('título da app no iPhone', () => {
  it('fica com o nome curto do painel', () => {
    const html = tituloDaAppNoIphone(INDEX, { pwa_name: 'Livraria Adventista', pwa_short_name: 'Livraria SWA' });
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Livraria SWA" />');
  });

  it('sem nome curto, fica o nome da app', () => {
    const html = tituloDaAppNoIphone(INDEX, { pwa_name: 'Livraria Adventista' });
    expect(html).toContain('content="Livraria Adventista"');
  });

  it('escapa o que vem do painel', () => {
    const html = tituloDaAppNoIphone(INDEX, { pwa_short_name: '"><script>' });
    expect(html).not.toContain('"><script>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('sem definições, o index.html fica como está', () => {
    expect(tituloDaAppNoIphone(INDEX, {})).toBe(INDEX);
  });

  it('pára se o index.html deixar de ter a etiqueta', () => {
    expect(() => tituloDaAppNoIphone('<html><head></head></html>', { pwa_short_name: 'X' })).toThrow(/apple-mobile-web-app-title/);
  });
});
