import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ler de uma variante um campo que ninguém lá põe.
 *
 * Três achados desta auditoria foram o mesmo erro, e nenhum deles é apanhado pelo lint — um
 * acesso a propriedade não é uma variável por declarar, por isso `no-undef` não o vê:
 *
 * - **18**: `autoCode` (esse era uma variável, e rebentava o render do formulário de livros
 *   em produção);
 * - **92**: o mega-menu lia só `price_formatted` e anunciava o preço de tabela de um livro
 *   em promoção;
 * - **97**: o aviso do carrinho lia `variant.name`, que não existe, e dizia sempre
 *   "Edição Standard" — mesmo quando se escolhia o tamanho M.
 *
 * Este teste é o mesmo desenho do `queryFields.test.js`, que confere as colunas das consultas
 * contra as migrações: aqui a forma de referência é a que o `bookToProduct` e o `getProduct`
 * constroem, lida do próprio `EcommerceApi.js`. Um campo novo numa variante passa a ser
 * legível sem tocar neste ficheiro; um campo imaginado é recusado.
 *
 * Porque é que isto é preciso: a palavra "variante" designava duas formas diferentes no
 * código — a entrada crua de `stock_books.versions`, que a equipa escreve no painel
 * (`label`, `format`, `price`, `stock`), e a variante de produto que o site usa (`title`,
 * `price_in_cents`, `inventory_quantity`). O `pricing.js` chama à primeira `versao`,
 * precisamente para as separar.
 */

const SRC = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Uma leitura de campo numa variante. A classe de caracteres aceita maiúsculas de propósito:
 * com só minúsculas, `variant.naoExiste` era lido como `nao` — e um nome em camelCase cujo
 * prefixo coincidisse com um campo real (`variant.titleCurto` → `title`) passava sem ser
 * notado. Foi o próprio teste de controlo, mais abaixo, que apanhou isto.
 */
const LEITURA = /\b(variant|selectedVariant)\s*\??\.\s*([A-Za-z_][A-Za-z0-9_]*)/g;

/** Todos os `.js`/`.jsx` de `src`, sem os testes. */
function ficheirosDoSite() {
  const lista = [];
  (function andar(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (/\.jsx?$/.test(e.name) && !/\.test\./.test(e.name)) lista.push(p);
    }
  })(SRC);
  return lista;
}

/** Sem comentários: um campo citado numa explicação não é uma leitura. */
const semComentarios = (txt) => txt
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Os campos que o `EcommerceApi` escreve numa variante de produto. */
function camposDaVariante() {
  const api = fs.readFileSync(path.join(SRC, 'api/EcommerceApi.js'), 'utf8');
  const recorte = (inicio, fim) => {
    const i = api.indexOf(inicio);
    if (i < 0) throw new Error(`"${inicio}" não encontrado em EcommerceApi.js`);
    const j = api.indexOf(fim, i);
    return api.slice(i, j > i ? j : undefined);
  };
  const campos = new Set();
  for (const bloco of [
    recorte('const variant = {', '};'),              // a variante única (`-default`)
    recorte('product.variants = extraVersions.map', 'return product;'), // as edições/tamanhos
  ]) {
    for (const m of semComentarios(bloco).matchAll(/^\s{4,}([a-z_][a-z0-9_]*)\s*:/gim)) campos.add(m[1]);
  }
  return campos;
}

/** Onde é que o código lê `variant.algo`, `selectedVariant?.algo`, `item.variant.algo`. */
function leiturasDeVariante() {
  const lidos = new Map();
  for (const f of ficheirosDoSite()) {
    const txt = semComentarios(fs.readFileSync(f, 'utf8'));
    for (const m of txt.matchAll(LEITURA)) {
      const campo = m[2];
      if (!lidos.has(campo)) lidos.set(campo, new Set());
      lidos.get(campo).add(path.relative(SRC, f));
    }
  }
  return lidos;
}

/**
 * Campos que não vêm do `EcommerceApi` mas são legítimos. Cada um com a razão — uma entrada
 * sem razão é um campo imaginado à espera de dar problema.
 */
const EXTRAS = {
  // `refreshCart` reescreve-os ao revalidar o carrinho (hooks/useCart.jsx).
  price_in_cents: 'reposto pelo refreshCart',
  sale_price_in_cents: 'reposto pelo refreshCart',
  price_formatted: 'reposto pelo refreshCart',
  sale_price_formatted: 'reposto pelo refreshCart',
  inventory_quantity: 'reposto pelo refreshCart',
};

describe('campos de uma variante de produto', () => {
  it('o EcommerceApi continua a construir a forma que o resto do site espera', () => {
    const campos = camposDaVariante();
    for (const obrigatorio of ['id', 'title', 'price_in_cents', 'inventory_quantity', 'manage_inventory']) {
      expect(campos, `o EcommerceApi deixou de pôr "${obrigatorio}" na variante`).toContain(obrigatorio);
    }
  });

  it('ninguém lê um campo que a variante não tem', () => {
    const existem = camposDaVariante();
    const inventados = [];
    for (const [campo, onde] of leiturasDeVariante()) {
      if (existem.has(campo) || campo in EXTRAS) continue;
      inventados.push(`variant.${campo} — lido em ${[...onde].join(', ')}`);
    }
    expect(inventados, [
      'Estes campos são lidos de uma variante mas ninguém os lá põe.',
      'Ou o nome está errado (foi o achado 97: `variant.name`, que não existe, dava sempre',
      '"Edição Standard"), ou o campo é novo e falta acrescentá-lo ao `bookToProduct`.',
      'Se for legítimo e vier de outro sítio, acrescente-o a EXTRAS com a razão.',
    ].join(' ')).toEqual([]);
  });

  it('o próprio teste apanha um campo imaginado', () => {
    // Guarda do guarda: sem isto, um erro na expressão regular fazia o teste acima passar
    // sempre e ninguém dava por isso.
    const existem = camposDaVariante();
    expect(existem.has('name')).toBe(false);
    expect(existem.has('title')).toBe(true);
    expect([...'x'.matchAll(LEITURA)]).toHaveLength(0);
    const amostra = 'const x = variant?.naoExiste; const y = selectedVariant.title;';
    const achados = [...amostra.matchAll(LEITURA)].map((m) => m[2]);
    expect(achados).toEqual(['naoExiste', 'title']);
  });

  it('os comentários não contam como leituras', () => {
    // O comentário do `useCart` cita `variant.name` a explicar o achado 97.
    expect(semComentarios('// lia variant.name\nconst a = variant.title;')).not.toContain('variant.name');
    expect(semComentarios('/* variant.name */ const a = 1;')).not.toContain('variant.name');
  });
});
