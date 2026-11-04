-- Segredos das configurações fora do alcance da API.
--
-- `site_settings` tinha colunas para a palavra-passe SMTP, a chave SendGrid, a chave privada
-- VAPID e as chaves de IA. Quem tem "Configurações" lia-as em texto simples pela API REST (e
-- o painel descarregava-as para o browser em cada abertura). Uma sessão de gestor roubada, ou
-- uma extensão do browser, levava as credenciais de email e de IA.
--
-- Passam para `private.site_secrets`, que a API não expõe. Um trigger em `site_settings`
-- apanha o valor quando o painel o grava e deixa a coluna vazia: o painel actual continua a
-- funcionar sem mudanças, e o novo só mostra "definida / não definida". Valor vazio ao gravar
-- = manter o que está (o painel não volta a receber o valor, por isso vazio é o normal);
-- retirar é `site_secret_clear`. A Edge Function lê-os com `site_secret_values`, só para a
-- service role, e um segredo da função (SMTP_PASSWORD, GEMINI_API_KEY…) continua a ganhar.
--
-- A 2026-11-04 os cinco campos estão vazios nas três linhas: nada a migrar, mas o passo fica.
-- Reverter: drop trigger + funções; os valores ficam em private.site_secrets para os repor.

create table if not exists private.site_secrets (
  key text primary key
    check (key in ('smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key')),
  value text not null check (char_length(value) between 1 and 4000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table private.site_secrets enable row level security;
revoke all on private.site_secrets from public, anon, authenticated;
comment on table private.site_secrets is
  'Credenciais das configurações (SMTP, SendGrid, VAPID, IA). Só a service role as lê, via site_secret_values().';

-- Valores que já estejam nas colunas: vão para a tabela privada (da linha que a função usa, a
-- mais antiga) e as colunas ficam vazias em todas as linhas.
insert into private.site_secrets (key, value)
select x.key, btrim(x.value)
from (
  select * from public.site_settings order by created asc, id desc limit 1
) s
cross join lateral (values
  ('smtp_password', s.smtp_password),
  ('sendgrid_api_key', s.sendgrid_api_key),
  ('vapid_private_key', s.vapid_private_key),
  ('gemini_api_key', s.gemini_api_key),
  ('deepseek_api_key', s.deepseek_api_key)
) as x(key, value)
where nullif(btrim(coalesce(x.value, '')), '') is not null
on conflict (key) do nothing;

update public.site_settings
set smtp_password = '', sendgrid_api_key = '', vapid_private_key = '', gemini_api_key = '', deepseek_api_key = ''
where coalesce(smtp_password, '') <> '' or coalesce(sendgrid_api_key, '') <> ''
   or coalesce(vapid_private_key, '') <> '' or coalesce(gemini_api_key, '') <> ''
   or coalesce(deepseek_api_key, '') <> '';

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
  foreach k in array array['smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key'] loop
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
  return new;
end;
$$;
revoke all on function private.capture_site_secrets() from public, anon, authenticated;

drop trigger if exists site_settings_capture_secrets on public.site_settings;
create trigger site_settings_capture_secrets
  before insert or update on public.site_settings
  for each row execute function private.capture_site_secrets();

-- Para o painel: que segredos estão definidos, sem os valores.
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
    from unnest(array['smtp_password', 'sendgrid_api_key', 'vapid_private_key', 'gemini_api_key', 'deepseek_api_key']) as k(key)
    left join private.site_secrets s on s.key = k.key;
end;
$$;
revoke all on function public.site_secrets_status() from public, anon;
grant execute on function public.site_secrets_status() to authenticated;

-- Para o painel: retirar um segredo (gravar vazio mantém-no).
create or replace function public.site_secret_clear(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_settings') then
    raise exception 'Sem permissão para esta operação.' using errcode = '42501';
  end if;
  delete from private.site_secrets where key = p_key;
end;
$$;
revoke all on function public.site_secret_clear(text) from public, anon;
grant execute on function public.site_secret_clear(text) to authenticated;

-- Para a Edge Function: os valores. Só a service role.
create or replace function public.site_secret_values()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) from private.site_secrets s;
$$;
revoke all on function public.site_secret_values() from public, anon, authenticated;
grant execute on function public.site_secret_values() to service_role;
