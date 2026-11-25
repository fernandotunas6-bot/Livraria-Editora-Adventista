-- O stock, os preços e os artigos novos do KanGest Livraria chegam ao site pelos postos (docs/KANGEST-SINCRONIZACAO.md
-- §10; parte A do plano do ecossistema). Substitui o que a ligação antiga fazia pelo túnel (desligada em
-- 20261125130000), com a mesma lógica do site: as linhas vão para public.kangest_stock e o produto recalcula-se com
-- public.kangest_recalcular_stock; os artigos novos entram ocultos por public.kangest_artigo_novo.
--
-- O posto manda o ESTADO de cada artigo (o stock de cada armazém, o preço), não os movimentos: repetir um lote não
-- dobra nada, e o último a chegar é o mais recente (o KanGest só manda um lote de cada vez).
--
-- Ligar as lojas uma a uma não pode estragar o que o site já tem, por isso cada posto tem dois interruptores, os dois
-- desligados por omissão:
-- * stock_online — o stock deste KanGest conta para o «stock à venda» no site (stock_books.stock). Desligado, o posto
--   só actualiza o «temos / não temos» da sua loja (store_stock). Sem isto, a primeira loja ligada passava a ser o
--   stock de todo o site.
-- * manda_catalogo — os preços e os artigos novos vêm deste KanGest. Só um posto o pode ter (cada loja podia ter
--   preços diferentes, e o site tem um preço por produto).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Os interruptores dos postos
-- ---------------------------------------------------------------------------------------------------------------
alter table public.kangest_postos
  add column if not exists stock_online boolean not null default false,
  add column if not exists manda_catalogo boolean not null default false;

create unique index if not exists kangest_postos_um_catalogo_idx on public.kangest_postos ((true)) where manda_catalogo;

comment on column public.kangest_postos.stock_online is
  'O stock deste KanGest conta para o stock à venda no site; desligado, só o «temos / não temos» da loja do posto.';
comment on column public.kangest_postos.manda_catalogo is
  'Os preços e os artigos novos vêm deste KanGest (no máximo um posto).';

-- ---------------------------------------------------------------------------------------------------------------
-- 2. O recálculo do stock não zera o stock à venda de uma referência que nenhum armazém «online» mandou
-- ---------------------------------------------------------------------------------------------------------------
-- Igual a 20261119181000_kangest_fila_reserva.sql, com uma diferença: o stock à venda (stock_books.stock) só muda
-- quando há pelo menos um armazém online com a referência. Antes, uma referência só com armazéns que não vendem
-- online punha o produto a zero; com os postos, uma loja ligada sem «stock_online» zerava o produto no site.
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

revoke all on function public.kangest_recalcular_stock(text) from public, anon, authenticated;
grant execute on function public.kangest_recalcular_stock(text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Receber: os documentos (como antes), o stock e os artigos
-- ---------------------------------------------------------------------------------------------------------------
-- Itens novos no lote (a Edge Function já os limpou em kangestSinc.ts, prepararLote):
--   {"tipo": "stock", "artigo_id": 7, "referencia": "LIV-001",
--    "armazens": [{"armazem_id": 1, "quantidade": 5, "reservado": 1, "disponivel": 4}]}
--   {"tipo": "artigo", "artigo_id": 7, "artigo": {"referencia": "LIV-001", "descricao": "…", "tipo": "P",
--    "preco1_iva": 285000, "ativo": true, "codigo_barras": "…"}}
-- Um item que não serve a este posto (stock de um posto sem loja e sem stock_online; artigo de um posto que não manda
-- no catálogo) conta como «ignorado», não como erro: o KanGest não volta a tentar.
create or replace function public.kangest_receber(p_posto uuid, p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_posto record;
  item jsonb;
  d jsonb;
  v_id bigint;
  v_n integer;
  v_recebidos integer := 0;
  v_repetidos integer := 0;
  v_anulados integer := 0;
  v_stock integer := 0;
  v_artigos integer := 0;
  v_ignorados integer := 0;
  v_ref text;
  v_preco numeric;
  v_refs text[] := '{}';
  v_ligacao text := 'posto:' || p_posto::text;
  v_erros jsonb := '[]'::jsonb;
begin
  select id, estado, store_id, stock_online, manda_catalogo into v_posto from public.kangest_postos where id = p_posto for update;
  if v_posto.id is null or v_posto.estado <> 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lote) is distinct from 'array' then
    raise exception 'O lote tem de ser uma lista.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_lote) loop
    begin
      if item ->> 'tipo' = 'stock' then
        v_ref := btrim(coalesce(item ->> 'referencia', ''));
        if v_ref = '' then
          raise exception 'Stock sem referência.';
        end if;
        if v_posto.store_id is null and not v_posto.stock_online then
          -- um posto sem loja e que não conta para o site: o stock dele não é de ninguém
          v_ignorados := v_ignorados + 1;
        else
          -- o estado de agora: os armazéns que já não têm o artigo saem
          delete from public.kangest_stock s
           where s.ligacao = v_ligacao and s.referencia = v_ref
             and not exists (select 1 from jsonb_array_elements(coalesce(item -> 'armazens', '[]'::jsonb)) a
                              where (a ->> 'armazem_id')::bigint = s.armazem_id);
          insert into public.kangest_stock (ligacao, referencia, armazem_id, quantidade, reservado, disponivel, online, store_id, actualizado)
          select v_ligacao, v_ref, (a ->> 'armazem_id')::bigint,
                 coalesce((a ->> 'quantidade')::numeric, 0), coalesce((a ->> 'reservado')::numeric, 0),
                 coalesce((a ->> 'disponivel')::numeric, coalesce((a ->> 'quantidade')::numeric, 0) - coalesce((a ->> 'reservado')::numeric, 0)),
                 v_posto.stock_online, v_posto.store_id, now()
            from jsonb_array_elements(coalesce(item -> 'armazens', '[]'::jsonb)) a
          on conflict (ligacao, referencia, armazem_id) do update
            set quantidade = excluded.quantidade, reservado = excluded.reservado, disponivel = excluded.disponivel,
                online = excluded.online, store_id = excluded.store_id, actualizado = now();
          if not v_ref = any (v_refs) then
            v_refs := array_append(v_refs, v_ref);
          end if;
          v_stock := v_stock + 1;
        end if;

      elsif item ->> 'tipo' = 'artigo' then
        d := item -> 'artigo';
        v_ref := btrim(coalesce(d ->> 'referencia', ''));
        if v_ref = '' then
          raise exception 'Artigo sem referência.';
        end if;
        if not v_posto.manda_catalogo then
          v_ignorados := v_ignorados + 1;
        else
          -- o preço do site é o PVP com IVA do KanGest (em cêntimos lá, em kwanzas cá), como na ligação antiga
          v_preco := round(coalesce((d ->> 'preco1_iva')::numeric, 0) / 100, 2);
          if v_preco > 0 then
            update public.stock_books set price = v_preco where kigest_ref = v_ref and price is distinct from v_preco;
          end if;
          -- um artigo de venda, activo e com nome, que o site não tenha: entra oculto, à espera de fotografia
          if coalesce((d ->> 'ativo')::boolean, true) and upper(coalesce(nullif(btrim(d ->> 'tipo'), ''), 'P')) = 'P'
             and coalesce(btrim(d ->> 'descricao'), '') <> '' then
            perform public.kangest_artigo_novo(
              v_ref, left(regexp_replace(btrim(d ->> 'descricao'), '\s+', ' ', 'g'), 200),
              greatest(coalesce(v_preco, 0), 0), coalesce(btrim(d ->> 'codigo_barras'), ''));
          end if;
          v_artigos := v_artigos + 1;
        end if;

      elsif item ->> 'tipo' = 'documento' then
        d := item -> 'documento';
        v_id := null;
        insert into public.kangest_documentos
          (posto_id, documento_id, tipo_codigo, grupo, serie, numero, numero_doc, data_emissao, data_hora, store_id, armazem_id,
           consumidor_final, entidade_nif_cifrado, entidade_nif_indice, entidade_nome_cifrado, total_liquido, total_iva, total,
           estado, motivo_anulacao, referencia, hash, hash_anterior, hash_controlo, hash_versao, anulado_em)
        values
          (p_posto, (d ->> 'documento_id')::bigint, d ->> 'tipo_codigo', coalesce(d ->> 'grupo', ''), d ->> 'serie',
           (d ->> 'numero')::integer, d ->> 'numero_doc', (d ->> 'data_emissao')::date, d ->> 'data_hora', v_posto.store_id,
           nullif(d ->> 'armazem_id', '')::bigint, coalesce((d ->> 'consumidor_final')::boolean, true),
           coalesce(d ->> 'entidade_nif_cifrado', ''), coalesce(d ->> 'entidade_nif_indice', ''), coalesce(d ->> 'entidade_nome_cifrado', ''),
           coalesce((d ->> 'total_liquido')::bigint, 0), coalesce((d ->> 'total_iva')::bigint, 0), coalesce((d ->> 'total')::bigint, 0),
           coalesce(d ->> 'estado', 'N'), coalesce(d ->> 'motivo_anulacao', ''), coalesce(d ->> 'referencia', ''),
           coalesce(d ->> 'hash', ''), coalesce(d ->> 'hash_anterior', ''), coalesce(d ->> 'hash_controlo', ''),
           coalesce((d ->> 'hash_versao')::integer, 0), case when d ->> 'estado' = 'A' then now() end)
        on conflict (posto_id, documento_id) do nothing
        returning id into v_id;

        if v_id is null then
          -- já cá estava (o mesmo lote outra vez, ou a anulação de um documento que já chegou)
          update public.kangest_documentos
             set estado = d ->> 'estado',
                 motivo_anulacao = coalesce(d ->> 'motivo_anulacao', ''),
                 anulado_em = case when d ->> 'estado' = 'A' then now() else anulado_em end
           where posto_id = p_posto and documento_id = (d ->> 'documento_id')::bigint
             and estado <> 'A' and d ->> 'estado' in ('A', 'F') and estado is distinct from d ->> 'estado';
          get diagnostics v_n = row_count;
          if v_n > 0 and d ->> 'estado' = 'A' then
            v_anulados := v_anulados + 1;
          else
            v_repetidos := v_repetidos + 1;
          end if;
        else
          insert into public.kangest_documento_linhas
            (documento, linha, referencia, descricao, quantidade, preco_unitario, desconto_pct, taxa_iva_pct, valor_liquido, valor_iva, total, book_id)
          select v_id, (x ->> 'linha')::integer, coalesce(x ->> 'referencia', ''), coalesce(x ->> 'descricao', ''),
                 coalesce((x ->> 'quantidade')::numeric, 0), coalesce((x ->> 'preco_unitario')::bigint, 0),
                 coalesce((x ->> 'desconto_pct')::numeric, 0), coalesce((x ->> 'taxa_iva_pct')::numeric, 0),
                 coalesce((x ->> 'valor_liquido')::bigint, 0), coalesce((x ->> 'valor_iva')::bigint, 0), coalesce((x ->> 'total')::bigint, 0),
                 (select b.id from public.stock_books b where b.kigest_ref <> '' and b.kigest_ref = x ->> 'referencia' limit 1)
            from jsonb_array_elements(coalesce(item -> 'linhas', '[]'::jsonb)) x;
          perform private.kangest_conferir_cadeia(v_id);
          -- o seguinte da série pode ter chegado antes deste
          perform private.kangest_conferir_cadeia(n.id)
             from public.kangest_documentos n
            where n.posto_id = p_posto and n.tipo_codigo = d ->> 'tipo_codigo' and n.serie = d ->> 'serie'
              and n.numero = (d ->> 'numero')::integer + 1;
          v_recebidos := v_recebidos + 1;
        end if;

      else
        raise exception 'Tipo desconhecido: %', coalesce(item ->> 'tipo', '(nenhum)');
      end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object(
        'tipo', item ->> 'tipo',
        'documento_id', item -> 'documento' -> 'documento_id',
        'artigo_id', item -> 'artigo_id',
        'erro', sqlerrm);
    end;
  end loop;

  -- o produto do site e o «temos / não temos» das lojas, de uma vez para o lote todo
  if cardinality(v_refs) > 0 then
    perform public.kangest_recalcular_stock_lote(v_refs);
  end if;

  update public.kangest_postos
     set ultima_sinc = now(),
         ultimo_erro = case when jsonb_array_length(v_erros) > 0 then left(v_erros -> 0 ->> 'erro', 300) else '' end
   where id = p_posto;
  return jsonb_build_object(
    'recebidos', v_recebidos, 'repetidos', v_repetidos, 'anulados', v_anulados,
    'stock', v_stock, 'artigos', v_artigos, 'ignorados', v_ignorados, 'erros', v_erros,
    'partidas', (select count(*) from public.kangest_documentos where posto_id = p_posto and cadeia = 'partida'));
end;
$$;
revoke all on function public.kangest_receber(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_receber(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Configurar os interruptores (painel, Sistema → Ligação ao KanGest → Postos; a Edge Function confere
--    «manage_settings»)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.kangest_posto_configurar(p_id uuid, p_stock_online boolean, p_manda_catalogo boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligacao text := 'posto:' || p_id::text;
  v_refs text[];
begin
  if not exists (select 1 from public.kangest_postos where id = p_id) then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  -- só um posto manda no catálogo
  if coalesce(p_manda_catalogo, false) then
    update public.kangest_postos set manda_catalogo = false where manda_catalogo and id <> p_id;
  end if;
  update public.kangest_postos
     set stock_online = coalesce(p_stock_online, stock_online),
         manda_catalogo = coalesce(p_manda_catalogo, manda_catalogo)
   where id = p_id;
  -- o stock que este posto já mandou passa a contar (ou deixa de contar) para o site
  update public.kangest_stock s set online = p.stock_online
    from public.kangest_postos p
   where p.id = p_id and s.ligacao = v_ligacao and s.online is distinct from p.stock_online;
  select coalesce(array_agg(distinct referencia), '{}') into v_refs from public.kangest_stock where ligacao = v_ligacao;
  perform public.kangest_recalcular_stock_lote(v_refs);
  return (select jsonb_build_object('id', id, 'stock_online', stock_online, 'manda_catalogo', manda_catalogo)
            from public.kangest_postos where id = p_id);
end;
$$;
revoke all on function public.kangest_posto_configurar(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.kangest_posto_configurar(uuid, boolean, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Revogar um posto tira o stock dele do site (fica igual a 20261125120000, mais a limpeza do stock)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.kangest_posto_revogar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refs text[];
begin
  update public.kangest_postos
     set estado = 'revogado', chave_publica = null, codigo_resumo = null, codigo_expira = null, revogado_em = now(), topico = null,
         stock_online = false, manda_catalogo = false
   where id = p_id;
  if not found then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  delete from private.kangest_nonces where posto_id = p_id;
  -- o stock de um posto que já não está ligado ficava para sempre: sai, e os produtos recalculam-se sem ele
  with apagados as (
    delete from public.kangest_stock where ligacao = 'posto:' || p_id::text returning referencia
  )
  select coalesce(array_agg(distinct referencia), '{}') into v_refs from apagados;
  perform public.kangest_recalcular_stock_lote(v_refs);
end;
$$;
