/**
 * Painel de Gestão (docs/PAINEL-GESTAO.md): as contas e os formatos que o ecrã usa. Os números vêm prontos de
 * public.painel_gestao(); aqui só se mostram — e o que se guarda neste aparelho (a TV).
 */

const nf = (min, max) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' });
const inteiro = nf(0, 0);
const umaCasa = nf(0, 1);

/** «24 810 000 Kz» (sem cêntimos: no painel conta o grosso). */
export function fmtKz(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${inteiro.format(Math.round(n)).replace(/ | /g, ' ')} Kz`;
}

/** «24,8 M» · «590 mil» · «950» — para cartões e eixos. */
export function fmtCompacto(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${umaCasa.format(a / 1e9)} mil M`;
  if (a >= 1e6) return `${s}${umaCasa.format(a / 1e6)} M`;
  if (a >= 1e4) return `${s}${inteiro.format(Math.round(a / 1e3))} mil`;
  return `${s}${inteiro.format(Math.round(a)).replace(/ | /g, ' ')}`;
}

/** Variação de `agora` face a `antes`: { pct, sobe, texto } — null sem base para comparar. */
export function variacao(agora, antes) {
  const a = Number(agora) || 0;
  const b = Number(antes) || 0;
  if (b <= 0) return null;
  const pct = ((a - b) / b) * 100;
  return { pct, sobe: pct >= 0, texto: `${pct >= 0 ? '▲' : '▼'} ${umaCasa.format(Math.abs(pct))} %` };
}

/**
 * Estado da meta, para a cor: comparado com o ritmo ideal (meta × dias passados ÷ dias do mês), não só com a meta —
 * a meio do mês, 50 % é estar em dia.
 *   'atingida' (≥ 100 % da meta) · 'adiantada' (≥ ritmo) · 'atras' (≥ 70 % do ritmo) · 'critica' (< 70 % do ritmo) ·
 *   'sem-meta'.
 */
export function estadoMeta({ vendido, meta, ritmoIdeal }) {
  const m = Number(meta);
  if (!(m > 0)) return 'sem-meta';
  const v = Number(vendido) || 0;
  if (v >= m) return 'atingida';
  const r = Number(ritmoIdeal) || 0;
  if (r <= 0 || v >= r) return 'adiantada';
  return v >= r * 0.7 ? 'atras' : 'critica';
}

export const CORES_META = {
  atingida: { barra: 'bg-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400', rotulo: 'Meta atingida' },
  adiantada: { barra: 'bg-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400', rotulo: 'Em dia' },
  atras: { barra: 'bg-amber-500', texto: 'text-amber-600 dark:text-amber-400', rotulo: 'Atrás do ritmo' },
  critica: { barra: 'bg-red-500', texto: 'text-red-600 dark:text-red-400', rotulo: 'Muito atrás do ritmo' },
  'sem-meta': { barra: 'bg-slate-400', texto: 'text-muted-foreground', rotulo: 'Sem meta' },
};

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** «10:42» de «2026-11-19T10:42:07» (a hora já vem de Angola). */
export const horaDe = (iso) => String(iso || '').slice(11, 16);

/** O nome curto de uma loja: «Huambo» de «Livraria Adventista — Huambo»; o online é «Loja online». */
export function nomeCurto(id, nome) {
  if (id === 'online') return 'Loja online';
  if (id === 'sem-loja') return 'Sem loja';
  const n = String(nome || '');
  const m = /[—–-]\s*([^—–-]+)$/.exec(n);
  return (m ? m[1] : n).trim() || 'Loja';
}

/** Filtros no endereço (?loja=…&canal=…&tv=1), para guardar um favorito por loja. */
export function lerFiltros(search) {
  const p = new URLSearchParams(search || '');
  const canal = p.get('canal');
  return {
    alvo: p.get('loja') || '',
    canal: canal === 'balcao' || canal === 'online' ? canal : '',
    tv: p.get('tv') === '1',
  };
}

export function escreverFiltros(search, { alvo, canal, tv }) {
  const p = new URLSearchParams(search || '');
  const definir = (k, v) => (v ? p.set(k, v) : p.delete(k));
  definir('loja', alvo);
  definir('canal', canal);
  definir('tv', tv ? '1' : '');
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ------------------------------------------------------------------ modo TV

export const LAYOUTS_TV = {
  painel: { rotulo: 'Só o painel', publicidade: 0 },
  '60-40': { rotulo: 'Publicidade 60 % · painel 40 %', publicidade: 60 },
  '50-50': { rotulo: 'Metade e metade', publicidade: 50 },
  '40-60': { rotulo: 'Publicidade 40 % · painel 60 %', publicidade: 40 },
  '30-70': { rotulo: 'Publicidade 30 % · painel 70 %', publicidade: 30 },
};

export const TV_PADRAO = { layout: '40-60', lado: 'esquerda', rodarLojas: true, som: false, segundosPorLoja: 30, transicao: 'esbater', vinhetas: true };

/** As transições entre as peças da publicidade (a «aleatória» escolhe uma diferente a cada passagem). */
export const TRANSICOES = {
  esbater: 'Esbater',
  deslizar: 'Deslizar',
  zoom: 'Zoom',
  cortina: 'Cortina',
  aleatoria: 'Aleatória',
};
const ESTILOS = ['esbater', 'deslizar', 'zoom', 'cortina'];

/** O estilo de uma passagem: o escolhido, ou um diferente a cada passagem na «aleatória». */
export const estiloDaPassagem = (transicao, passagem) => (transicao === 'aleatoria'
  ? ESTILOS[Math.abs(Number(passagem) || 0) % ESTILOS.length]
  : (ESTILOS.includes(transicao) ? transicao : 'esbater'));

/** A configuração da TV guardada neste aparelho (cada televisão tem a sua). */
export function lerTv(guardado) {
  let v = {};
  try {
    v = typeof guardado === 'string' ? JSON.parse(guardado) : guardado || {};
  } catch {
    v = {};
  }
  return {
    layout: LAYOUTS_TV[v.layout] ? v.layout : TV_PADRAO.layout,
    lado: v.lado === 'direita' ? 'direita' : 'esquerda',
    rodarLojas: typeof v.rodarLojas === 'boolean' ? v.rodarLojas : TV_PADRAO.rodarLojas,
    som: v.som === true,
    segundosPorLoja: Math.min(Math.max(Number(v.segundosPorLoja) || TV_PADRAO.segundosPorLoja, 10), 600),
    transicao: TRANSICOES[v.transicao] ? v.transicao : TV_PADRAO.transicao,
    vinhetas: typeof v.vinhetas === 'boolean' ? v.vinhetas : TV_PADRAO.vinhetas,
  };
}

/** A publicidade activa, pela ordem. */
export const playlist = (midia) => (midia || []).filter((m) => m && m.activo !== false && /^https:\/\//.test(m.url || ''))
  .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0));

/**
 * A sequência da TV: os anúncios pela ordem, com uma vinheta (a rodar entre as que houver) depois de cada um — como
 * nos canais de televisão. Sem vinhetas (ou desligadas), só os anúncios; só vinhetas, passam elas.
 */
export function sequenciaTv(midia, { vinhetas = true } = {}) {
  const lista = playlist(midia);
  const anuncios = lista.filter((m) => m.papel !== 'vinheta');
  const vin = lista.filter((m) => m.papel === 'vinheta');
  if (!anuncios.length) return vin;
  if (!vinhetas || !vin.length) return anuncios;
  return anuncios.flatMap((m, k) => [m, vin[k % vin.length]]);
}

/** O índice seguinte, em ciclo. */
export const proximo = (i, n) => (n > 0 ? (i + 1) % n : 0);

/**
 * O endereço de um vídeo do YouTube para o ecrã: sem cookies, a tocar, sem controlos, e com a interface de mensagens
 * ligada (`enablejsapi`) — é por ela que a TV sabe quando o vídeo termina para passar ao seguinte. `repetir`: em
 * ciclo (quando é o único da lista). `origem`: o endereço do painel (o YouTube pede-o com `enablejsapi`).
 */
export function youtubeEmbed(url, { som = false, repetir = false, origem = '' } = {}) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,20})/.exec(String(url || ''));
  if (!m) return null;
  const id = m[1];
  const p = new URLSearchParams({ autoplay: '1', mute: som ? '0' : '1', controls: '0', rel: '0', modestbranding: '1', playsinline: '1', enablejsapi: '1' });
  if (repetir) {
    p.set('loop', '1');
    p.set('playlist', id);
  }
  if (origem) p.set('origin', origem);
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}

/**
 * O estado do vídeo numa mensagem do leitor do YouTube (o que a interface `enablejsapi` manda à página):
 * 'terminou' | 'a-tocar' | 'erro' | null. As mensagens vêm em JSON, como «onStateChange» ou «infoDelivery».
 */
export function estadoYoutube(dados) {
  let d = dados;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { return null; }
  }
  if (!d || typeof d !== 'object') return null;
  if (d.event === 'onError') return 'erro';
  const estado = d.event === 'onStateChange' ? d.info : d.info?.playerState;
  if (estado === 0) return 'terminou';
  if (estado === 1) return 'a-tocar';
  return null;
}

/** O tipo de um endereço de publicidade, para quem o cola sem escolher: YouTube, vídeo ou imagem. */
export function tipoDoUrl(url) {
  const u = String(url || '').toLowerCase();
  if (youtubeEmbed(u)) return 'youtube';
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/.test(u)) return 'video';
  return 'imagem';
}

/** As lojas pelas quais o modo TV roda: «Todas» e cada loja (só as que a pessoa pode ver). */
export function rodaDeLojas(alvos) {
  return ['', ...(alvos || []).map((a) => a.id)];
}

// ------------------------------------------------------------------ rodapé (como nos noticiários)

const pctTexto = (v) => `${Math.round(Number(v) || 0)} %`;

/**
 * As notícias do rodapé, a partir dos números do painel e das mensagens da direcção (que vêm primeiro).
 * Cada uma: { etiqueta, texto, tom } — tom 'bom' (verde), 'mau' (vermelho), 'aviso' (âmbar) ou 'neutro'.
 */
export function noticias(d, mensagens = [], livros = {}) {
  if (!d) return [];
  const r = d.resumo || {};
  const mes = MESES[(d.mes || 1) - 1];
  const out = (mensagens || []).filter((m) => m && String(m.texto || '').trim())
    .map((m) => ({ etiqueta: 'AVISO', texto: String(m.texto).trim(), tom: 'aviso', imagem: m.imagem || undefined, forma: 'quadrada' }));

  const v = variacao(r.hoje, r.semana_passada);
  out.push({
    etiqueta: 'HOJE',
    texto: `${fmtKz(r.hoje)} em ${Number(r.hoje_vendas) || 0} vendas${v ? ` · ${v.texto} face ao mesmo dia da semana passada` : ''}`,
    tom: v ? (v.sobe ? 'bom' : 'mau') : 'neutro',
  });
  const meta = Number(r.meta) || 0;
  if (meta > 0 && Number(r.mes) >= meta) {
    out.push({ etiqueta: 'META ATINGIDA', texto: `${mes}: ${fmtKz(r.mes)}, ${pctTexto(r.percentagem)} da meta. Parabéns a toda a equipa!`, tom: 'bom' });
  } else if (meta > 0) {
    const est = estadoMeta({ vendido: r.mes, meta, ritmoIdeal: r.ritmo_ideal });
    out.push({
      etiqueta: 'META',
      texto: `${pctTexto(r.percentagem)} da meta de ${mes} · faltam ${fmtKz(r.falta)} · ${fmtKz(r.ritmo_necessario)} por dia até ao fim do mês`,
      tom: est === 'adiantada' ? 'bom' : est === 'critica' ? 'mau' : 'aviso',
    });
  } else {
    out.push({ etiqueta: mes.toUpperCase(), texto: `${fmtKz(r.mes)} em ${Number(r.mes_vendas) || 0} vendas`, tom: 'neutro' });
  }
  if (Number(r.projeccao) > 0) {
    out.push({
      etiqueta: 'PROJECÇÃO',
      texto: `ao ritmo actual, ${mes} fecha em ${fmtKz(r.projeccao)}`,
      tom: meta > 0 ? (Number(r.projeccao) >= meta ? 'bom' : 'aviso') : 'neutro',
    });
  }
  const comMeta = (d.lojas || []).filter((l) => Number(l.meta) > 0);
  if (comMeta.length > 1) {
    const lider = [...comMeta].sort((a, b) => (Number(b.percentagem) || 0) - (Number(a.percentagem) || 0))[0];
    out.push({ etiqueta: 'LIDERA', texto: `${nomeCurto(lider.id, lider.nome)}, com ${pctTexto(lider.percentagem)} da meta do mês`, tom: 'bom' });
  }
  for (const l of d.lojas || []) {
    if (!(Number(l.hoje) > 0)) continue;
    out.push({
      etiqueta: nomeCurto(l.id, l.nome).toUpperCase(),
      texto: `hoje ${fmtKz(l.hoje)}${Number(l.meta) > 0 ? ` · ${pctTexto(l.percentagem)} da meta do mês` : ''}`,
      tom: 'neutro',
    });
  }
  const top = (d.mais_vendidos_hoje || [])[0];
  if (top) out.push({ etiqueta: 'MAIS VENDIDO HOJE', texto: `${top.titulo} (${Number(top.quantidade)} un.)`, tom: 'neutro', imagem: top.capa || undefined, forma: 'capa' });
  // os livros das livrarias: as promoções em vigor e as novidades do catálogo, com a capa
  for (const l of livros?.promocoes || []) {
    out.push({ etiqueta: 'PROMOÇÃO', texto: `${l.titulo} — de ${fmtKz(l.preco)} por ${fmtKz(l.promocao)}`, tom: 'aviso', imagem: l.capa || undefined, forma: 'capa' });
  }
  for (const l of livros?.novidades || []) {
    out.push({ etiqueta: 'NOVIDADE', texto: `${l.titulo}${l.autor ? ` · ${l.autor}` : ''} · ${fmtKz(l.preco)}`, tom: 'neutro', imagem: l.capa || undefined, forma: 'capa' });
  }
  const u = (d.ultimas || []).find((x) => !x.anulado);
  if (u) {
    out.push({
      etiqueta: 'ÚLTIMA VENDA',
      texto: `${horaDe(u.quando)} · ${nomeCurto(u.alvo, u.loja)} · ${fmtKz(Math.abs(Number(u.total)))}${u.artigo ? ` · ${u.artigo}` : ''}`,
      tom: Number(u.total) < 0 ? 'mau' : 'bom',
    });
  }
  return out;
}

/** As mensagens da direcção que ainda passam hoje (activas e sem data de fim, ou com o fim hoje ou depois). */
export const mensagensDeHoje = (lista, hoje) => (lista || [])
  .filter((m) => m && m.activo !== false && (!m.ate || String(m.ate) >= String(hoje)))
  .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0));


/**
 * Os livros para o rodapé, a partir do catálogo (stock_books): as promoções em vigor (preço promocional abaixo do
 * normal e dentro das datas) e as novidades com stock, até `max` de cada.
 */
export function livrosParaRodape(livros, agora = new Date(), max = 6) {
  const t = agora.getTime();
  const capa = (b) => b.cover_image || b.cover || '';
  const emPromocao = (b) => Number(b.sale_price) > 0 && Number(b.sale_price) < Number(b.price)
    && (!b.sale_starts_at || new Date(b.sale_starts_at).getTime() <= t) && (!b.sale_ends_at || new Date(b.sale_ends_at).getTime() > t);
  const ativos = (livros || []).filter((b) => b && b.active !== false && String(b.title || '').trim());
  const promocoes = ativos.filter(emPromocao).slice(0, max)
    .map((b) => ({ titulo: b.title.trim(), preco: Number(b.price), promocao: Number(b.sale_price), capa: capa(b) }));
  const jaEmPromocao = new Set(promocoes.map((p) => p.titulo));
  const novidades = ativos.filter((b) => Number(b.stock) > 0 && !jaEmPromocao.has(b.title.trim()))
    .sort((a, b) => String(b.created || '').localeCompare(String(a.created || ''))).slice(0, max)
    .map((b) => ({ titulo: b.title.trim(), autor: String(b.author || '').trim(), preco: Number(b.price), capa: capa(b) }));
  return { promocoes, novidades };
}
