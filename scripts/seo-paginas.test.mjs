import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIXED_PAGES, SOURCE_URL, bookShareDescription, escapeHtml, fixedPageFile, isSafeId, isSafeSlug, plainSummary,
  renderSharePage, rewriteSiteUrl,
} from './seo-paginas.mjs';

// O index.html real do site: se alguém mudar as etiquetas de partilha, estes testes dizem-no
// antes de o pós-build deixar de gerar as páginas dos livros.
const INDEX = readFileSync(path.resolve(__dirname, '../app/web/index.html'), 'utf8');

const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)" />`))?.[1];

describe('renderSharePage', () => {
  const page = renderSharePage(INDEX, {
    title: 'O Desejado de Todas as Nações',
    description: 'A vida de Cristo.',
    image: 'https://exemplo.invalid/capa.jpg',
    imageAlt: 'Capa de O Desejado de Todas as Nações',
    url: 'https://livrariaadventista.ao/product/abc123',
    type: 'book',
  });

  it('põe o título, a descrição, a capa e o endereço do livro', () => {
    expect(page).toContain('<title>O Desejado de Todas as Nações — Livraria Adventista</title>');
    expect(meta(page, 'property', 'og:title')).toBe('O Desejado de Todas as Nações');
    expect(meta(page, 'property', 'og:description')).toBe('A vida de Cristo.');
    expect(meta(page, 'property', 'og:image')).toBe('https://exemplo.invalid/capa.jpg');
    expect(meta(page, 'name', 'twitter:image')).toBe('https://exemplo.invalid/capa.jpg');
    expect(meta(page, 'property', 'og:url')).toBe('https://livrariaadventista.ao/product/abc123');
    expect(meta(page, 'property', 'og:type')).toBe('book');
    expect(page).toContain('<link rel="canonical" href="https://livrariaadventista.ao/product/abc123" />');
  });

  it('tira as medidas da imagem genérica e usa o cartão pequeno (a capa é vertical)', () => {
    expect(page).not.toContain('og:image:width');
    expect(page).not.toContain('og:image:height');
    expect(meta(page, 'name', 'twitter:card')).toBe('summary');
  });

  it('o resto da página (os scripts da aplicação) fica igual', () => {
    const tail = (html) => html.slice(html.indexOf('</head>'));
    expect(tail(page)).toBe(tail(INDEX));
  });

  it('escapa títulos com aspas e sinais', () => {
    const html = renderSharePage(INDEX, { title: 'Ana & "Os <Outros>"', description: 'x', url: 'https://a.invalid/p' });
    expect(meta(html, 'property', 'og:title')).toBe('Ana &amp; &quot;Os &lt;Outros&gt;&quot;');
    expect(html).not.toContain('"Os <Outros>"');
  });

  it('sem imagem, mantém a imagem e o cartão genéricos', () => {
    const html = renderSharePage(INDEX, { title: 'T', description: 'D', url: 'https://a.invalid/p' });
    expect(meta(html, 'property', 'og:image')).toBe(meta(INDEX, 'property', 'og:image'));
    expect(html).toContain('og:image:width');
  });

  it('rebenta se uma etiqueta deixar de existir no index.html', () => {
    const broken = INDEX.replace(/<meta property="og:url"[^>]*\/>/, '');
    expect(() => renderSharePage(broken, { title: 'T', description: 'D', url: 'https://a.invalid/p' })).toThrow('og:url');
  });
});

describe('textos', () => {
  it('a descrição em HTML do painel passa a texto, cortada numa palavra', () => {
    expect(plainSummary('<p>Uma <strong>obra</strong>&nbsp;clássica &amp; actual.</p>')).toBe('Uma obra clássica & actual.');
    const long = plainSummary(`<p>${'palavra '.repeat(40)}</p>`, 50);
    expect(long.length).toBeLessThanOrEqual(50);
    expect(long.endsWith('…')).toBe(true);
    expect(plainSummary('<script>alert(1)</script>Texto')).toBe('Texto');
  });

  it('sem sinopse, a descrição diz o autor', () => {
    expect(bookShareDescription({ title: 'Caminho a Cristo', author: 'Ellen G. White', description: '' }))
      .toBe('Caminho a Cristo, de Ellen G. White. À venda na Livraria Adventista, com entrega em Angola e levantamento nas lojas.');
    expect(bookShareDescription({ title: 'Hinário', author: '' })).toMatch(/^Hinário\. À venda/);
    expect(bookShareDescription({ title: 'X', description: '<p>Sinopse.</p>' })).toBe('Sinopse.');
  });

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('nomes de ficheiro', () => {
  it('só ids e slugs simples dão ficheiros', () => {
    expect(isSafeId('0666sb896q346k1')).toBe(true);
    expect(isSafeId('../../etc')).toBe(false);
    expect(isSafeId('')).toBe(false);
    expect(isSafeSlug('obras-ellen-white')).toBe(true);
    expect(isSafeSlug('-x')).toBe(false);
    expect(isSafeSlug('a/b')).toBe(false);
  });
});

describe('dados estruturados do index.html', () => {
  const blocks = [...INDEX.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  it('um bloco JSON-LD válido, com a loja e o site no domínio oficial', () => {
    expect(blocks).toHaveLength(1);
    const data = JSON.parse(blocks[0]);
    const types = data['@graph'].map((n) => n['@type']);
    expect(types).toEqual(['Organization', 'WebSite']);
    for (const node of data['@graph']) expect(node.url, node['@type']).toBe(`${SOURCE_URL}/`);
  });

  it('fica no <head>: as páginas de partilha levam-no, e o resto da página não muda', () => {
    expect(INDEX.indexOf('application/ld+json')).toBeLessThan(INDEX.indexOf('</head>'));
    const page = renderSharePage(INDEX, { title: 'T', description: 'D', url: `${SOURCE_URL}/faq` });
    expect(page).toContain(blocks[0]);
  });

  it('numa pré-visualização, os endereços do bloco também mudam', () => {
    const preview = rewriteSiteUrl(INDEX, 'https://abc.exemplo.pages.dev', 'index.html');
    const block = preview.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    expect(JSON.parse(block)['@graph'][0].url).toBe('https://abc.exemplo.pages.dev/');
  });
});

describe('páginas fixas do sitemap', () => {
  const SITEMAP = readFileSync(path.resolve(__dirname, '../app/web/public/sitemap.xml'), 'utf8');
  const fixedInSitemap = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(SOURCE_URL, ''))
    .filter((p) => p && p !== '/');

  it('são exactamente as do sitemap, menos a inicial (que já é o index.html)', () => {
    expect(FIXED_PAGES.map((p) => p.path).sort()).toEqual([...fixedInSitemap].sort());
  });

  it('cada uma tem o seu canonical, o seu título e a sua descrição', () => {
    for (const p of FIXED_PAGES) {
      const html = renderSharePage(INDEX, { title: p.title, description: p.description, url: `${SOURCE_URL}${p.path}` });
      expect(html, p.path).toContain(`<link rel="canonical" href="${SOURCE_URL}${p.path}" />`);
      expect(html, p.path).not.toContain(`<link rel="canonical" href="${SOURCE_URL}/" />`);
      expect(html, p.path).toContain(`<title>${escapeHtml(p.title)} — Livraria Adventista</title>`);
      expect(meta(html, 'name', 'description'), p.path).toBe(escapeHtml(p.description));
      expect(p.description.length, p.path).toBeLessThanOrEqual(160);
    }
  });

  it('o nome do ficheiro sai do caminho, e um caminho estranho recusa-se', () => {
    expect(fixedPageFile('/shop')).toBe('shop.html');
    expect(fixedPageFile('/shipping-returns')).toBe('shipping-returns.html');
    expect(() => fixedPageFile('/../etc')).toThrow('inválido');
    expect(() => fixedPageFile('/a/b')).toThrow('inválido');
    expect(() => fixedPageFile('/')).toThrow('inválido');
  });
});

describe('rewriteSiteUrl', () => {
  it('troca todas as ocorrências pelo destino', () => {
    expect(rewriteSiteUrl(`${SOURCE_URL}/ e ${SOURCE_URL}/shop`, 'https://livrariaadventista.ao/'))
      .toBe('https://livrariaadventista.ao/ e https://livrariaadventista.ao/shop');
  });
  it('com o destino igual à origem não mexe', () => {
    expect(rewriteSiteUrl('sem endereço', SOURCE_URL)).toBe('sem endereço');
  });
  it('recusa um ficheiro que já não tem o endereço de origem', () => {
    expect(() => rewriteSiteUrl('nada aqui', 'https://a.invalid', 'robots.txt')).toThrow('robots.txt');
  });
  it('o index.html do site tem o endereço de origem (senão o pós-build pára o deploy)', () => {
    expect(INDEX).toContain(SOURCE_URL);
  });
});

describe('domínio oficial nos ficheiros do repositório', () => {
  // Um build publicado sem o pós-build (outro caminho de deploy, um passo saltado) sai com o
  // que estiver escrito aqui: tem de ser o domínio oficial, e não um projecto antigo.
  it('index.html, sitemap.xml e robots.txt só falam do livrariaadventista.ao', () => {
    for (const name of ['index.html', 'public/sitemap.xml', 'public/robots.txt']) {
      const text = readFileSync(path.resolve(__dirname, '../app/web', name), 'utf8');
      expect(text, name).toContain(SOURCE_URL);
      expect(text, name).not.toMatch(/pages\.dev|livrariaadventista\.com/);
    }
    expect(SOURCE_URL).toBe('https://livrariaadventista.ao');
  });

  it('uma pré-visualização continua a receber o seu próprio endereço', () => {
    expect(rewriteSiteUrl(`<loc>${SOURCE_URL}/shop</loc>`, 'https://abc.livraria-editora-adventista-ben.pages.dev'))
      .toBe('<loc>https://abc.livraria-editora-adventista-ben.pages.dev/shop</loc>');
  });
});
