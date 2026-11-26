-- KANGEST ONE, fase B (o que faltava, verificado a 26/11): o alerta de «stock negativo». Uma venda sem Internet que
-- deixe o livro de um posto abaixo de zero entra assim mesmo (a venda foi real e a factura está assinada), mas tem de
-- aparecer para acerto, nunca ficar como uma perda silenciosa. O resumo de cada posto passa a contar os artigos com o
-- livro abaixo de zero, e `stock_livro_negativos` diz quais.

drop function if exists public.stock_livro_resumo();
create function public.stock_livro_resumo()
returns table (posto_id uuid, movimentos bigint, aberto boolean, divergencias bigint, negativos bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id,
         (select count(*) from public.stock_movimentos m where m.posto_id = k.id),
         exists (select 1 from public.stock_movimentos m where m.posto_id = k.id and m.tipo = 'abertura'),
         (select count(*) from public.stock_livro_conferir(k.id)),
         (select count(*) from (
            select 1 from public.stock_movimentos m where m.posto_id = k.id
             group by m.armazem_id, m.referencia having sum(m.quantidade) < 0) n)
    from public.kangest_postos k
   where k.estado = 'activo';
$$;
revoke all on function public.stock_livro_resumo() from public, anon, authenticated;
grant execute on function public.stock_livro_resumo() to service_role;

-- Os artigos de um posto com o livro abaixo de zero, por armazém (para o painel acertar).
create or replace function public.stock_livro_negativos(p_posto uuid)
returns table (armazem_id bigint, referencia text, livro numeric, ultimo timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.armazem_id, m.referencia, sum(m.quantidade), max(m.momento)
    from public.stock_movimentos m
   where m.posto_id = p_posto
   group by m.armazem_id, m.referencia
  having sum(m.quantidade) < 0
   order by 2, 1;
$$;
revoke all on function public.stock_livro_negativos(uuid) from public, anon, authenticated;
grant execute on function public.stock_livro_negativos(uuid) to service_role;
