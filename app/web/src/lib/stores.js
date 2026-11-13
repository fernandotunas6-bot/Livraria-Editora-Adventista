/** Utilitários das lojas físicas (mapas, direcções e coordenadas GPS). */

export const hasCoords = (store) =>
  Number.isFinite(Number(store?.latitude)) && Number.isFinite(Number(store?.longitude))
  && !(Number(store.latitude) === 0 && Number(store.longitude) === 0);

/** Link para abrir a loja no Google Maps. */
export function mapsUrl(store) {
  if (store?.maps_url) return store.maps_url;
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
 * Limites da galeria, iguais aos da base de dados (20261113103000_fotografias_das_lojas: no
 * máximo 24 fotografias e 4 KB na coluna). Aqui são mais apertados de propósito: uma loja com
 * doze fotografias já se mostra toda, e as legendas curtas cabem na linha por baixo da imagem.
 * Com estes números a coluna nunca se aproxima dos 4 KB, por isso o painel nunca leva com o
 * erro da restrição — que não diria à equipa o que fazer.
 */
export const GALERIA_MAX_FOTOS = 12;
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
