// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Níveis dos leitores (migração 20261108131000_niveis_dos_leitores; decisões do dono de
// 2026-11-08). Toda a conta começa como «Conta nova»; ao pagar o primeiro livro passa a «Leitor» e
// entra na Comunidade de Leitores; depois sobe por livros comprados. Quem participa sem comprar
// também entra, ao fim de algum tempo. São distintivos e reconhecimento: não mexem em preços.
//
// Aqui só o que é puro (nomes, progresso, quem publica), para os ecrãs e os testes. Quem manda é
// a base de dados: o nível só muda pelas funções do servidor, e publicar é recusado lá.

export const READER_LEVELS = {
  novo: { rank: 0, label: 'Conta nova', short: 'Conta nova', description: 'Ainda não faz parte da Comunidade de Leitores.' },
  leitor: { rank: 1, label: 'Leitor', short: 'Leitor', description: 'Membro da Comunidade de Leitores.' },
  assiduo: { rank: 2, label: 'Leitor assíduo', short: 'Assíduo', description: 'Já leu vários livros connosco.' },
  honra: { rank: 3, label: 'Leitor de honra', short: 'Honra', description: 'Um dos leitores mais fiéis da Livraria.' },
};

export const DEFAULT_READER_RULES = { engage_enabled: true, engage_min_days: 30, engage_active_days: 5, tier_assiduo: 5, tier_honra: 15 };

export const levelInfo = (level) => READER_LEVELS[level] || READER_LEVELS.novo;
export const isMember = (level) => levelInfo(level).rank >= 1;

/** Criar publicações: os Leitores e a equipa. Responder e gostar é para todos. */
export const canPublish = ({ level, staff = false } = {}) => !!staff || isMember(level);

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * O que falta para o nível seguinte, a partir do estado da conta (`reader_status`):
 * `{ next, missing, ratio, text }`, ou null no último nível.
 */
export function nextTier(status) {
  if (!status) return null;
  const books = Number(status.books) || 0;
  const tiers = { assiduo: 5, honra: 15, ...(status.tiers || {}) };
  if (status.level === 'honra') return null;
  if (status.level === 'novo') {
    return { next: 'leitor', missing: 1, ratio: 0, text: 'Compre o primeiro livro para entrar na Comunidade de Leitores.' };
  }
  const next = books >= tiers.assiduo || status.level === 'assiduo' ? 'honra' : 'assiduo';
  const goal = tiers[next];
  const missing = Math.max(1, goal - books);
  return {
    next,
    missing,
    ratio: Math.min(1, books / goal),
    text: `${missing === 1 ? 'Falta' : 'Faltam'} ${plural(missing, 'livro', 'livros')} para ${READER_LEVELS[next].label}.`,
  };
}

/**
 * O caminho sem compra: quantos dias activos tem, quantos precisa, e a idade da conta.
 * `{ enabled, daysActive, daysNeeded, accountDays, minDays, ratio, text }`, ou null para quem já
 * é Leitor.
 */
export function engagePath(status) {
  if (!status || status.level !== 'novo') return null;
  const e = { enabled: true, min_days: 30, active_days: 5, account_days: 0, days_active: 0, ...(status.engage || {}) };
  if (!e.enabled) return { enabled: false, text: 'Entra-se na comunidade com a compra do primeiro livro.' };
  const daysLeft = Math.max(0, e.min_days - e.account_days);
  const activeLeft = Math.max(0, e.active_days - e.days_active);
  const ratio = Math.min(1, (Math.min(e.account_days, e.min_days) / e.min_days + Math.min(e.days_active, e.active_days) / e.active_days) / 2);
  const dias = (n) => plural(n, 'dia', 'dias');
  let text;
  if (activeLeft > 0 && daysLeft > 0) text = `Ou entre sem comprar: participe em mais ${dias(activeLeft)} e espere que a conta faça ${e.min_days} dias (faltam ${daysLeft}).`;
  else if (activeLeft > 0) text = `Ou entre sem comprar: participe em mais ${dias(activeLeft)}.`;
  else if (daysLeft > 0) text = `Ou entre sem comprar: a conta faz ${e.min_days} dias daqui a ${dias(daysLeft)}.`;
  else text = 'Já cumpre a regra da participação: entra na próxima visita.';
  return {
    enabled: true,
    daysActive: e.days_active,
    daysNeeded: e.active_days,
    accountDays: e.account_days,
    minDays: e.min_days,
    ratio,
    text,
  };
}

/** A data em Luanda (YYYY-MM-DD), para contar um dia de actividade por conta. */
export function luandaDay(date = new Date()) {
  return new Date(date.getTime() + 3600 * 1000).toISOString().slice(0, 10);
}
