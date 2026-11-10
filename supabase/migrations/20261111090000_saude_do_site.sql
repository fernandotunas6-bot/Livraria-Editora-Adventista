-- Saúde do site: erros de JavaScript e Core Web Vitals medidos nos aparelhos de quem visita
-- (achado A360-16 da auditoria 360°).
--
-- Até aqui, um erro de JavaScript no telemóvel de um cliente não chegava a ninguém, e a velocidade
-- da loja só se conhecia no laboratório (o LCP no telemóvel, o INP nunca). O site manda estes
-- números à Edge Function (POST /telemetria), que os grava aqui; o painel mostra-os em
-- Sistema → Saúde do site.
--
-- Sem dados pessoais: nada de IP, conta, email ou endereço completo. A página guarda-se sem ids
-- nem parâmetros (/product/:id), e as mensagens de erro são cortadas. Apagam-se ao fim de 30 dias
-- (cron 'saude-limpeza').
--
-- Reverter: drop das funções public.site_health_record, public.site_health_vitals,
-- public.site_health_errors e private.site_health_p75, da tabela private.site_events e do cron
-- 'saude-limpeza'.

create table if not exists private.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('vital', 'error')),
  -- Vital: LCP, INP, CLS, FCP ou TTFB. Erro: a mensagem (cortada).
  name text not null check (char_length(name) between 1 and 300),
  -- Vital: milissegundos (CLS sem unidade). Erro: null.
  value double precision check (value is null or (value >= 0 and value <= 600000)),
  page text not null default '/' check (char_length(page) <= 120),
  device text not null default 'mobile' check (device in ('mobile', 'desktop')),
  connection text check (connection is null or char_length(connection) <= 12),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  -- Erro: ficheiro, linha, coluna e o início da pilha. Vital: o elemento ou a interacção.
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4000)
);

create index if not exists site_events_kind_created on private.site_events (kind, created_at desc);

revoke all on private.site_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Gravar (só a Edge Function, que já validou e cortou cada evento)
-- ---------------------------------------------------------------------------
create or replace function public.site_health_record(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.assert_server();
  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'Eventos inválidos.' using errcode = 'P0001';
  end if;
  insert into private.site_events (kind, name, value, page, device, connection, app_version, detail)
  select e ->> 'kind', left(e ->> 'name', 300), (e ->> 'value')::double precision,
         coalesce(left(e ->> 'page', 120), '/'), coalesce(e ->> 'device', 'mobile'),
         left(e ->> 'connection', 12), left(e ->> 'app_version', 40),
         coalesce(e -> 'detail', '{}'::jsonb)
    from jsonb_array_elements(p_events) with ordinality as t(e, n)
   where n <= 20;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.site_health_record(jsonb) from public, anon, authenticated;
grant execute on function public.site_health_record(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Ler (o painel; quem gere as configurações)
-- ---------------------------------------------------------------------------
-- p75, como o Google mede as Core Web Vitals: o valor que 75 % das visitas não passam.
create or replace function private.site_health_p75(p_values double precision[])
returns double precision
language sql
immutable
set search_path = ''
as $$
  select percentile_cont(0.75) within group (order by v) from unnest(p_values) as v;
$$;
revoke all on function private.site_health_p75(double precision[]) from public, anon, authenticated;

-- Por página, aparelho e métrica: p75, mediana e quantas medições. As linhas com a página '*'
-- juntam todas as páginas de cada aparelho (o p75 de tudo, que não se tira dos p75 de cada uma).
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
    select coalesce(e.page, '*'), e.device, e.name,
           private.site_health_p75(array_agg(e.value)),
           percentile_cont(0.5) within group (order by e.value),
           count(*)
      from private.site_events e
     where e.kind = 'vital'
       and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
     group by grouping sets ((e.page, e.device, e.name), (e.device, e.name))
     order by (e.page is not null), count(*) desc, 1, 2, 3;
end;
$$;
revoke all on function public.site_health_vitals(integer) from public, anon;
grant execute on function public.site_health_vitals(integer) to authenticated;

-- Os erros agrupados pela mensagem: quantas vezes, em quantas páginas, a última vez, a última
-- versão da app e um exemplo do detalhe.
create or replace function public.site_health_errors(p_days integer default 7)
returns table (message text, occurrences bigint, pages text[], devices text[], first_seen timestamptz,
               last_seen timestamptz, last_version text, sample jsonb)
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
    select e.name, count(*),
           (array_agg(distinct e.page))[1:5],
           array_agg(distinct e.device),
           min(e.created_at), max(e.created_at),
           (array_agg(e.app_version order by e.created_at desc))[1],
           (array_agg(e.detail order by e.created_at desc))[1]
      from private.site_events e
     where e.kind = 'error'
       and e.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 30)))
     group by e.name
     order by max(e.created_at) desc
     limit 50;
end;
$$;
revoke all on function public.site_health_errors(integer) from public, anon;
grant execute on function public.site_health_errors(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Limpeza: 30 dias chegam para ver tendências e não guardam nada para sempre
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'saude-limpeza') then
    perform cron.unschedule('saude-limpeza');
  end if;
  perform cron.schedule('saude-limpeza', '47 3 * * *',
    $job$delete from private.site_events where created_at < now() - interval '30 days'$job$);
exception when others then
  raise notice 'Não foi possível agendar a limpeza da saúde do site (%).', sqlerrm;
end
$$;
