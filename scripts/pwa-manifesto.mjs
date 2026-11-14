// A app instalada (PWA) com o nome e a cor que estão no painel.
//
// O painel tem, em Configurações, o «Nome da App», o «Nome Curto (ícone)» e a cor do tema. A
// cor já chegava ao site (o useSiteSettings põe-na no `theme-color`), mas o nome e o nome curto
// não chegavam a lado nenhum: o manifesto é um ficheiro fixo, e dizia `"short_name": "LA"`.
// Quem instalava a app via «LA» por baixo do ícone — mesmo depois de o dono ter escrito
// «Livraria SWA» no painel.
//
// O pós-build (seo-catalogo.mjs) lê as definições públicas, as mesmas que o site lê, e escreve
// com elas o manifesto e o título da app no iPhone. Uma mudança no painel chega assim ao ícone
// na publicação seguinte do site. Funções puras: sem rede nem disco (pwa-manifesto.test.mjs).

import { escapeHtml } from './seo-paginas.mjs';

/** O que cabe por baixo de um ícone sem ser cortado; o painel já limita o campo a isto. */
export const NOME_CURTO_MAX = 12;

const COR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const limpo = (valor) => String(valor ?? '').replace(/\s+/g, ' ').trim();

/** Corta um nome no limite, de preferência num espaço, para não ficar meia palavra. */
export function nomeCurto(valor, max = NOME_CURTO_MAX) {
  const nome = limpo(valor);
  if (nome.length <= max) return nome;
  const espaco = nome.lastIndexOf(' ', max);
  return (espaco > 0 ? nome.slice(0, espaco) : nome.slice(0, max)).trim();
}

/**
 * O manifesto com o nome, o nome curto e a cor do painel. O que vier vazio ou inválido fica
 * como está no ficheiro do repositório — que é o que vale quando as definições não respondem.
 */
export function manifestoDaApp(texto, definicoes = {}) {
  const manifesto = JSON.parse(texto);
  const nome = limpo(definicoes.pwa_name) || limpo(definicoes.site_name);
  const curto = nomeCurto(definicoes.pwa_short_name);
  const cor = limpo(definicoes.pwa_theme_color);
  if (nome) manifesto.name = nome;
  if (curto) manifesto.short_name = curto;
  if (COR.test(cor)) manifesto.theme_color = cor;
  return `${JSON.stringify(manifesto, null, 2)}\n`;
}

/**
 * O nome que o iPhone propõe ao «Adicionar ao ecrã principal». O iPhone não lê o `short_name`
 * do manifesto: lê esta etiqueta, e cortava o nome inteiro («Livraria Adve…»). Fica o nome
 * curto, que é o que foi pensado para caber por baixo do ícone.
 */
export function tituloDaAppNoIphone(html, definicoes = {}) {
  const titulo = nomeCurto(definicoes.pwa_short_name) || limpo(definicoes.pwa_name) || limpo(definicoes.site_name);
  if (!titulo) return html;
  const etiqueta = /<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/?>/i;
  if (!etiqueta.test(html)) throw new Error('o index.html já não tem a etiqueta apple-mobile-web-app-title: o build mudou');
  return html.replace(etiqueta, `<meta name="apple-mobile-web-app-title" content="${escapeHtml(titulo)}" />`);
}
