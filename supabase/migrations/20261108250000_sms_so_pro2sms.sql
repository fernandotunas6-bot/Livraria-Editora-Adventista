-- SMS só pela PRO2SMS: a Twilio sai (decisão do dono, 2026-11-08). Guia em docs/SMS.md.
--
-- A 20261108240000 deixava o código na Twilio Verify. A chave da PRO2SMS não tem a permissão `otp`,
-- por isso o código passa a ser gerado pela Edge Function e guardado aqui só como HMAC, ligado à conta
-- e ao número, com um segredo fora da base de dados. Dura 10 minutos, com 5 tentativas erradas
-- (phone_verification_failed).
--
-- A 2026-11-08 não há pedidos, SMS enviadas nem a linha da integração em produção: nada a converter.
-- Os dois `delete` são para o caso de alguém ter aberto o painel ou pedido um código antes disto: um
-- pedido da Twilio não se pode verificar aqui.
--
-- Reverter: drop de phone_verification_code_ok e da coluna code_hash; repor phone_verification_start
-- de 20261108240000.

delete from public.phone_verifications;
delete from public.app_integrations where code = 'twilio';

alter table public.phone_verifications add column if not exists code_hash text not null;
comment on table public.phone_verifications is
  'O código por confirmar de cada conta, só como resumo. Só a Edge Function lhe chega.';
comment on column public.phone_verifications.code_hash is 'HMAC do código, ligado à conta e ao número, com um segredo fora da base de dados.';

drop function if exists public.phone_verification_start(uuid, text, integer);

-- Guarda o código novo. Devolve quantos segundos faltam para poder pedir outro; 0 = guardado.
create or replace function public.phone_verification_start(p_user uuid, p_phone text, p_code_hash text, p_minutes integer default 10)
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
  insert into public.phone_verifications (user_id, phone, code_hash, attempts, sent_at, expires_at)
  values (p_user, p_phone, p_code_hash, 0, now(), now() + make_interval(mins => p_minutes))
  on conflict (user_id) do update
    set phone = excluded.phone, code_hash = excluded.code_hash, attempts = 0,
        sent_at = excluded.sent_at, expires_at = excluded.expires_at;
  return 0;
end;
$$;

-- O código está certo? Só enquanto valer. Quem conta as tentativas é phone_verification_failed.
create or replace function public.phone_verification_code_ok(p_user uuid, p_code_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_server();
  return coalesce((
    select code_hash = p_code_hash
    from public.phone_verifications where user_id = p_user and expires_at >= now()
  ), false);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.phone_verification_start(uuid, text, text, integer)',
    'public.phone_verification_code_ok(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
