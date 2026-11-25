-- O balcão dos postos nos relatórios do site (docs/KANGEST.md, «Os relatórios ligados»).
--
-- Até aqui, as vendas do balcão chegavam aos relatórios (Painel de Gestão, Todas as livrarias, Vendas por loja, os
-- fechos do mês) pela ligação antiga, que está desligada (20261125130000). As facturas que os postos mandam ficavam
-- só em kangest_documentos, que nenhum relatório lia. Agora cada documento recebido de um posto preenche, como a
-- ligação antiga fazia:
--   * public.vendas_ao_vivo (o Painel de Gestão): uma linha por venda, origem «kangest:posto:<posto>:<documento>»;
--   * public.kangest_vendas (Todas as livrarias, Vendas por loja, os fechos do mês): o total do mês da loja, ligação
--     «posto:<posto>».
-- A mesma regra da ligação antiga (kangest.ts, vendaDoDocumento): só FR, FT, ND e NC (estas a abater). As emitidas
-- pela loja online (o canal «api» ou a referência de uma encomenda) ficam de fora: entram pelas encomendas pagas, com
-- o canal online, e contavam duas vezes.
--
-- Também:
--   * os documentos passam a trazer o canal, o operador, o vencimento, o valor pendente e o documento de origem. Os
--     postos com a versão anterior não os mandam: ficam vazios;
--   * o pendente de uma factura pode mudar (um recibo no KanGest): é o único campo da cópia que muda depois;
--   * os gerentes de loja passam a ler as cópias dos documentos da loja deles (como no Painel de Gestão).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Os campos novos dos documentos
-- ---------------------------------------------------------------------------------------------------------------
alter table public.kangest_documentos
  add column if not exists canal text not null default '' check (canal in ('', 'balcao', 'api')),
  add column if not exists operador text not null default '' check (char_length(operador) <= 120),
  add column if not exists vencimento date,
  add column if not exists valor_pendente bigint,
  add column if not exists pendente_em timestamptz,
  add column if not exists doc_origem text not null default '' check (char_length(doc_origem) <= 60);
comment on column public.kangest_documentos.canal is 'balcao | api (a loja online, pela chave da API do KanGest); vazio nos postos antigos';
comment on column public.kangest_documentos.valor_pendente is 'Cêntimos por pagar (conta corrente); muda com os recibos do KanGest';

-- as facturas da mesma encomenda (a referência é o n.º da encomenda)
create index if not exists kangest_documentos_referencia_idx on public.kangest_documentos (referencia) where referencia <> '';

-- A cópia não se altera: só a anulação, a conferência da cadeia, a loja (se for apagada) e, agora, o pendente.
create or replace function private.kangest_documento_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'As cópias das facturas do KanGest não se apagam.' using errcode = '42501';
  end if;
  if (new.id, new.posto_id, new.documento_id, new.tipo_codigo, new.grupo, new.serie, new.numero, new.numero_doc, new.data_emissao,
      new.data_hora, new.armazem_id, new.consumidor_final, new.entidade_nif_cifrado, new.entidade_nif_indice, new.entidade_nome_cifrado,
      new.total_liquido, new.total_iva, new.total, new.referencia, new.hash, new.hash_anterior, new.hash_controlo, new.hash_versao,
      new.recebido_em, new.canal, new.operador, new.vencimento, new.doc_origem)
     is distinct from
     (old.id, old.posto_id, old.documento_id, old.tipo_codigo, old.grupo, old.serie, old.numero, old.numero_doc, old.data_emissao,
      old.data_hora, old.armazem_id, old.consumidor_final, old.entidade_nif_cifrado, old.entidade_nif_indice, old.entidade_nome_cifrado,
      old.total_liquido, old.total_iva, old.total, old.referencia, old.hash, old.hash_anterior, old.hash_controlo, old.hash_versao,
      old.recebido_em, old.canal, old.operador, old.vencimento, old.doc_origem) then
    raise exception 'Uma factura assinada não se altera: corrige-se com uma nota de crédito ou anula-se no KanGest.' using errcode = '42501';
  end if;
  if old.estado = 'A' and new.estado is distinct from 'A' then
    raise exception 'Um documento anulado não volta atrás.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Um documento do posto nos relatórios
-- ---------------------------------------------------------------------------------------------------------------
-- É do balcão? FR, FT, ND e NC, que não sejam da loja online.
create or replace function private.kangest_documento_e_balcao(p_tipo text, p_canal text, p_referencia text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select upper(coalesce(p_tipo, '')) in ('FR', 'FT', 'ND', 'NC')
     and coalesce(p_canal, '') <> 'api'
     and not (coalesce(p_referencia, '') <> ''
              and exists (select 1 from public.orders o where o.order_number = p_referencia));
$$;
revoke all on function private.kangest_documento_e_balcao(text, text, text) from public, anon, authenticated;

-- O total do mês de uma loja vindo de um posto (kangest_vendas), refeito a partir das cópias.
create or replace function private.kangest_mes_do_posto(p_posto uuid, p_store text, p_ano int, p_mes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_docs int;
begin
  select coalesce(sum(case when upper(d.tipo_codigo) = 'NC' then -d.total else d.total end), 0) / 100.0,
         count(*) filter (where upper(d.tipo_codigo) <> 'NC')
    into v_total, v_docs
    from public.kangest_documentos d
   where d.posto_id = p_posto and coalesce(d.store_id, '') = coalesce(p_store, '') and d.estado <> 'A'
     and extract(year from d.data_emissao) = p_ano and extract(month from d.data_emissao) = p_mes
     and private.kangest_documento_e_balcao(d.tipo_codigo, d.canal, d.referencia);
  insert into public.kangest_vendas (ligacao, store_id, ano, mes, canal, total, docs, actualizado)
  values ('posto:' || p_posto::text, coalesce(p_store, ''), p_ano, p_mes, 'balcao', round(v_total, 2), v_docs, now())
  on conflict (ligacao, store_id, ano, mes, canal) do update
    set total = excluded.total, docs = excluded.docs, actualizado = now();
end;
$$;
revoke all on function private.kangest_mes_do_posto(uuid, text, int, int) from public, anon, authenticated;

-- Um documento recebido (ou anulado) nos relatórios: a venda ao vivo e o mês da loja. Nunca faz falhar a recepção.
create or replace function private.kangest_documento_nos_relatorios(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  v_sinal int;
  v_quando timestamptz;
begin
  select * into d from public.kangest_documentos where id = p_id;
  if d.id is null or not private.kangest_documento_e_balcao(d.tipo_codigo, d.canal, d.referencia) then
    return;
  end if;
  v_sinal := case when upper(d.tipo_codigo) = 'NC' then -1 else 1 end;
  -- o KanGest dá a hora da loja (Angola, UTC+1)
  v_quando := case when d.data_hora ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$'
                   then private.de_luanda(d.data_hora::timestamp) else d.recebido_em end;
  insert into public.vendas_ao_vivo (origem, quando, alvo, canal, tipo, numero, total, itens, anulado)
  select 'kangest:posto:' || d.posto_id::text || ':' || d.documento_id, v_quando, coalesce(d.store_id, 'sem-loja'), 'balcao',
         upper(d.tipo_codigo), d.numero_doc, v_sinal * abs(d.total) / 100.0,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'chave', coalesce(nullif(l.referencia, ''), l.descricao),
                     'referencia', l.referencia,
                     'book_id', l.book_id,
                     'titulo', left(l.descricao, 200),
                     'quantidade', v_sinal * abs(l.quantidade),
                     'total', v_sinal * abs(l.total) / 100.0) order by l.linha)
                     from public.kangest_documento_linhas l where l.documento = d.id), '[]'::jsonb),
         d.estado = 'A'
  on conflict (origem) do update
    set anulado = excluded.anulado, itens = excluded.itens, actualizado = now();
  perform private.kangest_mes_do_posto(d.posto_id, d.store_id, extract(year from d.data_emissao)::int, extract(month from d.data_emissao)::int);
exception when others then
  raise warning 'Relatórios: o documento % do KanGest não entrou (%).', p_id, sqlerrm;
end;
$$;
revoke all on function private.kangest_documento_nos_relatorios(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. A recepção dos postos: os campos novos, o pendente e os relatórios
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
-- 4. Os gerentes de loja lêem as cópias da loja deles
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists kangest_documentos_relatorios on public.kangest_documentos;
create policy kangest_documentos_relatorios on public.kangest_documentos
  for select to authenticated
  using ((select private.can_read_sales_reports()) or (store_id is not null and (select private.painel_pode_ver(store_id))));
drop policy if exists kangest_documento_linhas_relatorios on public.kangest_documento_linhas;
create policy kangest_documento_linhas_relatorios on public.kangest_documento_linhas
  for select to authenticated
  using ((select private.can_read_sales_reports())
         or exists (select 1 from public.kangest_documentos d
                     where d.id = documento and d.store_id is not null and (select private.painel_pode_ver(d.store_id))));

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Os documentos que já chegaram
-- ---------------------------------------------------------------------------------------------------------------
select private.kangest_documento_nos_relatorios(id) from public.kangest_documentos order by id;
