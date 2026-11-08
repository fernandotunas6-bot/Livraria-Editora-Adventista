-- SMS pela Twilio e confirmação do telefone por código (docs/SMS.md).
--
-- As credenciais são os segredos TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN da Edge Function: não ficam
-- na base de dados. As opções (remetente, o que vai por SMS, teto diário) ficam em app_integrations,
-- código 'twilio'.
--
-- 1. O registo de envios aceita o tipo 'sms' e o contexto 'otp'. O conteúdo das SMS de contexto
--    'otp' não se grava: tem o código.
-- 2. profiles.phone_verified_at: o telefone foi confirmado por código, nesta conta.
--    * Quem usa o site não o pode escrever: só a função de confirmação.
--    * Mudar o telefone, por qualquer caminho, tira a confirmação.
--    * Um número só fica confirmado numa conta: quem prova que o tem tira-o da conta anterior.
-- 3. phone_verifications: o número à espera de confirmação em cada conta. O código é gerado e
--    guardado pela Twilio Verify; aqui fica a garantia de que se confirma o número pedido por esta
--    conta, e não outro, além da espera de 60 segundos e de um limite de 5 tentativas erradas. Só a
--    Edge Function lhe chega.
--
-- Reverter: drop das funções phone_verification_*, da tabela phone_verifications, do gatilho e da
-- função profiles_phone_verified_guard, do índice e da coluna phone_verified_at; repor as regras
-- de notification_logs de 20261101145726 e 20261108100000.

alter table public.notification_logs drop constraint if exists notification_logs_type_check;
alter table public.notification_logs add constraint notification_logs_type_check
  check (type in ('email', 'whatsapp', 'sms'));
-- Escrito por extenso: o notificationContexts.test.ts lê a última definição.
alter table public.notification_logs drop constraint if exists notification_logs_context_check;
alter table public.notification_logs add constraint notification_logs_context_check
  check (context = any (array[
    'order', 'order_status', 'payment', 'receipt', 'account', 'welcome', 'test', 'contact', 'campaign',
    'staff_alert', 'staff_summary', 'staff_report', 'support_reply', 'support_notice', 'thanks', 'colportagem', 'otp'
  ]));

alter table public.profiles add column if not exists phone_verified_at timestamptz;
comment on column public.profiles.phone_verified_at is
  'Quando o telefone foi confirmado por código nesta conta. Vazio: por confirmar. Mudar o telefone limpa-o.';
create unique index if not exists profiles_phone_verified_uniq on public.profiles (phone)
  where phone_verified_at is not null;

-- Sem security definer de propósito: `current_user` distingue quem vem pela API das funções do servidor.
create or replace function private.profiles_phone_verified_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then new.phone_verified_at := null; end if;
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    new.phone_verified_at := old.phone_verified_at;
  end if;
  if new.phone is distinct from old.phone and new.phone_verified_at is not distinct from old.phone_verified_at then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.profiles_phone_verified_guard() from public, anon, authenticated;
-- O nome começa por "z" para correr depois do gatilho que normaliza o telefone.
drop trigger if exists profiles_z_phone_verified_guard on public.profiles;
create trigger profiles_z_phone_verified_guard
  before insert or update on public.profiles
  for each row execute function private.profiles_phone_verified_guard();

create table if not exists public.phone_verifications (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null
);
comment on table public.phone_verifications is
  'O número à espera de confirmação em cada conta. O código fica na Twilio Verify. Só a Edge Function lhe chega.';
alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from public, anon, authenticated;
grant all on public.phone_verifications to service_role;

-- Guarda o pedido. Devolve quantos segundos faltam para poder pedir outro código; 0 = guardado.
create or replace function public.phone_verification_start(p_user uuid, p_phone text, p_minutes integer default 10)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wait integer;
begin
  perform private.assert_server();
  delete from public.phone_verifications where expires_at < now() - interval '1 day';
  select ceil(extract(epoch from (sent_at + interval '60 seconds' - now())))::integer into v_wait
  from public.phone_verifications where user_id = p_user for update;
  if coalesce(v_wait, 0) > 0 then return v_wait; end if;
  insert into public.phone_verifications (user_id, phone, attempts, sent_at, expires_at)
  values (p_user, p_phone, 0, now(), now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update
    set phone = excluded.phone, attempts = 0, sent_at = excluded.sent_at, expires_at = excluded.expires_at;
  return 0;
end;
$$;

-- A SMS não saiu: o código não vale, e a pessoa não fica à espera para tentar outra vez.
create or replace function public.phone_verification_cancel(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_server();
  delete from public.phone_verifications where user_id = p_user;
end;
$$;

-- O número à espera de confirmação nesta conta, enquanto o código valer. É este que se verifica.
create or replace function public.phone_verification_pending(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_server();
  return (select phone from public.phone_verifications where user_id = p_user and expires_at >= now());
end;
$$;

-- Um código errado. Devolve quantas tentativas restam; à quinta, o pedido deixa de valer.
create or replace function public.phone_verification_failed(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  perform private.assert_server();
  update public.phone_verifications set attempts = attempts + 1 where user_id = p_user returning attempts into v_attempts;
  if v_attempts is null then return 0; end if;
  if v_attempts >= 5 then
    delete from public.phone_verifications where user_id = p_user;
    return 0;
  end if;
  return 5 - v_attempts;
end;
$$;

-- A Twilio aprovou o código: o número pedido por esta conta fica confirmado.
create or replace function public.phone_verification_confirm(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.phone_verifications;
  v_phone text;
begin
  perform private.assert_server();
  select * into v from public.phone_verifications where user_id = p_user for update;
  if not found or v.expires_at < now() then
    delete from public.phone_verifications where user_id = p_user;
    return jsonb_build_object('ok', false);
  end if;
  v_phone := public.normalize_angola_phone(v.phone);
  -- Quem prova que tem o número tira-o da conta que o tinha confirmado.
  update public.profiles set phone_verified_at = null
  where phone = v_phone and phone_verified_at is not null and id <> p_user;
  update public.profiles set phone = v_phone, phone_verified_at = now() where id = p_user;
  delete from public.phone_verifications where user_id = p_user;
  return jsonb_build_object('ok', true, 'phone', v_phone);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.phone_verification_start(uuid, text, integer)',
    'public.phone_verification_cancel(uuid)',
    'public.phone_verification_pending(uuid)',
    'public.phone_verification_failed(uuid)',
    'public.phone_verification_confirm(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
