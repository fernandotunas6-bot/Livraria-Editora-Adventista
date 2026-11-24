-- A ligação antiga ao KanGest fica desligada de vez (decisão de 2026-11-24, docs/KANGEST.md e docs/ECOSSISTEMA.md §12).
--
-- Era a da migração 20261119120000_kangest.sql. O site chamava a API de cada KanGest, por um túnel de entrada em cada
-- loja, e nunca chegou a funcionar em produção: o segredo KANGEST_LIGACOES nunca foi configurado. O KanGest Livraria
-- liga-se pelos postos (20261125100000_kangest_base_central.sql): é ele que chama o site, sem túnel, assinado e cifrado.
--
-- O agendador «kangest» corria de 5 em 5 minutos e chamava a Edge Function, que respondia 404 por não haver
-- KANGEST_CRON_TOKEN: cerca de 8 600 invocações por mês sem fazer nada. Sai o agendador. O resto fica, inerte:
-- - a fila (kangest_fila) só recebe documentos com kangest_estado.activo = true, e está a false;
-- - as rotas respondem 404 sem os segredos.
--
-- Voltar a ligar (só com a ligação antiga configurada):
--   select cron.schedule('kangest', '*/5 * * * *', 'select private.run_kangest()');
do $$
begin
  perform cron.unschedule('kangest') where exists (select 1 from cron.job where jobname = 'kangest');
exception when others then
  raise notice 'Agendador do KanGest: nada a desligar (%).', sqlerrm;
end
$$;
