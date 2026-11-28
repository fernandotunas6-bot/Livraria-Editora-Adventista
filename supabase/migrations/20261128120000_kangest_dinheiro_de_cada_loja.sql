-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- O dinheiro de cada loja (a tesouraria do KanGest) também para o gerente da loja (pedido do dono a 28/11: «permitir
-- que cada loja seja administrada como já está»):
-- - quem lê os pagamentos vê todas as lojas, como até aqui;
-- - o gerente com «Painel da sua loja» vê só as lojas da sua ficha de funcionário (private.painel_lojas_proprias), como
--   no Painel de Gestão, nos documentos e nos fechos;
-- - quem não tem nenhuma das duas não vê nada.
-- O resto do resumo fica igual ao de 20261126170000.

create or replace function public.kangest_financeiro(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lojas text[];
begin
  if private.can_read_payments() then
    v_lojas := null;
  else
    v_lojas := private.painel_lojas_proprias();
    if coalesce(cardinality(v_lojas), 0) = 0 then
      raise exception 'Sem acesso aos relatórios financeiros.' using errcode = '42501';
    end if;
  end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Período inválido.'; end if;
  if p_to - p_from > 400 then raise exception 'Período demasiado longo (máximo 400 dias).'; end if;
  return (
    with m as (
      select k.*, coalesce(s.name, 'Sem loja') as loja
        from public.kangest_movimentos k left join public.physical_stores s on s.id = k.store_id
       where k.data between p_from and p_to and not k.anulado
         and (v_lojas is null or k.store_id = any (v_lojas))
    )
    select jsonb_build_object(
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'so_as_suas', v_lojas is not null,
      'total', jsonb_build_object(
        'entradas', coalesce((select sum(valor) from m where tipo = 'entrada'), 0),
        'saidas', coalesce((select sum(valor) from m where tipo = 'saida'), 0),
        'movimentos', (select count(*) from m)),
      'lojas', coalesce((select jsonb_agg(jsonb_build_object('loja', l.loja, 'entradas', l.entradas, 'saidas', l.saidas, 'movimentos', l.n) order by l.loja)
                           from (select loja, sum(valor) filter (where tipo = 'entrada') as entradas, sum(valor) filter (where tipo = 'saida') as saidas, count(*) as n
                                   from m group by loja) l), '[]'::jsonb),
      'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria', c.categoria, 'tipo', c.tipo, 'valor', c.valor) order by c.valor desc)
                                from (select coalesce(nullif(categoria, ''), 'Sem centro de custo') as categoria, tipo, sum(valor) as valor
                                        from m group by 1, 2) c), '[]'::jsonb),
      'anulados', (select count(*) from public.kangest_movimentos k
                    where k.data between p_from and p_to and k.anulado and (v_lojas is null or k.store_id = any (v_lojas)))));
end;
$$;
comment on function public.kangest_financeiro(date, date) is
  'O dinheiro das lojas (a tesouraria do KanGest), por loja e por centro de custo: todas para quem lê os pagamentos; só as suas para o gerente com «Painel da sua loja».';
revoke all on function public.kangest_financeiro(date, date) from public, anon;
grant execute on function public.kangest_financeiro(date, date) to authenticated, service_role;
