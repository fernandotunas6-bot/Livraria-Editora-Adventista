-- KANGEST ONE, fase B3 — RASCUNHO: não integrar antes do ensaio no staging (docs/AMBIENTES.md; docs/KANGEST-ONE.md §8).
--
-- O stock à venda no site e o «temos / não temos» de cada loja passam a poder sair do livro único de stock
-- (`stock_movimentos`, fases B1 e B2), em vez das fotografias que cada posto manda (`kangest_stock`).
--
-- **Desligado por omissão.** Um interruptor (`private.stock_livro_definicoes`, `fonte`) diz de onde sai o stock:
-- - `fotografias` (por omissão): como até aqui; nada muda com esta migração;
-- - `livro`: o disponível é a soma do livro dos postos que contam para o site (`stock_online`) com as reservas do site
--   ainda por libertar; o de cada loja, a soma do livro dessa loja.
-- Só se muda com `stock_livro_mudar_fonte` (o servidor; fica no registo de segurança), depois de o livro bater certo no
-- staging e numa cópia da produção (a soma do livro = o stock de hoje, loja a loja).

create table if not exists private.stock_livro_definicoes (
  chave text primary key,
  valor text not null
);
alter table private.stock_livro_definicoes enable row level security;
revoke all on private.stock_livro_definicoes from public, anon, authenticated;
insert into private.stock_livro_definicoes (chave, valor) values ('fonte', 'fotografias') on conflict (chave) do nothing;

create or replace function private.stock_livro_fonte()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select d.valor from private.stock_livro_definicoes d where d.chave = 'fonte'), 'fotografias');
$$;
revoke all on function private.stock_livro_fonte() from public, anon, authenticated;

create index if not exists stock_movimentos_referencia_idx on public.stock_movimentos (referencia);

-- O disponível de uma referência pelo livro: os postos que contam para o site e as reservas do site por libertar.
create or replace function public.stock_livro_disponivel(p_referencia text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(m.quantidade), 0)
    from public.stock_movimentos m
    left join public.kangest_postos k on k.id = m.posto_id
   where m.referencia = p_referencia
     and ((m.posto_id is not null and k.stock_online) or (m.posto_id is null and m.origem like 'site:%'));
$$;
revoke all on function public.stock_livro_disponivel(text) from public, anon, authenticated;
grant execute on function public.stock_livro_disponivel(text) to service_role;

-- O disponível de uma referência em cada loja, pelo livro.
create or replace function public.stock_livro_por_loja(p_referencia text)
returns table (store_id text, disponivel numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.store_id, sum(m.quantidade)
    from public.stock_movimentos m
   where m.referencia = p_referencia and m.store_id is not null
   group by m.store_id;
$$;
revoke all on function public.stock_livro_por_loja(text) from public, anon, authenticated;
grant execute on function public.stock_livro_por_loja(text) to service_role;

-- O recálculo: com a fonte «livro», pelo livro; senão, exactamente como em 20261125140000.
create or replace function public.kangest_recalcular_stock(p_referencia text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  b record;
  v_disp numeric;
  v_online boolean;
  v_pendente numeric;
begin
  if coalesce(btrim(p_referencia), '') = '' then
    return 0;
  end if;
  -- B3: com a fonte «livro», o stock à venda e o «temos / não temos» saem do livro único de stock
  if private.stock_livro_fonte() = 'livro' then
    v_disp := public.stock_livro_disponivel(p_referencia);
    v_online := exists (select 1 from public.stock_movimentos m join public.kangest_postos k on k.id = m.posto_id
                         where m.referencia = p_referencia and k.stock_online);
    for b in
      select id from public.stock_books
      where kigest_ref = p_referencia
        and (versions is null or jsonb_typeof(versions) <> 'array' or jsonb_array_length(versions) = 0)
    loop
      if v_online then
        perform set_config('app.stock_reason', 'kangest', true);
        perform set_config('app.stock_ref', p_referencia, true);
        update public.stock_books set stock = greatest(v_disp, 0) where id = b.id and stock is distinct from greatest(v_disp, 0);
        perform set_config('app.stock_reason', '', true);
        perform set_config('app.stock_ref', '', true);
      end if;
      insert into public.store_stock (store_id, book_id, available, updated)
      select l.store_id, b.id, l.disponivel > 0, now() from public.stock_livro_por_loja(p_referencia) l
      on conflict (store_id, book_id) do update set available = excluded.available, updated = now()
        where public.store_stock.available is distinct from excluded.available;
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;
  if coalesce(btrim(p_referencia), '') = '' then
    return 0;
  end if;
  select coalesce(sum(disponivel), 0), count(*) > 0 into v_disp, v_online
    from public.kangest_stock where referencia = p_referencia and online;
  for b in
    select id from public.stock_books
    where kigest_ref = p_referencia
      and (versions is null or jsonb_typeof(versions) <> 'array' or jsonb_array_length(versions) = 0)
  loop
    if v_online then
      select coalesce(sum((it ->> 'quantity')::numeric), 0) into v_pendente
        from public.kangest_fila f
        join public.orders o on o.id = f.order_id
        cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) it
        where f.accao = 'ne' and f.estado in ('pendente', 'processando', 'erro')
          and it ->> 'book_id' = b.id and coalesce(it ->> 'digital', '') <> 'true'
          and not private.kangest_cancelada(o);
      perform set_config('app.stock_reason', 'kangest', true);
      perform set_config('app.stock_ref', p_referencia, true);
      update public.stock_books set stock = greatest(v_disp - v_pendente, 0) where id = b.id and stock is distinct from greatest(v_disp - v_pendente, 0);
      perform set_config('app.stock_reason', '', true);
      perform set_config('app.stock_ref', '', true);
    end if;

    insert into public.store_stock (store_id, book_id, available, updated)
    select s.store_id, b.id, sum(s.disponivel) > 0, now()
      from public.kangest_stock s
      where s.referencia = p_referencia and s.store_id is not null
      group by s.store_id
    on conflict (store_id, book_id) do update set available = excluded.available, updated = now()
      where public.store_stock.available is distinct from excluded.available;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Com a fonte «livro», cada linha nova do livro recalcula o stock dessa referência.
create or replace function private.stock_livro_recalcular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.stock_livro_fonte() = 'livro' then
    perform public.kangest_recalcular_stock(new.referencia);
  end if;
  return null;
exception when others then
  raise warning 'Livro de stock: o recálculo de % ficou por fazer (%).', new.referencia, sqlerrm;
  return null;
end;
$$;
revoke all on function private.stock_livro_recalcular() from public, anon, authenticated;
drop trigger if exists stock_movimentos_recalcular on public.stock_movimentos;
create trigger stock_movimentos_recalcular after insert on public.stock_movimentos
  for each row execute function private.stock_livro_recalcular();

-- Mudar a fonte (só o servidor): recalcula todas as referências e fica no registo de segurança, com aviso.
create or replace function public.stock_livro_mudar_fonte(p_fonte text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  if p_fonte not in ('fotografias', 'livro') then
    raise exception 'A fonte do stock é «fotografias» ou «livro».';
  end if;
  insert into private.stock_livro_definicoes (chave, valor) values ('fonte', p_fonte)
  on conflict (chave) do update set valor = excluded.valor;
  for r in select distinct b.kigest_ref as ref from public.stock_books b where coalesce(btrim(b.kigest_ref), '') <> '' loop
    v_n := v_n + public.kangest_recalcular_stock(r.ref);
  end loop;
  perform private.audit_write('stock_livro_definicoes', 'fonte', 'update',
    'O stock à venda passou a sair ' || case when p_fonte = 'livro' then 'do livro único de stock' else 'das fotografias dos postos' end,
    jsonb_build_object('fonte', p_fonte, 'produtos', v_n), true);
  return v_n;
end;
$$;
revoke all on function public.stock_livro_mudar_fonte(text) from public, anon, authenticated;
grant execute on function public.stock_livro_mudar_fonte(text) to service_role;
