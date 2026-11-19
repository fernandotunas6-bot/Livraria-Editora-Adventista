-- Painel de Gestão mais rápido (docs/PAINEL-GESTAO.md §8): os números do ecrã lêem as vendas UMA vez.
--
-- A versão de 20261119140000 pedia as vendas a cada bloco (cartões, dias, horas, lojas, 30 dias de cada loja, mais
-- vendidos, últimas): cerca de dez leituras da tabela, mais uma por loja. Como cada venda faz todos os ecrãs abertos
-- (as TVs, o painel) voltarem a pedir, isso multiplicava-se. Agora uma só leitura das vendas do período (os 56 dias da
-- média por dia da semana, ou desde o dia 1 do mês, o que vier antes), materializada, e tudo sai dela. O resultado é
-- o mesmo (o cenário scripts/pglite/painel-gestao.mjs confere-o).

create or replace function public.painel_gestao(p_alvo text default null, p_canal text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- quem vê os relatórios vê tudo; o gerente de loja, só as lojas da sua ficha de funcionário
  v_tudo boolean := private.can_read_sales_reports();
  v_proprias text[] := case when private.has_permission('view_store_dashboard') then private.my_store_ids() else '{}'::text[] end;
  v_alvos text[];
  v_visiveis text[];
  v_agora timestamp := private.hora_luanda(now());
  v_hoje date := v_agora::date;
  v_ini date := date_trunc('month', v_agora)::date;
  v_dias int := ((date_trunc('month', v_agora) + interval '1 month')::date - date_trunc('month', v_agora)::date);
  v_dia int := extract(day from v_agora)::int;
  v_ano int := extract(year from v_agora)::int;
  v_mes int := extract(month from v_agora)::int;
  v_desde date;
  v_meta numeric;
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
  v_visiveis := case when v_tudo
    then array(select id from public.physical_stores where active order by name) || array['online']
    else v_proprias end;
  v_meta := private.meta_do_ambito(v_alvos, p_canal, v_ano, v_mes);
  -- o período que os blocos precisam: 8 semanas (a média por dia da semana) ou desde o dia 1 do mês
  v_desde := least(v_ini, v_hoje - 56);

  with
  -- a única leitura das vendas: o período, no canal pedido (todas as lojas visíveis, para o quadro das lojas)
  base as materialized (
    select private.hora_luanda(v.quando) as t, v.quando, v.alvo, v.canal, v.tipo, v.numero, v.total, v.itens, v.anulado
    from public.vendas_ao_vivo v
    where v.quando >= private.de_luanda(v_desde::timestamp)
      and (p_canal is null or v.canal = p_canal)
      and (v_tudo or v.alvo = any (v_proprias))
  ),
  -- o âmbito pedido (uma loja, as do gerente, ou tudo)
  vs as (select * from base where v_alvos is null or alvo = any (v_alvos)),
  ok as (select * from vs where not anulado),
  resumo as (
    select coalesce(sum(total) filter (where t::date = v_hoje), 0) as hoje,
           count(*) filter (where t::date = v_hoje and total > 0) as hoje_vendas,
           coalesce(sum(total) filter (where t::date = v_hoje - 1), 0) as ontem,
           coalesce(sum(total) filter (where t::date = v_hoje - 7 and t::time <= v_agora::time), 0) as semana_passada,
           coalesce(sum(total) filter (where t >= v_ini), 0) as mes,
           count(*) filter (where t >= v_ini and total > 0) as mes_vendas
    from ok
  ),
  itens as materialized (
    select o.t::date as dia, o.total as total_venda, i ->> 'chave' as chave, i ->> 'titulo' as titulo,
           nullif(i ->> 'book_id', '') as book_id, nullif(i ->> 'referencia', '') as referencia,
           (i ->> 'quantidade')::numeric as qtd, (i ->> 'total')::numeric as total
    from ok o cross join lateral jsonb_array_elements(o.itens) i
    where o.t::date >= least(v_ini, v_hoje - 1)
  ),
  por_dia as (
    select t::date as dia, sum(total) as total, count(*) filter (where total > 0) as vendas from ok where t >= v_ini group by 1
  ),
  dias as (
    select coalesce(jsonb_agg(jsonb_build_object('dia', x.dia, 'total', x.total, 'vendas', x.vendas, 'acumulado', x.acumulado) order by x.dia), '[]'::jsonb) as j
    from (select extract(day from g.d)::int as dia, s.total, coalesce(s.vendas, 0) as vendas,
                 case when g.d::date <= v_hoje then sum(coalesce(s.total, 0)) over (order by g.d) end as acumulado
          from generate_series(v_ini::timestamp, (v_ini + v_dias - 1)::timestamp, interval '1 day') as g(d)
          left join por_dia s on s.dia = g.d::date) x
  ),
  horas as (
    select jsonb_agg(jsonb_build_object('hora', g.h, 'hoje', case when g.h <= extract(hour from v_agora) then coalesce(a.total, 0) end,
                                        'media', round(coalesce(b.total, 0) / 8, 2)) order by g.h) as j
    from generate_series(0, 23) as g(h)
    left join (select extract(hour from t)::int as hora, sum(total) as total from ok where t::date = v_hoje group by 1) a on a.hora = g.h
    left join (select extract(hour from t)::int as hora, sum(total) as total from ok
               where t::date < v_hoje and t::date >= v_hoje - 56 and extract(isodow from t) = extract(isodow from v_hoje) group by 1) b on b.hora = g.h
  ),
  -- o quadro das lojas: a meta de cada uma uma só vez, os 30 dias de todas numa só passagem
  metas_lojas as (
    select x.a, x.ord, private.meta_do_ambito(array[x.a], p_canal, v_ano, v_mes) as meta
    from unnest(v_visiveis) with ordinality as x(a, ord)
    where p_canal is null or (p_canal = 'online') = (x.a = 'online')
  ),
  dia_loja as (
    select alvo, t::date as dia, sum(total) as total from base where not anulado and t::date >= v_hoje - 29 group by 1, 2
  ),
  trinta as (
    select m.a, jsonb_agg(coalesce(z.total, 0) order by g.d) as j
    from metas_lojas m cross join generate_series((v_hoje - 29)::timestamp, v_hoje::timestamp, interval '1 day') as g(d)
    left join dia_loja z on z.alvo = m.a and z.dia = g.d::date
    group by m.a
  ),
  soma_loja as (
    select alvo, coalesce(sum(total) filter (where t >= v_ini), 0) as mes, coalesce(sum(total) filter (where t::date = v_hoje), 0) as hoje
    from base where not anulado group by alvo
  ),
  ultimo_loja as (
    select v.alvo, max(v.quando) as ultimo from public.vendas_ao_vivo v where v.alvo = any (v_visiveis) group by v.alvo
  ),
  lojas as (
    select coalesce(jsonb_agg(l order by (l ->> 'ordem')::numeric desc nulls last, l ->> 'nome'), '[]'::jsonb) as j
    from (
      select jsonb_build_object(
               'id', m.a, 'nome', private.nome_do_alvo(m.a),
               'mes', coalesce(s.mes, 0), 'hoje', coalesce(s.hoje, 0), 'meta', m.meta,
               'percentagem', case when m.meta > 0 then round(coalesce(s.mes, 0) / m.meta * 100, 1) end,
               'ordem', case when m.meta > 0 then coalesce(s.mes, 0) / m.meta end,
               'ultimo', u.ultimo, 'trinta', tr.j) as l
      from metas_lojas m
      left join soma_loja s on s.alvo = m.a
      left join ultimo_loja u on u.alvo = m.a
      left join trinta tr on tr.a = m.a
    ) q
  ),
  -- mais vendidos de hoje (com a posição na véspera) e do mês, pela quantidade, com a capa do produto do site
  top_hoje as (
    select chave, max(titulo) as titulo, max(book_id) as book_id, max(referencia) as referencia, sum(qtd) as quantidade, sum(total) as total,
           row_number() over (order by sum(qtd) desc, sum(total) desc, chave) as posicao
    from itens where dia = v_hoje group by chave
  ),
  vespera as (
    select chave, row_number() over (order by sum(qtd) desc, sum(total) desc, chave) as posicao from itens where dia = v_hoje - 1 group by chave
  ),
  top_mes as (
    select chave, max(titulo) as titulo, max(book_id) as book_id, max(referencia) as referencia, sum(qtd) as quantidade, sum(total) as total,
           row_number() over (order by sum(qtd) desc, sum(total) desc, chave) as posicao
    from itens where dia >= v_ini group by chave
  ),
  mv_hoje as (
    select coalesce(jsonb_agg(jsonb_build_object('posicao', p.posicao, 'chave', p.chave, 'titulo', coalesce(nullif(b.title, ''), p.titulo),
             'quantidade', p.quantidade, 'total', p.total, 'capa', coalesce(nullif(b.cover_image, ''), nullif(b.cover, '')),
             'posicao_ontem', v.posicao) order by p.posicao), '[]'::jsonb) as j
    from top_hoje p left join vespera v on v.chave = p.chave
    left join lateral (select title, cover_image, cover from public.stock_books
                       where id = p.book_id or (p.book_id is null and p.referencia is not null and kigest_ref = p.referencia) limit 1) b on true
    where p.posicao <= 10 and p.quantidade > 0
  ),
  mv_mes as (
    select coalesce(jsonb_agg(jsonb_build_object('posicao', p.posicao, 'chave', p.chave, 'titulo', coalesce(nullif(b.title, ''), p.titulo),
             'quantidade', p.quantidade, 'total', p.total, 'capa', coalesce(nullif(b.cover_image, ''), nullif(b.cover, '')),
             'posicao_ontem', null) order by p.posicao), '[]'::jsonb) as j
    from top_mes p
    left join lateral (select title, cover_image, cover from public.stock_books
                       where id = p.book_id or (p.book_id is null and p.referencia is not null and kigest_ref = p.referencia) limit 1) b on true
    where p.posicao <= 10 and p.quantidade > 0
  ),
  ultimas as (
    select coalesce(jsonb_agg(u order by u ->> 'quando' desc), '[]'::jsonb) as j
    from (select jsonb_build_object('quando', to_char(s.t, 'YYYY-MM-DD"T"HH24:MI:SS'), 'alvo', s.alvo, 'loja', private.nome_do_alvo(s.alvo),
                                    'canal', s.canal, 'tipo', s.tipo, 'numero', s.numero, 'total', s.total, 'anulado', s.anulado,
                                    'artigo', s.itens -> 0 ->> 'titulo', 'quantidade', (s.itens -> 0 ->> 'quantidade')::numeric,
                                    'artigos', jsonb_array_length(s.itens)) as u
          from vs s where s.t::date >= v_hoje - 1 order by s.quando desc limit 30) x
  ),
  meses as (
    select coalesce(jsonb_agg(m order by (m ->> 'ano')::int, (m ->> 'mes')::int), '[]'::jsonb) as j
    from (select jsonb_build_object('ano', f.ano, 'mes', f.mes,
                   'vendido', sum(case p_canal when 'balcao' then f.balcao when 'online' then f.online else f.vendido end),
                   'meta', case when p_canal is null then sum(f.meta) else private.meta_do_ambito(v_alvos, p_canal, f.ano, f.mes) end,
                   'fechado', true) as m
          from public.fechos f
          where (v_alvos is null and f.alvo = '') or (v_alvos is not null and f.alvo = any (v_alvos))
          group by f.ano, f.mes order by f.ano desc, f.mes desc limit 12) x
  )
  select jsonb_build_object(
    'agora', to_char(v_agora, 'YYYY-MM-DD"T"HH24:MI:SS'),
    'ano', v_ano, 'mes', v_mes, 'dia', v_dia, 'dias_mes', v_dias,
    've_tudo', v_tudo,
    'alvo', coalesce(p_alvo, ''), 'canal', p_canal,
    'alvos', (select coalesce(jsonb_agg(jsonb_build_object('id', a, 'nome', private.nome_do_alvo(a)) order by ord), '[]'::jsonb)
              from unnest(v_visiveis) with ordinality as x(a, ord)),
    'resumo', jsonb_build_object(
      'hoje', r.hoje, 'hoje_vendas', r.hoje_vendas, 'ontem', r.ontem, 'semana_passada', r.semana_passada,
      'mes', r.mes, 'mes_vendas', r.mes_vendas,
      'hoje_itens', (select coalesce(sum(qtd), 0) from itens where dia = v_hoje and total_venda > 0),
      'meta', v_meta,
      'percentagem', case when v_meta > 0 then round(r.mes / v_meta * 100, 1) end,
      'falta', case when v_meta > 0 then greatest(v_meta - r.mes, 0) end,
      'ritmo_necessario', case when v_meta > 0 then round(greatest(v_meta - r.mes, 0) / greatest(v_dias - v_dia + 1, 1), 2) end,
      'ritmo_ideal', case when v_meta > 0 then round(v_meta * v_dia / v_dias, 2) end,
      'projeccao', round(r.mes / greatest(v_dia, 1) * v_dias, 2),
      'ticket_medio', case when r.mes_vendas > 0 then round(r.mes / r.mes_vendas, 2) end),
    'dias', (select j from dias),
    'horas', (select j from horas),
    'lojas', (select j from lojas),
    'mais_vendidos_hoje', (select j from mv_hoje),
    'mais_vendidos_mes', (select j from mv_mes),
    'ultimas', (select j from ultimas),
    'meses', (select j from meses) || jsonb_build_array(jsonb_build_object('ano', v_ano, 'mes', v_mes, 'vendido', r.mes, 'meta', v_meta, 'fechado', false)),
    'ultimo_dado', (select to_char(private.hora_luanda(max(quando)), 'YYYY-MM-DD"T"HH24:MI:SS') from public.vendas_ao_vivo
                    where v_alvos is null or alvo = any (v_alvos))
  )
  into v_res
  from resumo r;
  return v_res;
end;
$$;
revoke all on function public.painel_gestao(text, text) from public, anon;
grant execute on function public.painel_gestao(text, text) to authenticated;
