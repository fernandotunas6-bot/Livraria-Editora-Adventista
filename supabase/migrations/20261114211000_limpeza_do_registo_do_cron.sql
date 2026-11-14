-- O registo das execuções do pg_cron deixa de crescer sem fim (análise crítica de 2026-11-14).
--
-- O pg_cron escreve uma linha em cron.job_run_details por cada execução e nunca as apaga. Com 13
-- tarefas — uma delas de minuto a minuto (comunidade-links) — eram 23 374 linhas em 12 dias
-- (~2 000 por dia, ~700 000 por ano), e já era a maior tabela da base (4,2 MB). Serve para ver se
-- as tarefas correm e porque falharam; para isso chegam as últimas duas semanas.
--
-- Tarefa diária 'limpeza-cron' (03:53 UTC, fora das outras limpezas): apaga as execuções que
-- acabaram há mais de 14 dias.
--
-- Reverter: select cron.unschedule('limpeza-cron');

do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpeza-cron') then
    perform cron.unschedule('limpeza-cron');
  end if;
  perform cron.schedule('limpeza-cron', '53 3 * * *',
    $job$delete from cron.job_run_details where end_time < now() - interval '14 days'$job$);
exception when others then
  raise notice 'Não foi possível agendar a limpeza do registo do pg_cron (%).', sqlerrm;
end
$$;
