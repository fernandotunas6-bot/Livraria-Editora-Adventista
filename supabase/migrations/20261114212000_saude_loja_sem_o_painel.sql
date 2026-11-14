-- Saúde do site: a linha «todas as páginas» passa a ser a da loja, sem o painel da equipa
-- (análise crítica de 2026-11-14).
--
-- As Core Web Vitals de topo (página '*') juntavam as visitas da equipa ao /admin — um ecrã pesado,
-- aberto em computador por quem lá trabalha — às de quem compra. Numa loja com pouco tráfego, isso
-- desvia o número que mais importa: nos primeiros dias de medição, um terço das amostras de LCP no
-- computador eram do painel. As linhas de cada página continuam todas (o /admin incluído, para a
-- equipa ver o seu); só a soma de topo deixa o /admin de fora.
--
-- Reverter: voltar a public.site_health_vitals de 20261111090000_saude_do_site.

create or replace function public.site_health_vitals(p_days integer default 7)
returns table (page text, device text, name text, p75 double precision, median double precision, samples bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('manage_settings') then
    raise exception 'Sem permissão para ver a saúde do site.' using errcode = '42501';
  end if;
  return query
    with ev as (
      select e.page, e.device, e.name, e.value
        from private.site_events e
       where e.kind = 'vital'
         and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
    ), linhas as (
      select ev.page as pg, ev.device as dv, ev.name as nm,
             private.site_health_p75(array_agg(ev.value)) as p75v,
             percentile_cont(0.5) within group (order by ev.value) as med,
             count(*) as n
        from ev
       group by ev.page, ev.device, ev.name
      union all
      select '*', ev.device, ev.name,
             private.site_health_p75(array_agg(ev.value)),
             percentile_cont(0.5) within group (order by ev.value),
             count(*)
        from ev
       where ev.page <> '/admin' and ev.page not like '/admin/%'
       group by ev.device, ev.name
    )
    select l.pg, l.dv, l.nm, l.p75v, l.med, l.n
      from linhas l
     order by (l.pg <> '*'), l.n desc, 1, 2, 3;
end;
$$;
revoke all on function public.site_health_vitals(integer) from public, anon;
grant execute on function public.site_health_vitals(integer) to authenticated;
