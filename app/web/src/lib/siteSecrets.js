// Segredos das configurações (SMTP, SendGrid, VAPID, IA).
//
// Desde a migração `segredos_fora_da_api` estes valores vivem em private.site_secrets, fora da
// API: o painel não os recebe, só sabe se estão definidos (`site_secrets_status`). Por isso o
// campo vazio, ao gravar, quer dizer "manter"; para retirar há `site_secret_clear`.
// Sem a migração (base de dados antiga) o estado não existe e tudo funciona como antes: os
// valores vêm nas colunas e gravam-se tal como estão.
import { supabase } from '@/lib/supabaseClient';

export const SECRET_KEYS = ['smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key', 'brevo_api_key', 'cloudflare_email_token'];

/** { chave: { set, updatedAt } }, ou `null` se a base de dados ainda não tem a migração. */
export async function loadSecretStatus() {
  const { data, error } = await supabase.rpc('site_secrets_status');
  if (error || !Array.isArray(data)) return null;
  return Object.fromEntries(data.map((r) => [r.key, { set: !!r.is_set, updatedAt: r.updated_at || null }]));
}

export async function clearSecret(key) {
  if (!SECRET_KEYS.includes(key)) throw new Error('Segredo desconhecido.');
  const { error } = await supabase.rpc('site_secret_clear', { p_key: key });
  if (error) throw error;
}

/**
 * Os campos de segredo a mandar na gravação.
 * Com o estado disponível, só os que têm valor novo (vazio = manter). Sem ele, todos, como
 * sempre foi (o valor no formulário é o que está na coluna).
 */
export function secretsForSave(form, status) {
  const out = {};
  for (const key of SECRET_KEYS) {
    const value = String(form?.[key] ?? '').trim();
    if (!status) out[key] = value;
    else if (value) out[key] = value;
  }
  return out;
}

/** O formulário sem os segredos (para os juntar depois com `secretsForSave`). */
export function withoutSecrets(data) {
  const copy = { ...data };
  for (const key of SECRET_KEYS) delete copy[key];
  return copy;
}
