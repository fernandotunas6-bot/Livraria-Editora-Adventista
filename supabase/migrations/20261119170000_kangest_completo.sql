-- KanGest: o que faltava na ligação (docs/KANGEST.md §5):
--   * reembolso total de uma encomenda já facturada → nota de crédito (NC) no KanGest, a partir da FR;
--   * kangest_da_encomenda com o id de cada documento na fila (o painel repete um com erro).

-- 1. A fila aceita a nota de crédito.
alter table public.kangest_fila drop constraint if exists kangest_fila_accao_check;
alter table public.kangest_fila add constraint kangest_fila_accao_check check (accao in ('ne', 'fr', 'anular', 'nc'));

create or replace function private.orders_kangest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.kangest_activo() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not private.kangest_cancelada(new) then
      insert into public.kangest_fila (order_id, accao) values (new.id, 'ne') on conflict do nothing;
      if coalesce(new.payment_status, '') = 'paid' then
        insert into public.kangest_fila (order_id, accao) values (new.id, 'fr') on conflict do nothing;
      end if;
    end if;
    return new;
  end if;

  if coalesce(new.payment_status, '') = 'paid' and coalesce(old.payment_status, '') <> 'paid' and not private.kangest_cancelada(new) then
    -- encomenda de antes da activação: a NE também vai (a FR sai dela)
    insert into public.kangest_fila (order_id, accao) values (new.id, 'ne') on conflict do nothing;
    insert into public.kangest_fila (order_id, accao) values (new.id, 'fr') on conflict do nothing;
  end if;
  -- reembolsada depois de facturada: a nota de crédito anula a FR no KanGest (o stock volta à loja da venda)
  if coalesce(new.payment_status, '') = 'refunded' and coalesce(old.payment_status, '') <> 'refunded'
     and exists (select 1 from public.kangest_fila where order_id = new.id and accao = 'fr' and estado = 'feito') then
    insert into public.kangest_fila (order_id, accao) values (new.id, 'nc') on conflict do nothing;
  end if;
  if private.kangest_cancelada(new) and not private.kangest_cancelada(old) then
    -- a NE (e a FR) que ainda não saíram deixam de ir; a NE que já saiu anula-se (se já houver FR, é a NC que trata)
    update public.kangest_fila set estado = 'ignorado', erro = 'Encomenda cancelada antes de chegar ao KanGest.', actualizado = now()
      where order_id = new.id and accao in ('ne', 'fr') and estado in ('pendente', 'erro');
    if exists (select 1 from public.kangest_fila where order_id = new.id and accao = 'ne' and estado = 'feito')
       and not exists (select 1 from public.kangest_fila where order_id = new.id and accao = 'fr' and estado = 'feito') then
      insert into public.kangest_fila (order_id, accao) values (new.id, 'anular') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- 2. Os documentos de uma encomenda, com o id de cada um na fila (para «Repetir» no painel).
create or replace function public.kangest_da_encomenda(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(f.accao, jsonb_build_object('id', f.id, 'estado', f.estado, 'erro', f.erro, 'tentativas', f.tentativas,
                                                        'resultado', coalesce(f.resultado, '{}'::jsonb), 'actualizado', f.actualizado))
    from public.kangest_fila f where f.order_id = p_order_id), '{}'::jsonb);
end;
$$;
