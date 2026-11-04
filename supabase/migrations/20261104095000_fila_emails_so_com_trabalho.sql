-- O agendador da fila de emails só chama a Edge Function quando há trabalho.
--
-- Medido nos registos de 2026-11-03/04: `/cron/email-queue` foi chamado 287 vezes em 24 h
-- (de 5 em 5 minutos), com mediana de ~2 s por chamada, e a fila estava vazia em todas —
-- nem há email configurado. Cada chamada arranca a função, lê as definições e o Vault, e não
-- faz nada. Passa a perguntar primeiro à própria base de dados, com o mesmo critério do
-- `claim_email_jobs`: pendentes já vencidos, ou presos em "sending" há mais de 5 minutos.
-- Com trabalho, o comportamento é exactamente o de antes.
--
-- Reverter: a definição anterior está em 20261102170000_corrige_search_path_agendador.sql.

create or replace function private.run_email_queue()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_url text;
  v_token text;
begin
  if not exists (
    select 1
    from public.email_queue c
    where (c.status = 'pending' and c.next_attempt_at <= now())
       or (c.status = 'sending' and c.locked_at < now() - interval '5 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'email_queue_url' limit 1;

  select decrypted_secret into v_token
  from vault.decrypted_secrets where name = 'email_queue_token' limit 1;

  -- Faltar configuração não é erro: é o estado normal até alguém criar os segredos, e não
  -- deve encher `cron.job_run_details` de falhas.
  if v_url is null or v_token is null then
    raise notice 'Fila de emails: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;

  -- Sem esperar pela resposta: o `http_post` entrega o pedido ao processo do pg_net e
  -- devolve logo. Um envio lento não pode segurar o agendador, que voltaria a disparar em
  -- cima de si mesmo.
  --
  -- Sem `exception` à volta: um erro aqui tem de aparecer em `cron.job_run_details`.
  perform http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := jsonb_build_object('limit', 25),
    timeout_milliseconds := 30000
  );
end;
$$;
