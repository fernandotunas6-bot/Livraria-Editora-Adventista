-- Email por API (Brevo ou Cloudflare Email Sending).
--
-- As Edge Functions do Supabase não abrem ligações SMTP nas portas 25 e 587, por isso o SMTP
-- da forma que os fornecedores indicam (porta 587) nunca entregaria. Por API HTTPS não há esse
-- limite. As chaves novas seguem o mesmo caminho das outras (20261104094000_segredos_fora_da_api):
-- o painel grava-as em site_settings, um gatilho passa-as para private.site_secrets e limpa a
-- coluna, e só a Edge Function as lê.

alter table public.site_settings
  add column if not exists brevo_api_key text default '',
  add column if not exists cloudflare_email_token text default '',
  add column if not exists cloudflare_account_id text default '';

alter table private.site_secrets drop constraint if exists site_secrets_key_check;
alter table private.site_secrets add constraint site_secrets_key_check
  check (key in ('smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key',
                 'brevo_api_key', 'cloudflare_email_token'));

create or replace function private.capture_site_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text;
  v text;
begin
  foreach k in array array['smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key',
                           'brevo_api_key', 'cloudflare_email_token'] loop
    v := nullif(btrim(coalesce(to_jsonb(new) ->> k, '')), '');
    if v is not null then
      insert into private.site_secrets (key, value, updated_at, updated_by)
      values (k, left(v, 4000), now(), auth.uid())
      on conflict (key) do update
        set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    end if;
  end loop;
  new.smtp_password := '';
  new.sendgrid_api_key := '';
  new.vapid_private_key := '';
  new.gemini_api_key := '';
  new.deepseek_api_key := '';
  new.brevo_api_key := '';
  new.cloudflare_email_token := '';
  return new;
end;
$$;
revoke all on function private.capture_site_secrets() from public, anon, authenticated;

create or replace function public.site_secrets_status()
returns table (key text, is_set boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_settings') then
    raise exception 'Sem permissão para esta operação.' using errcode = '42501';
  end if;
  return query
    select k.key, s.key is not null, s.updated_at
    from unnest(array['smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key',
                      'brevo_api_key', 'cloudflare_email_token']) as k(key)
    left join private.site_secrets s on s.key = k.key;
end;
$$;
revoke all on function public.site_secrets_status() from public, anon;
grant execute on function public.site_secrets_status() to authenticated;
