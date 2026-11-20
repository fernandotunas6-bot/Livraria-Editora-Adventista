// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/** Utilitários das lojas físicas (mapas, direcções e coordenadas GPS). */

import { safeLinkUrl } from './safeLink';

export const hasCoords = (store) =>
  Number.isFinite(Number(store?.latitude)) && Number.isFinite(Number(store?.longitude))
  && !(Number(store.latitude) === 0 && Number(store.longitude) === 0);

/**
 * Link para abrir a loja no Google Maps. O `maps_url` escrito no painel passa pelo
 * `safeLinkUrl`, como as outras ligações vindas da configuração: um `javascript:` ou um endereço
 * sem esquema (`maps.google.com/…`, que o navegador tratava como caminho do site) dão lugar ao
 * link pelas coordenadas ou pela morada.
 */
export function mapsUrl(store) {
  const proprio = safeLinkUrl(store?.maps_url);
  if (/^https?:/i.test(proprio)) return proprio;
  if (hasCoords(store)) return `https://www.google.com/maps?q=${store.latitude},${store.longitude}&z=16`;
  const q = [store?.name, store?.address, store?.province, 'Angola'].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

/** Link de "Como chegar" (direcções a partir da localização do visitante). */
export function directionsUrl(store) {
  const dest = hasCoords(store)
    ? `${store.latitude},${store.longitude}`
    : [store?.address, store?.province, 'Angola'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/**
 * Mapa incorporável: Google Maps se houver chave configurada, senão OpenStreetMap (não precisa de chave).
 */
export function mapEmbedUrl(store, googleKey) {
  if (!hasCoords(store)) return '';
  const lat = Number(store.latitude);
  const lng = Number(store.longitude);
  if (googleKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${googleKey}&q=${lat},${lng}&zoom=16`;
  }
  const d = 0.006;
  const bbox = [lng - d, lat - d * 0.6, lng + d, lat + d * 0.6].map((n) => n.toFixed(5)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

/** Extrai latitude/longitude de um link do Google Maps ou de "lat, lng" colado. */
export function parseCoords(text) {
  const s = String(text || '').trim();
  const patterns = [
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

/** Número para wa.me (prefixo 244 de Angola). */
export function whatsappLink(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const num = digits.startsWith('244') ? digits : `244${digits.replace(/^0/, '')}`;
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// Fotografias das lojas (galeria) -------------------------------------------------------------
//
// As fotografias chegam das próprias lojas e ficam no site, em dois tamanhos gerados por
// `scripts/imagens/lojas.py`: `/images/lojas/<ficheiro>.webp` com 1280 px e
// `/images/lojas/480/<ficheiro>.webp` com 480 px. A miniatura do cartão da loja tem menos de
// 100 px de largura — sem isto, descarregava os 1280 px (uns 110 KB) para a mostrar aí.

/** Larguras com variante gerada; as mesmas do script `scripts/imagens/lojas.py`. */
const LARGURAS_LOJA = [480, 1280];

/** `srcset` de uma fotografia de loja guardada no próprio site; vazio para qualquer outra URL. */
export function lojaSrcSet(url) {
  const path = String(url || '').split(/[?#]/)[0];
  if (!/^\/images\/lojas\/[^/]+\.webp$/.test(path)) return '';
  return LARGURAS_LOJA
    .map((w) => `${w === 1280 ? path : path.replace('/images/lojas/', `/images/lojas/${w}/`)} ${w}w`)
    .join(', ');
}

/**
 * A galeria de uma loja, sempre como lista de `{ url, caption }`.
 *
 * A coluna aceita tanto `["/images/…"]` como `[{ url, caption }]` — quem carrega fotografias de
 * uma loja nova não tem de escrever legendas — e pode chegar como texto JSON, conforme o
 * caminho que trouxe o registo. Uma galeria mal formada devolve uma lista vazia em vez de
 * rebentar a página das lojas.
 */
export function storeGallery(store) {
  let bruta = store?.gallery;
  if (typeof bruta === 'string') {
    try { bruta = JSON.parse(bruta); } catch { return []; }
  }
  if (!Array.isArray(bruta)) return [];
  return bruta
    .map((item) => (typeof item === 'string' ? { url: item, caption: '' } : {
      url: String(item?.url || ''),
      caption: String(item?.caption || ''),
    }))
    .filter((f) => f.url);
}

/**
 * Limites da galeria, abaixo dos da base de dados (20261113103000_fotografias_das_lojas: no
 * máximo 24 fotografias e 4 KB na coluna). Assim o aviso chega em português e antes de a
 * restrição recusar, que é o que a equipa pode resolver — e com vinte fotografias de endereço
 * longo (as carregadas para o Storage) a coluna ainda fica longe dos 4 KB.
 *
 * Vinte é muito mais do que o mosaico mostra de uma vez (nove); as restantes abrem-se a partir
 * da última peça, que as conta. Uma loja que queira contar a sua história com uma dúzia de
 * fotografias pode fazê-lo sem encher a página a quem só quer saber onde ela fica.
 */
export const GALERIA_MAX_FOTOS = 20;
export const GALERIA_MAX_LEGENDA = 80;
/** Folga para a restrição da coluna (4 KB), com margem para o que o jsonb acrescenta. */
const GALERIA_MAX_BYTES = 3400;

/** A galeria pronta para guardar: sem entradas vazias, legendas aparadas e dentro do limite. */
export function galeriaParaGuardar(photos) {
  return (Array.isArray(photos) ? photos : [])
    .map((f) => ({ url: String(f?.url || '').trim(), caption: String(f?.caption || '').trim().slice(0, GALERIA_MAX_LEGENDA) }))
    .filter((f) => f.url && !f.url.startsWith('blob:'))
    .slice(0, GALERIA_MAX_FOTOS);
}

/**
 * O que impede esta galeria de ser guardada, por extenso, ou '' se não houver nada.
 *
 * Uma fotografia ainda a ser enviada é um `blob:` — um endereço que só existe neste
 * navegador. Guardá-lo deixava a loja com uma imagem partida para toda a gente menos para quem
 * a carregou.
 */
export function erroDaGaleria(photos) {
  const lista = Array.isArray(photos) ? photos : [];
  if (lista.some((f) => String(f?.url || '').startsWith('blob:'))) {
    return 'Há uma fotografia ainda a ser enviada. Espere que termine.';
  }
  if (lista.length > GALERIA_MAX_FOTOS) {
    return `A galeria leva no máximo ${GALERIA_MAX_FOTOS} fotografias.`;
  }
  if (JSON.stringify(galeriaParaGuardar(lista)).length > GALERIA_MAX_BYTES) {
    return 'As fotografias e as legendas ocupam demasiado espaço. Tire alguma ou encurte as legendas.';
  }
  return '';
}

/**
 * A fotografia que representa a loja: a que foi escolhida como miniatura, ou, se não houver, a
 * primeira da galeria.
 *
 * Quem carrega quatro fotografias de uma loja no painel não pensa que ainda falta escolher uma
 * «foto da loja» — e sem ela o cartão ficava com as iniciais, como se a loja não tivesse
 * fotografia nenhuma. O campo da miniatura continua a mandar quando está preenchido: é assim
 * que se escolhe outra que não a primeira.
 */
export function fotoDaLoja(store) {
  return String(store?.image_url || '').trim() || storeGallery(store)[0]?.url || '';
}

/** Quantas fotografias cabem no mosaico antes de a última passar a contar as restantes. */
export const GALERIA_MOSAICO = 9;

/**
 * A forma de cada peça do mosaico das fotografias da loja, numa grelha de quatro colunas.
 *
 * A primeira fotografia é a que a loja pôs à frente (a fachada, a montra) e fica grande; as
 * outras acompanham-na em pequeno. A última linha ganha peças mais largas quando as fotografias
 * não dão um número certo de quadrados — senão ficava um buraco no canto, que é o que estraga
 * um mosaico. Em contas: a soma das células é sempre múltipla de quatro.
 */
export function mosaicoDaGaleria(total) {
  const n = Math.min(Math.max(Number(total) || 0, 0), GALERIA_MOSAICO);
  if (n <= 0) return [];
  if (n === 1) return ['col-span-4 row-span-3'];
  if (n === 2) return ['col-span-2 row-span-3', 'col-span-2 row-span-3'];
  if (n === 3) return ['col-span-2 row-span-2', 'col-span-2 row-span-1', 'col-span-2 row-span-1'];
  if (n === 4) return ['col-span-2 row-span-2', 'col-span-2 row-span-1', 'col-span-1 row-span-1', 'col-span-1 row-span-1'];
  // A primeira num quadrado de 2×2; as quatro seguintes completam as duas primeiras linhas.
  const pecas = ['col-span-2 row-span-2', ...Array(n - 1).fill('col-span-1 row-span-1')];
  // O que sobra para as linhas de baixo, alargado para fechar a última.
  const resto = (n - 5) % 4;
  if (resto === 1) pecas[n - 1] = 'col-span-4 row-span-1';
  if (resto === 2) pecas[n - 2] = pecas[n - 1] = 'col-span-2 row-span-1';
  if (resto === 3) pecas[n - 1] = 'col-span-2 row-span-1';
  return pecas;
}

/**
 * A cidade no nome da loja, como o separador Lojas o escreve: «Livraria Adventista — Lubango» →
 * «Lubango». Vazia quando o nome não segue esse modelo. Serve ao rodapé do painel de vendas e à
 * página do produto («Disponível em: Huambo · Lubango»).
 */
export function cidadeDaLoja(store) {
  const m = String(store?.name || '').match(/^\s*livraria\s+(?:e\s+editora\s+)?adventista\b[\s—–-]*(\S.*)$/i);
  return m ? m[1].trim() : '';
}

const semAcentos = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * As províncias que a loja serve, para mostrar ao cliente: a lista do painel (Lojas →
 * «Províncias que serve»; migração lojas_donas_dos_dados) ou, sem lista, a da própria loja.
 */
export function provinciasServidas(store) {
  const lista = Array.isArray(store?.service_provinces) ? store.service_provinces.filter(Boolean) : [];
  if (lista.length) return lista;
  return store?.province ? [store.province] : [];
}

/**
 * A loja que serve uma província — a mesma regra que private.loja_da_provincia_nome na base de
 * dados, que é quem grava a loja de cada encomenda: a que tem a província na sua lista; depois, a
 * que fica nela. Entre várias, a primeira (as lojas vêm pela ordem do painel). Sem nenhuma, null.
 */
export function lojaQueServe(stores, province) {
  const p = semAcentos(province);
  if (!p) return null;
  const lista = stores || [];
  return lista.find((s) => (s.service_provinces || []).some((sp) => semAcentos(sp) === p))
    || lista.find((s) => semAcentos(s.province) === p)
    || null;
}

/** «Huíla, Namibe e Cunene». */
export function juntarNomes(nomes) {
  const t = (nomes || []).filter(Boolean);
  if (t.length <= 1) return t[0] || '';
  return `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}

/**
 * Para o painel das lojas: as províncias que mais do que uma loja diz servir (a encomenda fica com
 * a primeira, e a outra nunca a recebe) e as que nenhuma serve. `todas` = a lista das províncias.
 */
export function conflitosDeZonas(stores, todas = []) {
  const donos = new Map();
  for (const s of stores || []) {
    for (const p of provinciasServidas(s)) {
      const k = semAcentos(p);
      if (!donos.has(k)) donos.set(k, { provincia: p, lojas: [] });
      if (!donos.get(k).lojas.includes(s.name)) donos.get(k).lojas.push(s.name);
    }
  }
  const repetidas = [...donos.values()].filter((d) => d.lojas.length > 1);
  const semLoja = todas.filter((p) => !donos.has(semAcentos(p)));
  return { repetidas, semLoja };
}
