-- Painel de Gestão: o gráfico «ao vivo» (docs/PAINEL-GESTAO.md §6.13), como os de bolsa — o acumulado de hoje,
-- minuto a minuto, que sobe a cada venda e segue a direito enquanto não entra nenhuma, contra o mesmo acumulado
-- num dia de comparação (ontem, o mesmo dia da semana passada, ou a média das últimas 4 semanas nesse dia).
--
-- Uma função à parte: não muda nada no painel_gestao. As mesmas regras de quem vê o quê (a direcção vê tudo; o
-- gerente, só as lojas da sua ficha).

create or replace function public.painel_gestao_ao_vivo(p_alvo text default null, p_canal text default null, p_comparar text default 'semana')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tudo boolean := private.can_read_sales_reports();
  v_proprias text[] := case when private.has_permission('view_store_dashboard') then private.my_store_ids() else '{}'::text[] end;
  v_alvos text[];
  v_agora timestamp := private.hora_luanda(now());
  v_hoje date := v_agora::date;
  v_comparar text := coalesce(nullif(p_comparar, ''), 'semana');
  v_dias date[];
  v_div numeric := 1;
  v_desde date;
  v_res jsonb;
begin
  if not v_tudo and cardinality(v_proprias) = 0 then
    raise exception 'Sem permissão para ver o Painel de Gestão.' using errcode = '42501';
  end if;
  if p_canal is not null and p_canal not in ('balcao', 'online') then
    raise exception 'Canal inválido.';
  end if;
  if coalesce(p_alvo, '') <> '' then
    if not (v_tudo or p_alvo = any (v_proprias)) then
      raise exception 'Sem permissão para ver esta loja.' using errcode = '42501';
    end if;
    v_alvos := array[p_alvo];
  elsif not v_tudo then
    v_alvos := v_proprias;
  end if;
  case v_comparar
    when 'ontem' then v_dias := array[v_hoje - 1];
    when 'semana' then v_dias := array[v_hoje - 7];
    when 'media' then v_dias := array[v_hoje - 7, v_hoje - 14, v_hoje - 21, v_hoje - 28]; v_div := 4;
    else raise exception 'Comparação inválida (ontem, semana ou media).';
  end case;
  v_desde := least(v_hoje, (select min(d) from unnest(v_dias) d));

  with
  base as materialized (
    select private.hora_luanda(v.quando) as t, v.alvo, v.numero, v.total
    from public.vendas_ao_vivo v
    where v.quando >= private.de_luanda(v_desde::timestamp)
      and v.quando < private.de_luanda((v_hoje + 1)::timestamp)
      and not v.anulado
      and (p_canal is null or v.canal = p_canal)
      and (v_tudo or v.alvo = any (v_proprias))
      and (v_alvos is null or v.alvo = any (v_alvos))
  ),
  minutos as (
    select t::date = v_hoje as hoje, (extract(hour from t) * 60 + extract(minute from t))::int as m,
           sum(total) as total, count(*) filter (where total > 0) as vendas
    from base
    where t::date = v_hoje or t::date = any (v_dias)
    group by 1, 2
  )
  select jsonb_build_object(
    'agora', to_char(v_agora, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'comparar', v_comparar,
    -- [minuto do dia, Kz nesse minuto, n.º de vendas]
    'hoje', coalesce((select jsonb_agg(jsonb_build_array(m, total, vendas) order by m) from minutos where hoje), '[]'::jsonb),
    'comparacao', coalesce((select jsonb_agg(jsonb_build_array(m, round(total / v_div, 2)) order by m) from minutos where not hoje), '[]'::jsonb),
    'comparacao_total', coalesce((select round(sum(total) / v_div, 2) from minutos where not hoje), 0),
    'ultimas', coalesce((
      select jsonb_agg(jsonb_build_object('quando', to_char(x.t, 'YYYY-MM-DD"T"HH24:MI:SS'), 'alvo', x.alvo,
                                          'loja', private.nome_do_alvo(x.alvo), 'numero', x.numero, 'total', x.total) order by x.t desc)
      from (select * from base where t::date = v_hoje order by t desc limit 8) x), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;
revoke all on function public.painel_gestao_ao_vivo(text, text, text) from public, anon;
grant execute on function public.painel_gestao_ao_vivo(text, text, text) to authenticated;
