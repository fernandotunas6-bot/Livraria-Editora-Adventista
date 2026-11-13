// A loja falsa: o Supabase dos testes de ponta a ponta, respondido na rede do navegador.
//
// O site é o build verdadeiro; o que é falso é o que está do outro lado. Cada teste tem a sua
// loja (catálogo, stock, encomendas), em memória, que responde aos pedidos que o site faz ao
// PostgREST e à Edge Function `app` com as mesmas formas e as mesmas regras que interessam à
// compra: o total é calculado aqui e não o que o navegador mandou, o stock desce, uma chave de
// idempotência repetida devolve a mesma encomenda, o rastreio exige o número e o email.
//
// As regras a sério (o `place_order`, os gatilhos, a RLS) estão testadas contra as migrações
// reais em scripts/pglite/. Aqui o que se prova é o caminho de quem compra: que os ecrãs se
// ligam uns aos outros e que o pedido que sai do navegador é o que o servidor espera.

export const SUPABASE_FALSO = 'https://supabase.e2e.invalid';

const API = '/functions/v1/app';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'access-control-expose-headers': 'Content-Range, Retry-After, X-Request-Id',
};

const livro = (campos) => ({
  author: '', description: '', genre: 'Geral', stock: 10, active: true, featured: false,
  product_type: 'livro', versions: [], collection_id: null, cover: '', cover_image: '',
  sale_price: null, sale_starts_at: null, sale_ends_at: null, stock_low: false, stock_alert: false,
  created: '2026-10-01T09:00:00.000Z', updated: '2026-10-01T09:00:00.000Z',
  ...campos,
});

const CATALOGO = () => [
  livro({
    id: 'livro-caminho', book_code: 'LIV-001', title: 'O Caminho a Cristo', author: 'Ellen G. White',
    genre: 'Vida Cristã', price: 4500, stock: 8, featured: true,
    description: '<p>Um clássico sobre o encontro com Jesus.</p>',
  }),
  livro({
    id: 'livro-conflito', book_code: 'LIV-002', title: 'O Grande Conflito', author: 'Ellen G. White',
    genre: 'Profecia', price: 12000, stock: 3,
  }),
  livro({
    id: 'livro-raro', book_code: 'LIV-003', title: 'Atlas Bíblico Ilustrado', author: 'Vários',
    genre: 'Estudo', price: 9000, stock: 1,
  }),
];

const DEFINICOES = {
  site_name: 'Livraria Adventista', tagline: 'Literatura que edifica e transforma', primary_color: '#0ea5c9',
  contact_email: 'loja@exemplo.invalid', contact_phone: '', whatsapp: '',
  shipping_free_threshold: 20000, shipping_cost: 1500, shipping_express_cost: 0,
  order_number_prefix: 'LA-', maintenance_mode: false, pwa_enabled: false, push_enabled: false,
};

const PAGAMENTOS = [
  {
    id: 'pag-entrega', code: 'entrega', name: 'Pagamento na entrega', type: 'offline', icon: '',
    instructions: 'Paga em dinheiro ou TPA a quem entrega.', account_info: '', qr_url: '', payment_link: '',
    automatic: false, shipping_methods: null,
  },
  {
    id: 'pag-transferencia', code: 'transferencia', name: 'Transferência bancária', type: 'transfer', icon: '',
    instructions: 'Use o número da encomenda como descrição.', account_info: 'AO06 0000 0000 0000 0000 0000 0',
    qr_url: '', payment_link: '', automatic: false, shipping_methods: null,
  },
  {
    id: 'pag-balcao', code: 'balcao', name: 'Pagar no Balcão', type: 'offline', icon: '',
    instructions: '', account_info: '', qr_url: '', payment_link: '', automatic: false, shipping_methods: ['pickup'],
  },
];

const LOJAS = [
  {
    id: 'loja-luanda', name: 'Loja de Luanda', province: 'Luanda', address: 'Rua da Missão, 12', phone: '',
    active: true, pickup_enabled: true, sort_order: 1,
  },
  {
    id: 'loja-huambo', name: 'Loja do Huambo', province: 'Huambo', address: 'Av. da Independência, 40',
    phone: '+244 923 428 459', whatsapp: '+244 923 428 459',
    image_url: '',
    gallery: [
      { url: '/images/lojas/huambo-1.webp', caption: 'Balcão de atendimento' },
      { url: '/images/lojas/huambo-2.webp', caption: 'A equipa da loja' },
    ],
    active: true, pickup_enabled: true, sort_order: 2,
  },
];

const texto = (v, max = 500) => String(v ?? '').trim().slice(0, max);

/** Filtros do PostgREST que o site usa nas leituras públicas: `eq`, `in` e `is`. O resto passa. */
function filtrar(linhas, params) {
  let out = linhas;
  for (const [campo, valor] of params) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(campo)) continue;
    const [op, ...resto] = String(valor).split('.');
    const alvo = resto.join('.');
    if (op === 'eq') out = out.filter((l) => String(l[campo]) === alvo);
    else if (op === 'in') {
      const ids = alvo.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''));
      out = out.filter((l) => ids.includes(String(l[campo])));
    } else if (op === 'is') out = out.filter((l) => (alvo === 'null' ? l[campo] == null : String(l[campo]) === alvo));
  }
  return out;
}

export class LojaFalsa {
  constructor() {
    this.livros = CATALOGO();
    this.definicoes = { ...DEFINICOES };
    this.pagamentos = PAGAMENTOS.map((p) => ({ ...p }));
    this.lojas = LOJAS.map((l) => ({ ...l }));
    /** Encomendas gravadas, pela ordem em que entraram. */
    this.encomendas = [];
    /** Todos os pedidos de checkout que chegaram, tal como o navegador os mandou. */
    this.pedidosCheckout = [];
    /** Pedidos de confirmação de recepção. */
    this.pedidosConfirmacao = [];
    /** Pedidos para fora (nem o site, nem o Supabase falso): ficam registados e são cortados. */
    this.pedidosParaFora = [];
    /** Rotas da API pedidas e que a loja falsa não conhece. */
    this.rotasDesconhecidas = [];
    /** O que o site mandou para POST /telemetria (erros e Core Web Vitals). */
    this.telemetria = [];
    /** Avarias a aplicar ao próximo checkout: 'resposta-perdida' (grava e a rede cai). */
    this.avarias = [];
    /**
     * Corre quando o checkout chega ao servidor, antes de ele olhar para o stock: é onde um
     * teste põe o que aconteceu "entretanto" (outro cliente levou o último exemplar).
     */
    this.antesDoCheckout = null;
    this.sequencia = 0;
  }

  livro(id) { return this.livros.find((l) => l.id === id); }

  encomenda(numero) { return this.encomendas.find((e) => e.order_number === numero); }

  /** Liga a loja falsa a um contexto do navegador (todas as páginas e separadores dele). */
  async ligar(context) {
    await context.route('**/*', (route) => this.#responder(route));
  }

  async #responder(route) {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === SUPABASE_FALSO) return this.#supabase(route, request, url);
    if (url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    // Fontes da Google, mosaicos de mapas, estatísticas: nada disto faz parte do que se testa,
    // e um teste que dependa da internet falha por razões que não são da loja.
    this.pedidosParaFora.push(url.origin + url.pathname);
    return route.abort('blockedbyclient');
  }

  async #supabase(route, request, url) {
    const metodo = request.method();
    if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (corpo, status = 200, extra = {}) => route.fulfill({
      status, headers: { ...CORS, 'content-type': 'application/json', ...extra }, body: JSON.stringify(corpo),
    });

    if (url.pathname.startsWith('/storage/')) {
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PIXEL });
    }
    if (url.pathname.startsWith('/rest/v1/')) return this.#rest(request, url, json);
    if (url.pathname.startsWith(API)) {
      let corpo = {};
      try { corpo = request.postDataJSON() || {}; } catch { /* sem corpo */ }
      return this.#api(`${metodo} ${url.pathname.slice(API.length) || '/'}`, corpo, url, json, route);
    }
    // Auth, realtime e o resto: quem compra sem conta não precisa de nenhum deles.
    return json({}, 200);
  }

  #rest(request, url, json) {
    const tabela = url.pathname.replace('/rest/v1/', '').split('/')[0];
    if (request.method() !== 'GET') return json([], 200);
    const dados = { stock_books: this.livros, physical_stores: this.lojas, payment_methods: this.pagamentos.map((p) => ({ ...p, enabled: true })) };
    const linhas = filtrar(dados[tabela] || [], url.searchParams);
    const cabecalhos = { 'content-range': linhas.length ? `0-${linhas.length - 1}/${linhas.length}` : '*/0' };
    if ((request.headers().accept || '').includes('vnd.pgrst.object')) {
      return linhas.length === 1
        ? json(linhas[0], 200, cabecalhos)
        : json({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${linhas.length} rows` }, 406);
    }
    return json(linhas, 200, cabecalhos);
  }

  #api(rota, corpo, url, json, route) {
    switch (rota) {
      case 'GET /settings': return json(this.definicoes);
      case 'GET /integrations': return json({});
      // O assistente fica desligado: não faz parte da compra e ocuparia o canto do ecrã.
      case 'GET /chat/config': return json({ enabled: false, ai: false, provider: 'faq', welcome: '', handoff: false, whatsapp: '' });
      case 'GET /payment-methods': return json({ methods: this.pagamentos });
      case 'GET /stores': return json({ stores: this.lojas });
      case 'GET /book-collections': return json({ collections: [] });
      // Sem dados geográficos no servidor, o site usa a lista que traz consigo (Censo 2024).
      case 'GET /geo/provinces': return json({ provinces: [] });
      case 'GET /geo/municipalities': return json({ municipalities: [] });
      case 'GET /geo/localities': return json({ localities: [] });
      case 'POST /catalog/view': return json({ ok: true });
      case 'POST /recommendations': return json({ personal: false, for_you: [], recent: [], newest: [] });
      case 'POST /checkout': return this.#checkout(corpo, json, route);
      case 'POST /track': {
        const e = this.#procurar(corpo);
        return e ? json(this.#rastreio(e)) : json({ message: 'Encomenda não encontrada. Verifique o número e o email.', status: 404 }, 404);
      }
      case 'POST /track/live': {
        const e = this.#procurar(corpo);
        return e
          ? json({ delivery_status: e.delivery_status, on_the_way: false, can_set_destination: false, destination: null, courier: null, trail: [], distance_km: null })
          : json({ message: 'Encomenda não encontrada.' }, 404);
      }
      case 'POST /confirm-delivery': return this.#confirmarRecepcao(corpo, json);
      // Saúde do site (lib/telemetry.js): os erros e as medições que o site manda ficam aqui.
      case 'POST /telemetria':
        this.telemetria.push(...(Array.isArray(corpo.events) ? corpo.events : []));
        return json({ saved: Array.isArray(corpo.events) ? corpo.events.length : 0 });
      default:
        this.rotasDesconhecidas.push(rota);
        return json({ message: 'Rota não encontrada.' }, 404);
    }
  }

  #procurar(corpo) {
    const numero = texto(corpo.orderNumber || corpo.order_number);
    const email = texto(corpo.email).toLowerCase();
    if (!numero || !email) return null;
    return this.encomendas.find((e) => e.order_number === numero && e.customer_email.toLowerCase() === email) || null;
  }

  #respostaCheckout(e, repetida = false) {
    return {
      url: `/success?orderId=${e.id}&orderNumber=${e.order_number}&total=${e.total}&type=purchase`,
      orderId: e.id, orderNumber: e.order_number, total: e.total, payment_status: e.payment_status,
      order_type: e.order_type, sale_channel: e.sale_channel, email_queued: false, whatsapp_sent: false,
      ...(repetida ? { replayed: true } : {}),
    };
  }

  #checkout(corpo, json, route) {
    this.pedidosCheckout.push(corpo);
    this.antesDoCheckout?.();
    const avaria = this.avarias.shift();
    const erro = (message) => json({ message, status: 400 }, 400);

    const chave = /^[A-Za-z0-9-]{16,64}$/.test(String(corpo.idempotencyKey || '')) ? String(corpo.idempotencyKey) : '';
    const anterior = chave && this.encomendas.find((e) => e.idempotency_key === chave);
    if (anterior) return json(this.#respostaCheckout(anterior, true));

    const itens = Array.isArray(corpo.items) ? corpo.items : [];
    if (!itens.length) return erro('Carrinho vazio.');
    const linhas = [];
    for (const item of itens) {
      const id = String(item.variant_id || '').replace(/-(default|v\d+)$/, '');
      const quantidade = Math.floor(Number(item.quantity) || 0);
      const l = this.livro(id);
      if (!l || l.active === false || quantidade < 1) return erro('Livro indisponível.');
      if (l.stock < quantidade) return erro(`Stock insuficiente para: ${l.title}`);
      linhas.push({ livro: l, quantidade });
    }

    const envio = ['delivery', 'pickup', 'express'].includes(corpo.shippingMethod) ? corpo.shippingMethod : 'delivery';
    const metodo = this.pagamentos.find((p) => p.code === corpo.paymentMethodCode);
    if (!metodo) return erro('Método de pagamento indisponível.');
    if (metodo.shipping_methods && !metodo.shipping_methods.includes(envio)) return erro('Este pagamento não serve para o envio escolhido.');
    if (!texto(corpo.customerName)) return erro('Indique o nome.');
    if (envio !== 'pickup' && (!texto(corpo.customerEmail) || !texto(corpo.deliveryStreet))) return erro('Faltam dados de entrega.');

    // O total é sempre o do servidor: o que o navegador mandou em `shippingCost` não conta.
    const subtotal = linhas.reduce((s, { livro: l, quantidade }) => s + Number(l.price) * quantidade, 0);
    const portes = envio === 'pickup' ? 0
      : subtotal >= this.definicoes.shipping_free_threshold ? 0
        : envio === 'express' ? this.definicoes.shipping_cost * 2 : this.definicoes.shipping_cost;
    for (const { livro: l, quantidade } of linhas) l.stock -= quantidade;

    this.sequencia += 1;
    const pagaAntes = ['transfer', 'p2p'].includes(metodo.type);
    const referencia = pagaAntes ? texto(corpo.paymentReference, 80) : '';
    const e = {
      id: `enc-${this.sequencia}`,
      order_number: `${this.definicoes.order_number_prefix}E2E${String(this.sequencia).padStart(4, '0')}`,
      idempotency_key: chave,
      status: 'pending', delivery_status: 'received',
      payment_status: referencia ? 'awaiting_confirmation' : 'pending',
      payment_reference: referencia, payment_method: metodo.code, payment_method_name: metodo.name,
      order_type: corpo.saleChannel === 'whatsapp' ? 'whatsapp_order' : 'purchase',
      sale_channel: corpo.saleChannel || 'web_purchase',
      shipping_method: envio, pickup_store: envio === 'pickup' ? texto(corpo.pickupStore, 120) : '',
      subtotal, shipping_cost: portes, total: subtotal + portes,
      customer_name: texto(corpo.customerName, 120), customer_email: texto(corpo.customerEmail, 200),
      phone: texto(corpo.phone, 40),
      delivery_province: texto(corpo.deliveryProvince), delivery_municipality: texto(corpo.deliveryMunicipality),
      delivery_locality: texto(corpo.deliveryLocality), delivery_street: texto(corpo.deliveryStreet),
      delivery_reference: texto(corpo.deliveryReference), delivery_address_full: texto(corpo.deliveryAddressFull || corpo.address),
      delivery_relative_name: texto(corpo.deliveryRelativeName), delivery_relative_phone: texto(corpo.deliveryRelativePhone),
      checkout_signature_data: texto(corpo.checkoutSignature, 300_000),
      delivery_confirmed_at: '', delivery_confirmed_by: '', delivery_recipient_name: '', delivery_signature_data: '',
      items: linhas.map(({ livro: l, quantidade }) => ({ book_id: l.id, title: l.title, quantity: quantidade, price: l.price })),
      delivery_timeline: [{ status: 'received', title: 'Encomenda registada', description: '', at: new Date().toISOString() }],
      created: new Date().toISOString(),
    };
    this.encomendas.push(e);

    // A encomenda ficou gravada e a resposta não chegou a quem compra (a rede caiu a meio): é
    // o caso que a chave de idempotência existe para resolver.
    if (avaria === 'resposta-perdida') return route.abort('connectionreset');
    return json(this.#respostaCheckout(e));
  }

  #rastreio(e) {
    const metodo = this.pagamentos.find((p) => p.code === e.payment_method);
    const pagaAntes = ['transfer', 'p2p'].includes(metodo?.type);
    return {
      payment_method_name: e.payment_method_name, payment_upfront: pagaAntes,
      payment_reference_present: !!e.payment_reference, payment_automatic: false,
      ...(pagaAntes ? { payment_instructions: metodo.instructions, payment_account_info: metodo.account_info, payment_link: '' } : {}),
      order_number: e.order_number, status: e.status, delivery_status: e.delivery_status,
      total: e.total, customer_name: e.customer_name, phone: e.phone,
      delivery_relative_name: e.delivery_relative_name, delivery_relative_phone: e.delivery_relative_phone,
      delivery_province: e.delivery_province, delivery_municipality: e.delivery_municipality,
      delivery_locality: e.delivery_locality, delivery_street: e.delivery_street,
      delivery_reference: e.delivery_reference, delivery_address_full: e.delivery_address_full,
      delivery_confirmed_at: e.delivery_confirmed_at, delivery_confirmed_by: e.delivery_confirmed_by,
      delivery_recipient_name: e.delivery_recipient_name,
      // Como no servidor: a imagem da assinatura nunca sai pelo rastreio.
      delivery_signature_present: !!e.delivery_signature_data,
      tracking_number: '', carrier: '', estimated_delivery: '', payment_status: e.payment_status,
      timeline: e.delivery_timeline, created: e.created,
      shipping_method: e.shipping_method, pickup_store: e.pickup_store,
      can_cancel: false, delivery_gps: null, can_set_destination: false,
    };
  }

  #confirmarRecepcao(corpo, json) {
    this.pedidosConfirmacao.push(corpo);
    const erro = (message, status = 400) => json({ message, status }, status);
    const e = this.#procurar(corpo);
    if (!e) return erro('Encomenda não encontrada.', 404);
    if (e.delivery_confirmed_at) return erro('Esta encomenda já foi confirmada pelo comprador.');
    if (!['shipped', 'in_transit', 'out_for_delivery', 'delivered'].includes(e.delivery_status)) {
      return erro('A encomenda ainda não está disponível para confirmação de recepção.');
    }
    const nome = texto(corpo.recipientName, 120);
    const assinatura = String(corpo.signature || '');
    if (!nome) return erro('Indique quem recebe a encomenda.');
    if (!assinatura.startsWith('data:image/png;base64,')) return erro('Falta a assinatura.');
    Object.assign(e, {
      delivery_status: 'delivered', delivery_confirmed_at: new Date().toISOString(),
      delivery_confirmed_by: nome, delivery_recipient_name: nome, delivery_signature_data: assinatura,
    });
    e.delivery_timeline.push({ status: 'delivered', title: 'Recepção confirmada pelo comprador', description: `Assinatura digital registada por ${nome}`, at: e.delivery_confirmed_at });
    // Quem acabou de confirmar vê a sua assinatura; é a única resposta que a traz.
    return json({ ...this.#rastreio(e), delivery_signature_data: assinatura });
  }
}
