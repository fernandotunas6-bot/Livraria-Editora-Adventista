-- A cópia de cada fecho de caixa do KanGest no site (docs/KANGEST.md, «Os fechos de caixa dos postos»;
-- app/kangest-sistema/docs/FECHO-DE-CAIXA.md, «A cópia no site»).
--
-- Cada fecho arquivado no KanGest (o relatório Z, com o selo) chega pela fila dos postos, no tipo «fecho», e fica em
-- public.kangest_fechos: uma cópia que não se altera nem se apaga, sem os nomes dos clientes (o KanGest tira-os do
-- resumo). As encomendas do site que esse Z fechou ficam em public.kangest_fecho_encomendas. Quem vê: quem vê os
-- relatórios, todas as lojas; o gerente de loja, a sua (private.painel_pode_ver), como no Painel de Gestão.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Os fechos e as encomendas que cada um fechou
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.kangest_fechos (
  id bigserial primary key,
  posto_id uuid not null references public.kangest_postos (id) on delete restrict,
  fecho_id bigint not null,
  store_id text references public.physical_stores (id) on delete set null,
  sessao_id bigint,
  numero_z integer,
  posto text not null default '',
  aberta_em text not null default '',
  fechada_em text not null default '',
  operador text not null default '',
  fechado_por text not null default '',
  -- cêntimos de kwanza, como no KanGest
  total_vendido bigint not null default 0,
  numerario_esperado bigint not null default 0,
  valor_contado bigint not null default 0,
  online_total bigint not null default 0,
  online_incluidas boolean not null default false,
  reconstruido boolean not null default false,
  -- o selo do arquivo no KanGest e o do resumo que seguiu
  selo text not null default '',
  selo_resumo text not null default '',
  resumo jsonb not null default '{}'::jsonb check (jsonb_typeof(resumo) = 'object'),
  recebido_em timestamptz not null default now(),
  unique (posto_id, fecho_id)
);
comment on table public.kangest_fechos is
  'Cópias dos fechos de caixa (o Z) arquivados no KanGest Livraria, sem os nomes dos clientes. Não se alteram nem se apagam.';
create index if not exists kangest_fechos_store_idx on public.kangest_fechos (store_id, recebido_em desc);

create table if not exists public.kangest_fecho_encomendas (
  fecho bigint not null references public.kangest_fechos (id) on delete restrict,
  order_number text not null,
  primary key (fecho, order_number)
);
create index if not exists kangest_fecho_encomendas_numero_idx on public.kangest_fecho_encomendas (order_number);

alter table public.kangest_fechos enable row level security;
alter table public.kangest_fecho_encomendas enable row level security;
revoke all on public.kangest_fechos from anon, authenticated;
revoke all on public.kangest_fecho_encomendas from anon, authenticated;
revoke all on sequence public.kangest_fechos_id_seq from anon, authenticated;
grant select on public.kangest_fechos to authenticated;
grant select on public.kangest_fecho_encomendas to authenticated;
drop policy if exists kangest_fechos_relatorios on public.kangest_fechos;
create policy kangest_fechos_relatorios on public.kangest_fechos
  for select to authenticated
  using ((select private.can_read_sales_reports()) or (store_id is not null and (select private.painel_pode_ver(store_id))));
drop policy if exists kangest_fecho_encomendas_relatorios on public.kangest_fecho_encomendas;
create policy kangest_fecho_encomendas_relatorios on public.kangest_fecho_encomendas
  for select to authenticated
  using ((select private.can_read_sales_reports())
         or exists (select 1 from public.kangest_fechos f
                     where f.id = fecho and f.store_id is not null and (select private.painel_pode_ver(f.store_id))));

-- Uma cópia que não se altera: só a loja muda (se a loja for apagada).
create or replace function private.kangest_fecho_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'As cópias dos fechos de caixa não se apagam.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'store_id') is distinct from (to_jsonb(old) - 'store_id') then
    raise exception 'Um fecho de caixa arquivado não se altera.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists kangest_fechos_fixo on public.kangest_fechos;
create trigger kangest_fechos_fixo
  before update or delete on public.kangest_fechos
  for each row execute function private.kangest_fecho_fixo();

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Receber um fecho (dentro da kangest_receber; verdadeiro se é novo)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.kangest_receber_fecho(p_posto uuid, p_store text, f jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if coalesce((f ->> 'fecho_id')::bigint, 0) <= 0 then
    raise exception 'Fecho sem número.';
  end if;
  insert into public.kangest_fechos
    (posto_id, fecho_id, store_id, sessao_id, numero_z, posto, aberta_em, fechada_em, operador, fechado_por,
     total_vendido, numerario_esperado, valor_contado, online_total, online_incluidas, reconstruido, selo, selo_resumo, resumo)
  values
    (p_posto, (f ->> 'fecho_id')::bigint, p_store, nullif(f ->> 'sessao_id', '')::bigint, nullif(f ->> 'numero_z', '')::integer,
     left(coalesce(f ->> 'posto', ''), 120), left(coalesce(f ->> 'aberta_em', ''), 19), left(coalesce(f ->> 'fechada_em', ''), 19),
     left(coalesce(f ->> 'operador', ''), 120), left(coalesce(f ->> 'fechado_por', ''), 120),
     coalesce((f ->> 'total_vendido')::bigint, 0), coalesce((f ->> 'numerario_esperado')::bigint, 0),
     coalesce((f ->> 'valor_contado')::bigint, 0), coalesce((f ->> 'online_total')::bigint, 0),
     coalesce((f ->> 'online_incluidas')::boolean, false), coalesce((f ->> 'reconstruido')::boolean, false),
     left(coalesce(f ->> 'selo', ''), 64), left(coalesce(f ->> 'selo_resumo', ''), 64),
     case when jsonb_typeof(f -> 'resumo') = 'object' then f -> 'resumo' else '{}'::jsonb end)
  on conflict (posto_id, fecho_id) do nothing
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  insert into public.kangest_fecho_encomendas (fecho, order_number)
  select v_id, left(btrim(x), 60)
    from jsonb_array_elements_text(case when jsonb_typeof(f -> 'encomendas') = 'array' then f -> 'encomendas' else '[]'::jsonb end) x
   where btrim(x) <> ''
  on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.kangest_receber_fecho(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_receber_fecho(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. A recepção dos postos aceita o tipo «fecho» (o resto igual a 20261125160000)
-- ---------------------------------------------------------------------------------------------------------------
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
  v_fechos integer := 0;
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
           estado, motivo_anulacao, referencia, hash, hash_anterior, hash_controlo, hash_versao, anulado_em,
           canal, operador, vencimento, valor_pendente, pendente_em, doc_origem)
        values
          (p_posto, (d ->> 'documento_id')::bigint, d ->> 'tipo_codigo', coalesce(d ->> 'grupo', ''), d ->> 'serie',
           (d ->> 'numero')::integer, d ->> 'numero_doc', (d ->> 'data_emissao')::date, d ->> 'data_hora', v_posto.store_id,
           nullif(d ->> 'armazem_id', '')::bigint, coalesce((d ->> 'consumidor_final')::boolean, true),
           coalesce(d ->> 'entidade_nif_cifrado', ''), coalesce(d ->> 'entidade_nif_indice', ''), coalesce(d ->> 'entidade_nome_cifrado', ''),
           coalesce((d ->> 'total_liquido')::bigint, 0), coalesce((d ->> 'total_iva')::bigint, 0), coalesce((d ->> 'total')::bigint, 0),
           coalesce(d ->> 'estado', 'N'), coalesce(d ->> 'motivo_anulacao', ''), coalesce(d ->> 'referencia', ''),
           coalesce(d ->> 'hash', ''), coalesce(d ->> 'hash_anterior', ''), coalesce(d ->> 'hash_controlo', ''),
           coalesce((d ->> 'hash_versao')::integer, 0), case when d ->> 'estado' = 'A' then now() end,
           case when d ->> 'canal' in ('balcao', 'api') then d ->> 'canal' else '' end,
           left(coalesce(d ->> 'operador', ''), 120),
           case when d ->> 'vencimento' ~ '^\d{4}-\d{2}-\d{2}' then left(d ->> 'vencimento', 10)::date end,
           nullif(d ->> 'valor_pendente', '')::bigint,
           case when d ? 'valor_pendente' then now() end,
           left(coalesce(d ->> 'doc_origem', ''), 60))
        on conflict (posto_id, documento_id) do nothing
        returning id into v_id;

        if v_id is null then
          -- já cá estava (o mesmo lote outra vez, a anulação de um documento que já chegou, ou o pendente mudou)
          update public.kangest_documentos
             set estado = d ->> 'estado',
                 motivo_anulacao = coalesce(d ->> 'motivo_anulacao', ''),
                 anulado_em = case when d ->> 'estado' = 'A' then now() else anulado_em end
           where posto_id = p_posto and documento_id = (d ->> 'documento_id')::bigint
             and estado <> 'A' and d ->> 'estado' in ('A', 'F') and estado is distinct from d ->> 'estado'
          returning id into v_id;
          get diagnostics v_n = row_count;
          -- o pendente (um recibo no KanGest): o único campo que muda numa cópia
          if d ? 'valor_pendente' then
            update public.kangest_documentos
               set valor_pendente = nullif(d ->> 'valor_pendente', '')::bigint, pendente_em = now()
             where posto_id = p_posto and documento_id = (d ->> 'documento_id')::bigint
               and valor_pendente is distinct from nullif(d ->> 'valor_pendente', '')::bigint;
          end if;
          if v_n > 0 and d ->> 'estado' = 'A' then
            v_anulados := v_anulados + 1;
            perform private.kangest_documento_nos_relatorios(v_id);
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
          perform private.kangest_documento_nos_relatorios(v_id);
          v_recebidos := v_recebidos + 1;
        end if;

      elsif item ->> 'tipo' = 'fecho' then
        -- um fecho de caixa arquivado no KanGest (o Z): uma cópia que não se altera
        if public.kangest_receber_fecho(p_posto, v_posto.store_id, item -> 'fecho') then
          v_fechos := v_fechos + 1;
        else
          v_repetidos := v_repetidos + 1;
        end if;

      else
        raise exception 'Tipo desconhecido: %', coalesce(item ->> 'tipo', '(nenhum)');
      end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object(
        'tipo', item ->> 'tipo',
        'documento_id', item -> 'documento' -> 'documento_id',
        'artigo_id', item -> 'artigo_id',
        'fecho_id', item -> 'fecho' -> 'fecho_id',
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
    'stock', v_stock, 'artigos', v_artigos, 'fechos', v_fechos, 'ignorados', v_ignorados, 'erros', v_erros,
    'partidas', (select count(*) from public.kangest_documentos where posto_id = p_posto and cadeia = 'partida'));
end;
$$;
revoke all on function public.kangest_receber(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_receber(uuid, jsonb) to service_role;
