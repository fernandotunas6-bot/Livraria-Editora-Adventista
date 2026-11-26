-- KANGEST ONE, fase B1: o livro único de stock, em sombra.
--
-- Cada entrada e saída de stock do KanGest (movimentos_stock, com o documento) passa a ter uma linha num livro central
-- que não se altera (`stock_movimentos`).
-- - **A abertura:** na primeira volta com o livro (e sempre que o posto volta a ligar-se), o KanGest manda a existência
--   de cada artigo em cada armazém até ao último movimento dessa hora, com uma época. A base grava a diferença entre essa
--   existência e a soma do livro: na primeira vez é a existência toda; ao voltar a ligar, só o que faltava.
-- - **Os movimentos:** depois das aberturas todas, cada movimento novo, com a chave de idempotência
--   `kangest:<posto>:mov:<id>` (um movimento repetido não conta duas vezes).
--
-- **Em sombra:** o stock à venda no site continua a sair das fotografias de cada posto (`kangest_stock`,
-- `kangest_recalcular_stock`). O livro corre ao lado, e `stock_livro_conferir` mostra onde a soma do livro difere da
-- fotografia. Quando o livro bater certo no staging e na produção (fase B3), o stock passa a sair dele. As reservas e as
-- devoluções do site entram na fase B2.
--
-- Só o servidor escreve (a Edge Function, com a service role). Lê quem gere o catálogo.

create table if not exists public.stock_movimentos (
  id bigint generated always as identity primary key,
  posto_id uuid references public.kangest_postos (id) on delete set null,
  store_id text references public.physical_stores (id) on delete set null,
  armazem_id bigint,
  referencia text not null check (char_length(btrim(referencia)) between 1 and 60),
  book_id text references public.stock_books (id) on delete set null,
  tipo text not null check (tipo in ('abertura', 'venda', 'compra', 'reserva', 'libertacao', 'devolucao', 'ajuste', 'transferencia')),
  quantidade numeric(14, 3) not null,
  origem text not null check (char_length(origem) between 1 and 120),
  documento text not null default '' check (char_length(documento) <= 60),
  chave text not null unique check (char_length(chave) between 1 and 160),
  momento timestamptz not null,
  criado_em timestamptz not null default now()
);
comment on table public.stock_movimentos is
  'O livro único de stock (KANGEST ONE, fase B): cada entrada e saída, com a chave de idempotência. Não se altera: '
  'corrige-se com um movimento inverso. Em sombra até à fase B3 (o stock à venda ainda sai de kangest_stock).';
create index if not exists stock_movimentos_posto_idx on public.stock_movimentos (posto_id, armazem_id, referencia);
create index if not exists stock_movimentos_store_idx on public.stock_movimentos (store_id, referencia);
create index if not exists stock_movimentos_book_idx on public.stock_movimentos (book_id);
alter table public.stock_movimentos enable row level security;
revoke all on public.stock_movimentos from public, anon, authenticated;
grant select on public.stock_movimentos to authenticated;
grant all on public.stock_movimentos to service_role;

drop policy if exists "stock_movimentos: o catálogo lê" on public.stock_movimentos;
create policy "stock_movimentos: o catálogo lê" on public.stock_movimentos for select to authenticated
  using ((select private.has_permission('manage_catalog')));

-- Não se altera nem se apaga. Só as ligações (o posto, a loja, o produto) podem ficar vazias, quando o que apontam sai.
create or replace function private.stock_movimentos_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'O livro de stock não se apaga: corrija com um movimento inverso.' using errcode = '42501';
  end if;
  if (new.id, new.armazem_id, new.referencia, new.tipo, new.quantidade, new.origem, new.documento, new.chave, new.momento, new.criado_em)
     is distinct from
     (old.id, old.armazem_id, old.referencia, old.tipo, old.quantidade, old.origem, old.documento, old.chave, old.momento, old.criado_em)
     or (new.posto_id is not null and new.posto_id is distinct from old.posto_id)
     or (new.store_id is not null and new.store_id is distinct from old.store_id)
     or (new.book_id is not null and new.book_id is distinct from old.book_id) then
    raise exception 'O livro de stock não se altera: corrija com um movimento inverso.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.stock_movimentos_imutavel() from public, anon, authenticated;
drop trigger if exists stock_movimentos_imutavel on public.stock_movimentos;
create trigger stock_movimentos_imutavel before update or delete on public.stock_movimentos
  for each row execute function private.stock_movimentos_imutavel();

-- O que o posto mandou nesta volta: as aberturas e os movimentos (a Edge Function já limpou os campos;
-- kangestSinc.ts, limparLivroStock). Devolve as aceites e as recusadas, para o posto marcar a fila. Um posto de cada
-- vez (pg_advisory_xact_lock), para a diferença da abertura sair certa.
--   p_epoca: a abertura deste posto («20261126T115500»), a mesma em todas as aberturas dela
--   p_aberturas: [{"armazem_id": 1, "referencia": "LIV-001", "quantidade": 12, "momento": "…"}]
--   p_movimentos: [{"mov_id": 3457, "armazem_id": 1, "referencia": "LIV-001", "quantidade": -1, "tipo": "venda",
--                   "documento": "FR A/12", "momento": "…"}]
create or replace function public.stock_livro_receber(p_posto uuid, p_epoca text, p_aberturas jsonb, p_movimentos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posto public.kangest_postos;
  r record;
  v_chave text;
  v_book text;
  v_n integer;
  v_soma numeric;
  v_aberturas integer := 0;
  v_aceites bigint[] := '{}';
  v_repetidos integer := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  select * into v_posto from public.kangest_postos where id = p_posto;
  if v_posto.id is null or v_posto.estado <> 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('stock_livro:' || p_posto::text));
  if jsonb_typeof(p_aberturas) = 'array' and jsonb_array_length(p_aberturas) > 0
     and coalesce(p_epoca, '') !~ '^[0-9A-Za-z:.+_-]{1,40}$' then
    raise exception 'A abertura do livro de stock vem sem época.' using errcode = '22023';
  end if;

  for r in
    select x.* from jsonb_to_recordset(case when jsonb_typeof(p_aberturas) = 'array' then p_aberturas else '[]'::jsonb end)
      as x(armazem_id bigint, referencia text, quantidade numeric, momento timestamptz)
    limit 2000
  loop
    continue when r.armazem_id is null or coalesce(btrim(r.referencia), '') = '' or r.quantidade is null;
    v_chave := 'kangest:' || p_posto::text || ':abertura:' || p_epoca || ':' || r.armazem_id::text || ':' || btrim(r.referencia);
    continue when exists (select 1 from public.stock_movimentos m where m.chave = v_chave);
    -- a diferença para o livro: a existência toda na primeira abertura, só o que faltava ao voltar a ligar
    select coalesce(sum(m.quantidade), 0) into v_soma from public.stock_movimentos m
     where m.posto_id = p_posto and m.armazem_id = r.armazem_id and m.referencia = btrim(r.referencia);
    select b.id into v_book from public.stock_books b where b.kigest_ref = btrim(r.referencia) order by b.id limit 1;
    insert into public.stock_movimentos (posto_id, store_id, armazem_id, referencia, book_id, tipo, quantidade, origem, documento, chave, momento)
    values (p_posto, v_posto.store_id, r.armazem_id, left(btrim(r.referencia), 60), v_book, 'abertura', r.quantidade - v_soma,
            'kangest:' || p_posto::text, 'abertura ' || p_epoca, v_chave, coalesce(r.momento, now()))
    on conflict (chave) do nothing;
    get diagnostics v_n = row_count;
    v_aberturas := v_aberturas + v_n;
  end loop;

  for r in
    select x.* from jsonb_to_recordset(case when jsonb_typeof(p_movimentos) = 'array' then p_movimentos else '[]'::jsonb end)
      as x(mov_id bigint, armazem_id bigint, referencia text, quantidade numeric, tipo text, documento text, momento timestamptz)
    limit 2000
  loop
    if r.mov_id is null or r.armazem_id is null or coalesce(btrim(r.referencia), '') = '' or r.quantidade is null
       or r.tipo is null or r.tipo not in ('venda', 'compra', 'devolucao', 'ajuste', 'transferencia') then
      v_erros := v_erros || jsonb_build_object('mov_id', r.mov_id, 'erro', 'Movimento incompleto ou de um tipo desconhecido.');
      continue;
    end if;
    v_chave := 'kangest:' || p_posto::text || ':mov:' || r.mov_id::text;
    select b.id into v_book from public.stock_books b where b.kigest_ref = btrim(r.referencia) order by b.id limit 1;
    insert into public.stock_movimentos (posto_id, store_id, armazem_id, referencia, book_id, tipo, quantidade, origem, documento, chave, momento)
    values (p_posto, v_posto.store_id, r.armazem_id, left(btrim(r.referencia), 60), v_book, r.tipo, r.quantidade,
            'kangest:' || p_posto::text, left(coalesce(r.documento, ''), 60), v_chave, coalesce(r.momento, now()))
    on conflict (chave) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      v_repetidos := v_repetidos + 1;
    end if;
    -- novo ou repetido, já está no livro: o posto pode dá-lo por enviado
    v_aceites := v_aceites || r.mov_id;
  end loop;

  return jsonb_build_object('aberturas', v_aberturas, 'aceites', to_jsonb(v_aceites), 'repetidos', v_repetidos, 'erros', v_erros);
end;
$$;
revoke all on function public.stock_livro_receber(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.stock_livro_receber(uuid, text, jsonb, jsonb) to service_role;

-- Onde o livro e a fotografia do posto não batem certo (por armazém e referência). Uma linha só com o livro ou só com a
-- fotografia também conta. Vazio = o livro está certo.
create or replace function public.stock_livro_conferir(p_posto uuid)
returns table (armazem_id bigint, referencia text, livro numeric, fotografia numeric, diferenca numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with livro as (
    select m.armazem_id, m.referencia, sum(m.quantidade) as q
      from public.stock_movimentos m
     where m.posto_id = p_posto
     group by m.armazem_id, m.referencia
  ), foto as (
    select s.armazem_id, s.referencia, s.quantidade as q
      from public.kangest_stock s
     where s.ligacao = 'posto:' || p_posto::text
  )
  select coalesce(l.armazem_id, f.armazem_id), coalesce(l.referencia, f.referencia),
         coalesce(l.q, 0), coalesce(f.q, 0), coalesce(l.q, 0) - coalesce(f.q, 0)
    from livro l
    full join foto f on f.armazem_id = l.armazem_id and f.referencia = l.referencia
   where abs(coalesce(l.q, 0) - coalesce(f.q, 0)) > 0.0005
   order by 2, 1;
$$;
revoke all on function public.stock_livro_conferir(uuid) from public, anon, authenticated;
grant execute on function public.stock_livro_conferir(uuid) to service_role;

-- Para o painel: por posto, quantos movimentos tem o livro e quantas linhas não batem certo.
create or replace function public.stock_livro_resumo()
returns table (posto_id uuid, movimentos bigint, aberto boolean, divergencias bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id,
         (select count(*) from public.stock_movimentos m where m.posto_id = k.id),
         exists (select 1 from public.stock_movimentos m where m.posto_id = k.id and m.tipo = 'abertura'),
         (select count(*) from public.stock_livro_conferir(k.id))
    from public.kangest_postos k
   where k.estado = 'activo';
$$;
revoke all on function public.stock_livro_resumo() from public, anon, authenticated;
grant execute on function public.stock_livro_resumo() to service_role;
