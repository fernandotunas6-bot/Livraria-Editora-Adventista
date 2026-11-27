// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

// Verificação em dois passos (TOTP do Supabase Auth): o que o site precisa de saber e fazer.
//
// A exigência a sério está no servidor: numa conta com factor verificado, as funções de
// permissão da base de dados e a Edge Function só reconhecem a equipa numa sessão `aal2`
// (migração `verificacao_dois_passos_equipa`, supabase/functions/app/mfa.ts). Aqui fica o
// ecrã: pedir o código a quem já o activou, e activar ou retirar o factor no perfil.
import { supabase } from '@/lib/supabaseClient';

/** A sessão tem de passar pelo código: há factor e ainda não foi introduzido. */
export function needsMfaChallenge(aal) {
  return aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';
}

/** Só os 6 algarismos: aceita o código colado com espaços ("123 456") ou traços. */
export function normalizeTotpCode(input) {
  return String(input ?? '').replace(/\D/g, '').slice(0, 6);
}

export const isTotpCode = (code) => /^\d{6}$/.test(code);

/** Traduz os erros do Supabase Auth para algo que se perceba. */
export function mfaErrorMessage(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('invalid') && msg.includes('code')) return 'Código incorrecto ou expirado. Confirme a hora do telemóvel e tente o código seguinte.';
  if (msg.includes('expired')) return 'O pedido expirou. Tente de novo.';
  if (msg.includes('too many') || msg.includes('rate')) return 'Demasiadas tentativas. Aguarde um minuto.';
  if (msg.includes('aal2')) return 'Introduza primeiro o código da aplicação autenticadora.';
  return 'Não foi possível concluir a verificação. Tente de novo.';
}

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Estado da conta: nível da sessão e factores TOTP verificados. */
export async function getMfaState() {
  const aal = unwrap(await supabase.auth.mfa.getAuthenticatorAssuranceLevel());
  const factors = unwrap(await supabase.auth.mfa.listFactors());
  const verified = (factors?.totp || []).filter((f) => f.status === 'verified');
  return { aal, needsChallenge: needsMfaChallenge(aal), verified, all: factors?.all || [] };
}

/** Pede um código e confirma-o: a sessão passa a `aal2`. */
export async function verifyTotp(factorId, code) {
  return unwrap(await supabase.auth.mfa.challengeAndVerify({ factorId, code: normalizeTotpCode(code) }));
}

/**
 * Começa a activação: devolve o QR e o segredo para a aplicação autenticadora.
 * Factores que ficaram a meio (lidos mas nunca confirmados) são apagados primeiro: o Supabase
 * recusa um segundo factor com o mesmo nome, e eles não protegem nada.
 */
export async function startTotpEnrollment() {
  const factors = unwrap(await supabase.auth.mfa.listFactors());
  for (const f of factors?.all || []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }
  }
  const data = unwrap(await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Autenticador ${new Date().toISOString().slice(0, 10)}`,
  }));
  // `uri` (otpauth://totp/…): num telemóvel, abre a aplicação autenticadora já com a conta, sem ler o QR
  return { factorId: data.id, qrCode: data.totp?.qr_code || '', secret: data.totp?.secret || '', uri: data.totp?.uri || '' };
}

/** A situação dos dois passos da própria conta e a política da equipa (`public.staff_mfa_status`). `null` sem ela. */
export async function getStaffMfaStatus() {
  const { data, error } = await supabase.rpc('staff_mfa_status');
  return error ? null : data;
}

/**
 * Liga (com `dias` de prazo) ou desliga a obrigação dos dois passos para a equipa. Só um administrador
 * (`public.staff_mfa_politica_definir`); fica no registo de segurança.
 */
export async function setStaffMfaPolicy(obrigatoria, dias = 7) {
  const { data, error } = await supabase.rpc('staff_mfa_politica_definir', { p_obrigatoria: obrigatoria, p_dias: dias });
  if (error) throw error;
  return data;
}

/** Termina a activação com o primeiro código gerado pela aplicação. */
export const confirmTotpEnrollment = (factorId, code) => verifyTotp(factorId, code);

/** Retira um factor. O Supabase exige uma sessão `aal2` para retirar um factor verificado. */
export async function removeTotpFactor(factorId) {
  return unwrap(await supabase.auth.mfa.unenroll({ factorId }));
}
