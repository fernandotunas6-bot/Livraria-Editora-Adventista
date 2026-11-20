// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import pb from '@/lib/dataClient';
import { resolveShopBgMode } from '@/lib/shopTheme';
import { storeGallery } from '@/lib/stores';
import { APP_API_URL, supabase } from '@/lib/supabaseClient';

const DEFAULT_SETTINGS = {
  site_name: 'Livraria Adventista',
  tagline: 'Literatura que edifica e transforma',
  primary_color: '#0ea5c9',
  logo_url: '',
  favicon_url: '',
  contact_email: '',
  contact_phone: '',
  contact_address: 'Luanda, Angola',
  pwa_enabled: true,
  pwa_theme_color: '#0c4a6e',
  shipping_free_threshold: 20000,
  shipping_cost: 1500,
  shipping_express_cost: 3000,
  shop_hero_title: 'Todos os Livros',
  shop_hero_subtitle: 'O catálogo completo da livraria — pesquisa avançada, pré-visualização e compra segura.',
  shop_hero_badge: 'Catálogo da livraria',
  shop_default_sort: 'featured',
  shop_per_page: 24,
  shop_show_featured: true,
  shop_show_collections: true,
  shop_show_low_stock: true,
  shop_grid_columns: 4,
  maintenance_mode: false,
  google_oauth_enabled: false,
  header_welcome_logged: 'Bem-vindo de volta, {nome}',
  header_welcome_guest: 'Envio em todo o país · Compre sem conta',
  header_cta_text: 'Explorar novidades',
  header_cta_link: '/shop',
  footer_tagline: '',
  footer_copyright: '',
  footer_columns: null,
  show_stores_in_footer: true,
  ui_glass_enabled: true,
  ui_glass_opacity: 0.72,
  shop_bg_mode: 'image',
  shop_bg_image_url: '/images/site/loja-banner.webp',
  shop_bg_video_url: '',
  shop_bg_overlay: 0.55,
  google_maps_embed_key: '',
  assets_version: '',
};

/**
 * As configurações públicas do site, ou um erro (sem rede, servidor em baixo). `no-cache` revalida
 * no servidor e actualiza a cópia do browser; ver PUBLIC_CACHE na Edge Function.
 */
export async function fetchSiteSettings({ fresh = false } = {}) {
  const res = await fetch(`${APP_API_URL}/settings`, fresh ? { cache: 'no-cache' } : undefined);
  if (!res.ok) throw new Error(`settings: ${res.status}`);
  const merged = { ...DEFAULT_SETTINGS, ...await res.json() };
  merged.shop_bg_mode = resolveShopBgMode(merged);
  return merged;
}

/** O mesmo, mas sem falhar: num erro devolve as de omissão. */
export async function getSiteSettings({ fresh = false } = {}) {
  try {
    return await fetchSiteSettings({ fresh });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Lojas activas (a RLS só mostra lojas activas ao público). */
export async function getPhysicalStores() {
  try {
    const records = await pb.collection('physical_stores').getFullList({ filter: 'active = true', sort: 'sort_order,name' });
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      province: r.province,
      address: r.address,
      phone: r.phone || '',
      email: r.email || '',
      whatsapp: r.whatsapp || '',
      hours: r.hours || '',
      image_url: r.image_url || (r.image ? pb.files.getURL(r, r.image) : ''),
      gallery: storeGallery(r),
      latitude: r.latitude,
      longitude: r.longitude,
      maps_url: r.maps_url || '',
      pickup_enabled: r.pickup_enabled !== false,
      // As províncias que a loja serve (migração lojas_donas_dos_dados); antes dela, nenhuma.
      service_provinces: Array.isArray(r.service_provinces) ? r.service_provinces : [],
    }));
  } catch {
    return [];
  }
}

export async function getCollections() {
  try {
    const res = await fetch(`${APP_API_URL}/book-collections`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.collections || [];
  } catch {
    return [];
  }
}

export async function getPaymentMethods() {
  try {
    const res = await fetch(`${APP_API_URL}/payment-methods`);
    if (!res.ok) return { methods: [] };
    const data = await res.json();
    const methods = data.methods || [];
    // O link de pagamento lê-se também directamente da base de dados (os métodos activos são
    // de leitura pública), para funcionar mesmo com uma Edge Function publicada mais antiga.
    if (methods.length && methods.some((m) => m.payment_link === undefined)) {
      const { data: links } = await supabase.from('payment_methods').select('code, payment_link').eq('enabled', true);
      const byCode = Object.fromEntries((links || []).map((l) => [l.code, l.payment_link || '']));
      methods.forEach((m) => { if (m.payment_link === undefined) m.payment_link = byCode[m.code] || ''; });
    }
    return { ...data, methods };
  } catch {
    return { methods: [] };
  }
}

export async function trackOrder(orderNumber, email) {
  // Com a sessão da conta da encomenda, o servidor mostra tudo; sem ela, os telefones, a rua e o
  // ponto GPS saem mascarados (supabase/functions/app/trackPrivacy.ts).
  const { data: { session } = {} } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const res = await fetch(`${APP_API_URL}/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ orderNumber, email }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('Não foi possível consultar a encomenda agora. Tente outra vez dentro de instantes.');
  if (!res.ok) throw new Error(data.message || 'Encomenda não encontrada');
  return data;
}

/**
 * Referência do pagamento indicada depois de encomendar (transferência, Multicaixa Express).
 * Identifica a encomenda pelo número e email, ou número e telefone.
 */
export async function reportPaymentReference({ orderNumber, email = '', phone = '', reference }) {
  const res = await fetch(`${APP_API_URL}/order/payment-reference`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber, email, phone, reference }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível registar a referência');
  return data;
}

/** O cabeçalho da sessão, quando há (a Edge Function identifica a conta por ele). */
async function sessionHeaders() {
  const { data: { session } = {} } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/**
 * O cliente cancela uma encomenda sua, enquanto não está paga nem saiu da fila de preparação
 * (regras em lib/customerOrders.js). Com sessão basta o número; sem sessão, número e email.
 */
export async function cancelOrder({ orderNumber, email = '', reason = '' }) {
  const res = await fetch(`${APP_API_URL}/order/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await sessionHeaders()) },
    body: JSON.stringify({ orderNumber, email, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível cancelar a encomenda.');
  return data;
}

/** Os dados da conta, para o próprio descarregar (direito de acesso). */
export async function exportMyData() {
  const res = await fetch(`${APP_API_URL}/account/export`, { headers: await sessionHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível juntar os seus dados.');
  return data;
}

/** Apaga a conta da sessão. `confirmEmail`: o email da conta, escrito à mão. */
export async function deleteMyAccount(confirmEmail) {
  const res = await fetch(`${APP_API_URL}/account/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await sessionHeaders()) },
    body: JSON.stringify({ confirmEmail }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível apagar a conta.');
  return data;
}

export async function getGeoProvinces() {
  const res = await fetch(`${APP_API_URL}/geo/provinces`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.provinces || [];
}

export async function getGeoMunicipalities(provinceId) {
  if (!provinceId) return [];
  const res = await fetch(`${APP_API_URL}/geo/municipalities?province=${encodeURIComponent(provinceId)}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.municipalities || [];
}

export async function getGeoLocalities(municipalityId) {
  if (!municipalityId) return [];
  const res = await fetch(`${APP_API_URL}/geo/localities?municipality=${encodeURIComponent(municipalityId)}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return data.localities || [];
}

export async function confirmDelivery({ orderNumber, email, recipientName, recipientId, signature }) {
  const res = await fetch(`${APP_API_URL}/confirm-delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber,
      email,
      recipientName,
      recipientId,
      signature,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível confirmar a entrega');
  return data;
}

export async function addDeliveryEvent(orderId, event, token) {
  const res = await fetch(`${APP_API_URL}/delivery-event`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({ orderId, ...event }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Erro');
  return data;
}

// ---------------------------------------------------------------------------------------------
// Pagamentos registados (migração 20261107200000_pagamentos_registados, docs/PAGAMENTOS.md)
// ---------------------------------------------------------------------------------------------
// Cada pagamento e reembolso é uma linha de `order_payments`; o estado do pagamento da encomenda
// resulta delas e ninguém o escreve à mão. As acções passam pela Edge Function, que verifica a
// permissão "Confirmar pagamentos", diz à base quem foi (registo de segurança) e avisa o cliente.
// Não há caminho de recurso para a tabela: a base de dados recusa-o.

const paymentAction = (path, body) => pb.send(path, { method: 'POST', body });

/** Pagamento já verificado: balcão, dinheiro da entrega, transferência vista no extracto. */
export const recordOrderPayment = ({ orderId, amount, methodCode, reference, receivedAt, account, collectedBy, notes, sharedReferenceOk }) =>
  paymentAction('/admin/orders/payments/record', { orderId, amount, methodCode, reference, receivedAt, account, collectedBy, notes, sharedReferenceOk });

/** Confirma um pagamento indicado, com o valor que de facto entrou. */
export const confirmOrderPayment = ({ paymentId, amount, receivedAt, account, notes, sharedReferenceOk }) =>
  paymentAction('/admin/orders/payments/confirm', { paymentId, amount, receivedAt, account, notes, sharedReferenceOk });

/** Rejeita um pagamento indicado que não se encontrou; o motivo vai para o cliente. */
export const rejectOrderPayment = (paymentId, reason) => paymentAction('/admin/orders/payments/reject', { paymentId, reason });

/** Anula um pagamento ou reembolso confirmado por engano (avisa os administradores). */
export const voidOrderPayment = (paymentId, reason) => paymentAction('/admin/orders/payments/void', { paymentId, reason });

/** Reembolso: dinheiro devolvido ao cliente, no máximo o que ficou pago. */
export const recordOrderRefund = ({ orderId, amount, methodCode, reference, refundedAt, account, reason }) =>
  paymentAction('/admin/orders/refunds/record', { orderId, amount, methodCode, reference, refundedAt, account, reason });

/** A encomenda, os pagamentos e as referências repetidas noutras encomendas. */
export async function getOrderPayments(orderId) {
  const { data, error } = await supabase.rpc('order_payments_overview', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data;
}

/** Relatório de pagamentos e caixa (datas AAAA-MM-DD, em Luanda). */
export async function getPaymentsReport(from, to) {
  const { data, error } = await supabase.rpc('payments_report', { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Muda o estado da entrega de uma encomenda, pela API: é lá que o cliente recebe o email
 * "enviada", "saiu para entrega", "entregue". Marcar "Entregue" com dinheiro por receber leva
 * `extra.payment` ({ amount, collectedBy, methodCode, reference }) ou `extra.unpaidReason`; sem
 * nenhum, a API responde 409 com o valor em falta.
 */
export async function setOrderDeliveryStatus(orderId, status, extra = {}) {
  const res = await pb.send('/delivery-event', { method: 'POST', body: { orderId, status, ...extra } });
  return { ...res, via: 'api' };
}

export function getSettingsFileUrl(record, field) {
  if (!record?.[field]) return null;
  return pb.files.getURL(record, record[field]);
}

// ---------------------------------------------------------------------------------------------
// KanGest (docs/KANGEST.md): o estado da ligação, repetir um documento com erro, sincronizar já
// ---------------------------------------------------------------------------------------------

/** Ligações (sem chaves), contagem da fila, últimos erros e o estado (activo, última sincronização). */
export const kangestEstado = () => pb.send('/admin/kangest', { method: 'GET' });
/** Volta a pôr na fila um documento com erro (depois de corrigir o artigo, a referência ou a ligação). */
export const kangestRepetir = (id) => pb.send('/admin/kangest/repetir', { method: 'POST', body: { id } });
/** Corre já a fila, o stock completo e as vendas do ano. */
export const kangestSincronizar = () => pb.send('/admin/kangest/sincronizar', { method: 'POST', body: {} });

/** Confere a configuração da ligação ao KanGest sem emitir nada (permissões, armazéns, pagamentos, agendador). */
export const kangestTestar = () => pb.send('/admin/kangest/testar', { method: 'POST', body: {} });
