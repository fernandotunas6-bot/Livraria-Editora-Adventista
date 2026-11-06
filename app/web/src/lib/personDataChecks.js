import { isValidAngolaPhone } from '@/lib/angolaPhone';

/**
 * O que falta, ou não bate certo, num cliente ou funcionário. Só avisa: não altera nada.
 * Usado na ficha do módulo Utilizadores. Devolve textos prontos a mostrar, por ordem de importância.
 */
export function personDataWarnings(person) {
  if (!person) return [];
  const warnings = [];
  if (!String(person.email || '').trim()) warnings.push('Falta o email.');
  if (!String(person.name || '').trim()) warnings.push('Falta o nome.');

  const phone = String(person.phone || '').trim();
  if (!phone) warnings.push('Falta o telefone.');
  else if (!isValidAngolaPhone(phone)) warnings.push('Telefone incompleto: confirmar o número.');

  if (person.has_account && !person.email_confirmed) warnings.push('Email da conta por confirmar.');
  return warnings;
}
