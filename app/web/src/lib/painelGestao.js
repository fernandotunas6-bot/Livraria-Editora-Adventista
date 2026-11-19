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

export const TV_PADRAO = { layout: '40-60', lado: 'esquerda', rodarLojas: true, som: false, segundosPorLoja: 30 };

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
  };
}

/** A publicidade activa, pela ordem. */
export const playlist = (midia) => (midia || []).filter((m) => m && m.activo !== false && /^https:\/\//.test(m.url || ''))
  .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id ?? 0) - (b.id ?? 0));

/** O índice seguinte, em ciclo. */
export const proximo = (i, n) => (n > 0 ? (i + 1) % n : 0);

/** O endereço de um vídeo do YouTube para o ecrã (sem cookies, a tocar, em ciclo, sem controlos). */
export function youtubeEmbed(url, { som = false } = {}) {
  const m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,20})/.exec(String(url || ''));
  if (!m) return null;
  const id = m[1];
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${som ? 0 : 1}&controls=0&loop=1&playlist=${id}&rel=0&modestbranding=1&playsinline=1`;
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
