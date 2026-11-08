/**
 * Livros digitais: a biblioteca de quem comprou e os acessos que a equipa vê. Migração:
 * supabase/migrations/20261108160000_livros_digitais.sql.
 *
 * A regra está na base de dados e é uma só: um livro pago abre com a encomenda PAGA (pagamento
 * confirmado pelo gateway ou por quem tem "Confirmar pagamentos") e sem bloqueio da loja. Aqui
 * decide-se só o que mostrar: o estado em palavras simples, o que falta, e que botão dar.
 *
 * Sem a migração aplicada (o site pode sair antes da base de dados), tudo devolve vazio.
 */
import { supabase } from '@/lib/supabaseClient';
import { kwanza } from '@/lib/money';

/** Os estados, pela ordem em que interessam à equipa. `tone`: ok (aberto), wait (falta algo), off (fechado). */
export const DIGITAL_STATES = {
  payment_review: { label: 'Pagamento por confirmar', staffLabel: 'Pagamento por confirmar', tone: 'wait', hint: 'Recebemos a indicação do pagamento: o livro abre assim que a loja o confirmar.' },
  awaiting_payment: { label: 'Por pagar', staffLabel: 'Por pagar', tone: 'wait', hint: 'Abre quando o pagamento da encomenda for confirmado.' },
  partially_paid: { label: 'Pago em parte', staffLabel: 'Pago em parte', tone: 'wait', hint: 'Abre quando a encomenda estiver paga por inteiro.' },
  open: { label: 'Disponível', staffLabel: 'Aberto', tone: 'ok', hint: '' },
  no_account: { label: 'Disponível', staffLabel: 'Pago, sem conta', tone: 'wait', hint: 'Pago. O cliente abre-o quando entrar com o email da encomenda.' },
  blocked: { label: 'Bloqueado', staffLabel: 'Bloqueado', tone: 'off', hint: 'O acesso foi bloqueado pela loja. Fale connosco para saber mais.' },
  refunded: { label: 'Reembolsado', staffLabel: 'Reembolsado', tone: 'off', hint: 'O acesso fechou com o reembolso da encomenda.' },
};

export const STATE_ORDER = Object.keys(DIGITAL_STATES);

export const digitalState = (key) => DIGITAL_STATES[key] || DIGITAL_STATES.awaiting_payment;

export const TONE_CLASS = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
  wait: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200',
  off: 'bg-muted text-muted-foreground',
};

/** O que falta para abrir, em palavras simples (para quem comprou). */
export function libraryHint(item) {
  if (!item) return '';
  if (item.state === 'partially_paid') {
    const left = Math.max(Number(item.total || 0) - Number(item.amount_paid || 0), 0);
    if (left > 0) return `Falta pagar ${kwanza(left)} da encomenda ${item.order_number || ''}`.trim() + '.';
  }
  return digitalState(item.state).hint;
}

/** Que botões dar a quem comprou: abrir/descarregar, pagar, ou falar connosco. */
export function libraryActions(item, { inlinePdf = true } = {}) {
  switch (item?.state) {
    case 'open':
      return inlinePdf ? ['open', 'download'] : ['download'];
    case 'awaiting_payment':
    case 'partially_paid':
      return ['pay'];
    case 'blocked':
    case 'refunded':
      return ['contact'];
    default:
      return [];
  }
}

/**
 * O navegador mostra o PDF numa página? No Android, o Chrome não mostra: descarrega e abre com a
 * aplicação do telemóvel. Aí dá-se só "Descarregar", que faz o mesmo sem deixar um separador vazio.
 */
export function inlinePdfSupported(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  return !/Android/i.test(String(userAgent || ''));
}

/** "Aberto 2 vezes · última a 8/11/2026". */
export function downloadsLabel(count, last) {
  const n = Number(count) || 0;
  if (!n) return 'Ainda não abriu';
  const d = last ? new Date(last) : null;
  const when = d && !Number.isNaN(d.getTime()) ? ` · última a ${d.toLocaleDateString('pt-AO')}` : '';
  return `${n === 1 ? 'Aberto 1 vez' : `Aberto ${n} vezes`}${when}`;
}

/** Contagem por estado, para os filtros do painel. */
export function countByState(rows = []) {
  const out = Object.fromEntries(STATE_ORDER.map((k) => [k, 0]));
  for (const r of rows) if (r?.state in out) out[r.state] += 1;
  return out;
}

function isMissing(error) {
  return /42P01|42883|PGRST20[25]|does not exist|Could not find the (table|function)/i.test(`${error?.code || ''} ${error?.message || ''}`);
}

/** A biblioteca de quem tem sessão. */
export async function loadMyLibrary() {
  const { data, error } = await supabase.rpc('my_digital_library');
  if (error) {
    if (isMissing(error)) return [];
    throw new Error(error.message || 'Não foi possível abrir a biblioteca.');
  }
  return Array.isArray(data) ? data : [];
}

// --- Equipa -----------------------------------------------------------------------------

/** Os acessos aos livros digitais: `{ rows, missing }`. */
export async function loadDigitalAccess({ search = '', state = '' } = {}) {
  const { data, error } = await supabase.rpc('digital_access_overview', { p_search: search || '', p_state: state || '', p_limit: 500 });
  if (error) {
    if (isMissing(error)) return { rows: [], missing: true };
    throw new Error(error.message || 'Não foi possível carregar os acessos.');
  }
  return { rows: Array.isArray(data) ? data : [], missing: false };
}

export async function blockDigitalAccess({ downloadId, userId, reason }) {
  const clean = String(reason || '').replace(/\s+/g, ' ').trim();
  if (clean.length < 3) throw new Error('Escreva o motivo (pelo menos 3 letras).');
  const { error } = await supabase.from('download_blocks').insert({ download_id: downloadId, user_id: userId, reason: clean.slice(0, 300) });
  if (error) throw new Error(/download_blocks_one/.test(error.message || '') ? 'Este acesso já está bloqueado.' : error.message);
}

export async function unblockDigitalAccess({ downloadId, userId }) {
  const { error } = await supabase.from('download_blocks').delete().eq('download_id', downloadId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
