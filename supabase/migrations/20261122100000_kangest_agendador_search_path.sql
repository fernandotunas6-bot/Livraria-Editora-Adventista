-- O agendador do KanGest falhava de 5 em 5 minutos desde que a ligação foi configurada:
--
--   function http_post(url => text, body => jsonb, headers => jsonb, timeout_milliseconds => integer) does not exist
--
-- A 20261119120000 criou private.run_kangest com `set search_path = 'net, extensions'`. Entre aspas,
-- o conjunto é *um* schema com o nome literal «net, extensions», que não existe — o mesmo erro que a
-- 20261102170000 corrigiu na fila de emails. Os segredos do Vault estavam lá, por isso a função
-- passava do `return` e caía no `http_post`: a fila (NE/FR/NC), o stock e as vendas do KanGest
-- deixaram de chegar ao site e ao Painel de Gestão.
--
-- Muda-se só o search_path, sem tocar no corpo. A próxima volta do agendador já chama a Edge
-- Function e despeja o que ficou em fila (a reserva da 20261119181000 evita documentos em dobro).
-- Para confirmar:
--
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'kangest')
--    order by start_time desc limit 5;

alter function private.run_kangest() set search_path = net, extensions;
