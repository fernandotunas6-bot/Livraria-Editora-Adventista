// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

/**
 * Código do colportor que trouxe o cliente: chega no link (livrariaadventista.ao/?c=CPT-0007,
 * também ?colportor=) e fica guardado 30 dias neste browser, para o checkout o enviar com a
 * encomenda. Quem decide se conta é a base de dados (só colportores activos); aqui só se aceita
 * o formato. Código puro com o armazenamento injectável, testado em colporteurReferral.test.js.
 */

export const REFERRAL_KEY = 'livraria_colportor_ref';
export const REFERRAL_DAYS = 30;

/** "cpt7", "CPT-0007", " cpt 7 " → "CPT-0007"; outra coisa → "". */
export function normalizeColporteurCode(value) {
  const m = String(value ?? '').trim().match(/^cpt[-\s]?0*(\d{1,6})$/i);
  return m ? `CPT-${m[1].padStart(4, '0')}` : '';
}

const storage = (s) => s ?? (typeof localStorage !== 'undefined' ? localStorage : null);

/** Lê o código do URL (?c= ou ?colportor=) e guarda-o. Devolve o código guardado, ou "". */
export function captureReferral(search, { store, now = Date.now() } = {}) {
  const params = new URLSearchParams(search || '');
  const code = normalizeColporteurCode(params.get('c') || params.get('colportor'));
  if (!code) return '';
  try { storage(store)?.setItem(REFERRAL_KEY, JSON.stringify({ code, at: now })); } catch { /* sem armazenamento */ }
  return code;
}

/** O código guardado, se ainda estiver dentro dos 30 dias. */
export function getReferral({ store, now = Date.now() } = {}) {
  try {
    const raw = storage(store)?.getItem(REFERRAL_KEY);
    if (!raw) return '';
    const { code, at } = JSON.parse(raw);
    if (!code || now - Number(at) > REFERRAL_DAYS * 86400000) return '';
    return normalizeColporteurCode(code);
  } catch {
    return '';
  }
}

/** Link de vendas do colportor (para copiar e partilhar). */
export function referralLink(code, origin = (typeof window !== 'undefined' ? window.location.origin : '')) {
  return `${origin}/?c=${encodeURIComponent(code)}`;
}
