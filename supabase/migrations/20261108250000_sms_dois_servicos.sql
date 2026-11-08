-- SMS por dois serviços: PRO2SMS e Twilio (docs/SMS.md).
--
-- O painel escolhe quem envia os códigos e quem envia os avisos (app_integrations, código 'sms').
-- Um pedido de confirmação guarda o serviço por onde saiu, e é por esse que se verifica, mesmo que
-- a escolha mude entretanto:
--   * twilio: a Twilio Verify gera e guarda o código. Aqui não fica nada dele.
--   * pro2sms: a chave da PRO2SMS não tem a permissão `otp`, por isso o código é gerado pela Edge
--     Function e guardado só como HMAC, ligado à conta e ao número, com um segredo fora da base de
--     dados. Conta com o limite de 5 tentativas de phone_verification_failed.
--
-- phone_verification_start muda de assinatura e phone_verification_pending dá lugar a
-- phone_verification_info. A 2026-11-08 não há pedidos nem SMS enviadas em produção, por isso a troca
-- não apanha ninguém a meio.
--
-- Reverter: drop de phone_verification_info e phone_verification_code_ok e das colunas provider e
-- code_hash; repor phone_verification_start e phone_verification_pending de 20261108240000.

alter table public.phone_verifications
  add column if not exists provider text not null default 'twilio',
  add column if not exists code_hash text;
alter table public.phone_verifications drop constraint if exists phone_verifications_provider_check;
-- Um pedido da PRO2SMS tem sempre o resumo do código; um da Twilio nunca o tem.
alter table public.phone_verifications add constraint phone_verifications_provider_check
  check (provider in ('twilio', 'pro2sms') and (provider = 'pro2sms') = (code_hash is not null));
comment on column public.phone_verifications.provider is 'O serviço por onde saiu o código. É por esse que se verifica.';
comment on column public.phone_verifications.code_hash is 'Só na PRO2SMS: HMAC do código, ligado à conta e ao número. Na Twilio, o código fica na Twilio Verify.';

drop function if exists public.phone_verification_start(uuid, text, integer);
drop function if exists public.phone_verification_pending(uuid);

-- Guarda o pedido. Devolve quantos segundos faltam para poder pedir outro código; 0 = guardado.
create or replace function public.phone_verification_start(
  p_user uuid, p_phone text, p_minutes integer default 10, p_provider text default 'twilio', p_code_hash text default null
)
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
  insert into public.phone_verifications (user_id, phone, provider, code_hash, attempts, sent_at, expires_at)
  values (p_user, p_phone, p_provider, p_code_hash, 0, now(), now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update
    set phone = excluded.phone, provider = excluded.provider, code_hash = excluded.code_hash, attempts = 0,
        sent_at = excluded.sent_at, expires_at = excluded.expires_at;
  return 0;
end;
$$;

-- O número à espera nesta conta e o serviço por onde saiu, enquanto o código valer. Sem o resumo.
create or replace function public.phone_verification_info(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_server();
  return (
    select jsonb_build_object('phone', phone, 'provider', provider)
    from public.phone_verifications where user_id = p_user and expires_at >= now()
  );
end;
$$;

-- O código da PRO2SMS está certo? Um pedido da Twilio não tem resumo, e nunca passa por aqui.
create or replace function public.phone_verification_code_ok(p_user uuid, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_server();
  return coalesce((
    select code_hash is not null and code_hash = p_code_hash
    from public.phone_verifications where user_id = p_user and expires_at >= now()
  ), false);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.phone_verification_start(uuid, text, integer, text, text)',
    'public.phone_verification_info(uuid)',
    'public.phone_verification_code_ok(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
