/**
 * Faixa de aviso no cabeçalho: que aviso mostrar, o link, as datas e os avisos fechados.
 * As regras são as da migração 20261106210000_faixa_de_aviso (a base de dados é que manda:
 * só devolve aos visitantes os avisos ligados e dentro das datas).
 */

export const NOTICE_TONES = [
  { value: 'urgent', label: 'Urgente', hint: 'Fecho, atraso, mudança importante', className: 'bg-amber-400 text-amber-950' },
  { value: 'promo', label: 'Promoção', hint: 'Campanha, desconto, novidade', className: 'bg-emerald-700 text-white' },
  { value: 'info', label: 'Informação', hint: 'Aviso geral', className: 'bg-primary text-primary-foreground' },
];
const TONE_RANK = { urgent: 0, promo: 1, info: 2 };
const BY_TONE = Object.fromEntries(NOTICE_TONES.map((t) => [t.value, t]));
export const noticeTone = (tone) => BY_TONE[tone] || BY_TONE.info;

export const MESSAGE_MAX = 200;
export const LABEL_MAX = 40;

const time = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
};

/** 'off' (desligado), 'scheduled' (ainda não começou), 'ended' (já acabou) ou 'live'. */
export function noticeStatus(notice, now = Date.now()) {
  if (!notice?.active) return 'off';
  const start = time(notice.starts_at);
  const end = time(notice.ends_at);
  if (start != null && start > now) return 'scheduled';
  if (end != null && end <= now) return 'ended';
  return 'live';
}

/** Urgente primeiro, depois promoção e informação; no mesmo tom, o que começou mais tarde. */
export function sortNotices(notices) {
  return [...(notices || [])].sort((a, b) => {
    const rank = (TONE_RANK[a.tone] ?? 2) - (TONE_RANK[b.tone] ?? 2);
    if (rank) return rank;
    return (time(b.starts_at) ?? time(b.created) ?? 0) - (time(a.starts_at) ?? time(a.created) ?? 0);
  });
}

/**
 * Chave de um aviso para o lembrar fechado. Muda com o texto e o link: corrigir o aviso
 * mostra-o outra vez a quem o fechou. Mudar só as datas não.
 */
export function noticeKey(notice) {
  const text = `${notice?.message || ''}|${notice?.link_url || ''}|${notice?.link_label || ''}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${notice?.id || ''}:${hash.toString(36)}`;
}

/** O aviso a mostrar agora, ou null. Um fechado (e que se deixa fechar) dá lugar ao seguinte. */
export function pickNotice(notices, { now = Date.now(), dismissed = [] } = {}) {
  const closed = new Set(dismissed);
  return sortNotices(notices).find((n) => noticeStatus(n, now) === 'live'
    && String(n.message || '').trim()
    && !(n.dismissible !== false && closed.has(noticeKey(n)))) || null;
}

/** 'internal' para um caminho do site, 'external' para http(s), '' para vazio ou inválido. */
export function noticeLinkKind(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.length <= 300 && /^\/([^/\\\s<>"'][^\s<>"']*)?$/.test(u)) return 'internal';
  if (u.length <= 500 && /^https?:\/\/[^\s<>"'@/\\]+(\/[^\s<>"']*)?$/i.test(u)) return 'external';
  return '';
}

/** Erro do formulário do painel, ou '' (as mesmas regras da base de dados). */
export function noticeFormError(form) {
  const message = String(form?.message || '').trim();
  if (!message) return 'Escreva o aviso.';
  if (message.length > MESSAGE_MAX) return `O aviso tem mais de ${MESSAGE_MAX} caracteres.`;
  if (String(form?.link_url || '').trim() && !noticeLinkKind(form.link_url)) {
    return 'O link tem de ser uma página do site (/materiais) ou um endereço que comece por https://.';
  }
  if (String(form?.link_label || '').trim().length > LABEL_MAX) return `O texto do link tem mais de ${LABEL_MAX} caracteres.`;
  const start = time(form?.starts_at);
  const end = time(form?.ends_at);
  if (start != null && end != null && end <= start) return 'O fim tem de ser depois do início.';
  return '';
}

const pad = (n) => String(n).padStart(2, '0');

/** ISO → valor de <input type="datetime-local"> na hora de quem edita. */
export function toLocalInput(value) {
  const t = time(value);
  if (t == null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> (hora local) → ISO, ou null se vazio. */
export function fromLocalInput(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
