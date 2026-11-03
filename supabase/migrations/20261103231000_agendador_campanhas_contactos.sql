-- Agendador das campanhas de contactos: `pg_cron` a chamar a Edge Function de 15 em 15 minutos.
--
-- As campanhas tinham `next_send_at` calculado e guardado, mas **nada o disparava**. A rota
-- `/contacts/campaigns/run-due` exige sessão de staff e era chamada por um botão no painel,
-- atrás de uma confirmação. Ou seja: uma campanha "semanal" saía quando alguém se lembrava de
-- abrir o separador e carregar — ou não saía.
--
-- 15 minutos e não 5: as frequências são diária, semanal e mensal, por isso um ciclo mais
-- curto só acrescentava chamadas sem nada para fazer.
--
-- Segue o padrão já corrigido em `20261102170000_corrige_search_path_agendador.sql`:
-- `search_path` como lista de identificadores **sem aspas**, e **sem `exception` à volta do
-- `http_post`** — foi engolir esse erro que deixou o agendador dos emails a reportar sucesso
-- durante meia hora sem enviar nada.
--
-- **Não há segredos neste ficheiro.** O endereço vem do Vault; o token é o mesmo do agendador
-- da fila de emails (`email_queue_token`), porque é a mesma fronteira de confiança: quem pode
-- disparar o agendador.

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron indisponível (%): as campanhas ficam manuais.', sqlerrm;
end
$$;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net indisponível (%): as campanhas ficam manuais.', sqlerrm;
end
$$;

create or replace function private.run_contact_campaigns()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'contact_campaigns_url' limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'email_queue_token' limit 1;

  -- Faltar configuração não é erro: é o estado normal até alguém criar os segredos, e não
  -- deve encher `cron.job_run_details` de falhas.
  if v_url is null or v_token is null then
    raise notice 'Campanhas: faltam os segredos contact_campaigns_url/email_queue_token no Vault.';
    return;
  end if;

  -- Sem esperar pela resposta, e sem `exception` à volta: um erro aqui tem de aparecer em
  -- `cron.job_run_details`, que é onde se vai procurá-lo.
  perform http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function private.run_contact_campaigns() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('campanhas-de-contactos');
exception when others then
  null;
end
$$;

do $$
begin
  perform cron.schedule('campanhas-de-contactos', '*/15 * * * *', 'select private.run_contact_campaigns();');
  raise notice 'Campanhas de contactos agendadas de 15 em 15 minutos.';
exception when others then
  raise notice 'Não foi possível agendar as campanhas (%): ficam manuais pelo painel.', sqlerrm;
end
$$;

-- Diagnóstico para o painel, igual ao da fila de emails: responde a "o agendador está mesmo a
-- correr, ou as campanhas só saem com o botão?". Sem isto, o painel mostra campanhas pendentes
-- sem dizer porquê.
create or replace function public.contact_campaigns_scheduler_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_has_secrets boolean := false;
begin
  -- A service role vem da Edge Function, que já verificou a permissão de quem pediu. Sem esta
  -- excepção a função respondia sempre "Sem permissão.": `has_permission` lê o utilizador do
  -- token, e numa chamada com service role não há utilizador. É o mesmo erro que foi
  -- encontrado e corrigido em `20261102160000_estado_agendador_service_role.sql` para a fila
  -- de emails. A verificação continua a valer para chamadas directas pela API, com sessão.
  if coalesce((select auth.role()), '') <> 'service_role'
     and not (
       coalesce((select private.has_permission('manage_users')), false)
       or coalesce((select private.has_permission('manage_marketing')), false)
     ) then
    raise exception 'Sem permissão.';
  end if;

  begin
    select jobid, schedule, active into v_job
    from cron.job where jobname = 'campanhas-de-contactos' limit 1;
  exception when others then
    return jsonb_build_object('available', false, 'reason', 'pg_cron indisponível');
  end;

  begin
    select count(*) = 2 into v_has_secrets
    from vault.decrypted_secrets
    where name in ('contact_campaigns_url', 'email_queue_token');
  exception when others then
    v_has_secrets := false;
  end;

  if v_job.jobid is null then
    return jsonb_build_object('available', true, 'scheduled', false, 'secrets', v_has_secrets);
  end if;

  return jsonb_build_object(
    'available', true,
    'scheduled', coalesce(v_job.active, false),
    'schedule', v_job.schedule,
    'secrets', v_has_secrets
  );
end;
$$;

revoke execute on function public.contact_campaigns_scheduler_status() from public, anon;
grant execute on function public.contact_campaigns_scheduler_status() to authenticated, service_role;
