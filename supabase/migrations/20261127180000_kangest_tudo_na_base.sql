-- Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
-- © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

-- Tudo do KanGest na base central (pedido do dono a 27/11: «migrar todos os dados actuais da loja Huambo… recibos,
-- livros, vendas, fecho, clientes, configurações todas… e permita que as configurações sejam guardadas no banco de
-- dados»; app/kangest-sistema/src-tauri/migrations/0080_tudo_na_base_central.sql). Já chegavam os documentos feitos no
-- KanGest, os fechos, o catálogo, a tesouraria e as fichas (20261127160000). Falta:
-- 1. **o histórico importado do KIGEST:** as vendas, os recibos e as notas de antes do KanGest. Chegam marcados
--    (`importado`):
--    - não se conferem na cadeia do KanGest, porque têm a assinatura do KIGEST (`cadeia = 'importada'`);
--    - nos relatórios, só contam num mês que a ligação antiga do KIGEST (`kangest_vendas` sem «posto:») não tenha já,
--      para não contar duas vezes;
-- 2. **as configurações de cada posto** (`kangest_configuracoes`): uma fotografia sem segredos, que o posto manda
--    quando muda. Ficam as últimas 50 versões, para se ver o que mudou e repor num computador novo.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. O histórico importado
-- ---------------------------------------------------------------------------------------------------------------
alter table public.kangest_documentos add column if not exists importado boolean not null default false;
comment on column public.kangest_documentos.importado is
  'Histórico importado do KIGEST para o KanGest (antes do KanGest): assinado pelo KIGEST, fora da cadeia do KanGest.';
alter table public.kangest_documentos drop constraint if exists kangest_documentos_cadeia_check;
alter table public.kangest_documentos add constraint kangest_documentos_cadeia_check
  check (cadeia in ('certa', 'partida', 'por_conferir', 'nao_assinado', 'importada'));

-- Um mês de uma loja que a ligação antiga do KIGEST (desligada a 25/11) já pôs nos relatórios.
create or replace function private.kangest_mes_da_ligacao_antiga(p_store text, p_ano int, p_mes int)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.kangest_vendas v
                  where v.store_id = coalesce(p_store, '') and v.ano = p_ano and v.mes = p_mes
                    and v.ligacao not like 'posto:%' and v.total <> 0);
$$;
revoke all on function private.kangest_mes_da_ligacao_antiga(text, int, int) from public, anon, authenticated;

create or replace function private.kangest_conferir_cadeia(p_documento bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  d record;
  v_anterior text;
  v_cadeia text;
begin
  select id, posto_id, tipo_codigo, serie, numero, hash, hash_anterior, importado into d
    from public.kangest_documentos where id = p_documento;
  if d.id is null then
    return;
  end if;
  if d.importado then
    -- o histórico do KIGEST: tem a assinatura do KIGEST, não a do KanGest
    v_cadeia := 'importada';
  elsif d.hash = '' then
    v_cadeia := 'nao_assinado';
  elsif d.numero = 1 then
    v_cadeia := case when d.hash_anterior = '' then 'certa' else 'partida' end;
  else
    select hash into v_anterior from public.kangest_documentos
     where posto_id = d.posto_id and tipo_codigo = d.tipo_codigo and serie = d.serie and numero = d.numero - 1;
    if not found then
      v_cadeia := 'por_conferir';
    else
      v_cadeia := case when v_anterior = d.hash_anterior then 'certa' else 'partida' end;
    end if;
  end if;
  update public.kangest_documentos set cadeia = v_cadeia where id = d.id and cadeia is distinct from v_cadeia;
end;
$$;
revoke all on function private.kangest_conferir_cadeia(bigint) from public, anon, authenticated;
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
     and private.kangest_documento_e_balcao(d.tipo_codigo, d.canal, d.referencia)
     -- o histórico importado só conta num mês que a ligação antiga não tenha já
     and (not d.importado or not private.kangest_mes_da_ligacao_antiga(p_store, p_ano, p_mes));
  insert into public.kangest_vendas (ligacao, store_id, ano, mes, canal, total, docs, actualizado)
  values ('posto:' || p_posto::text, coalesce(p_store, ''), p_ano, p_mes, 'balcao', round(v_total, 2), v_docs, now())
  on conflict (ligacao, store_id, ano, mes, canal) do update
    set total = excluded.total, docs = excluded.docs, actualizado = now();
end;
$$;
revoke all on function private.kangest_mes_do_posto(uuid, text, int, int) from public, anon, authenticated;
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
  -- o histórico importado do KIGEST num mês que a ligação antiga já tem: contava duas vezes
  if d.importado and private.kangest_mes_da_ligacao_antiga(d.store_id, extract(year from d.data_emissao)::int,
                                                           extract(month from d.data_emissao)::int) then
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
-- 2. A recepção: igual à de 20261126170000, com a marca de importado
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
  v_movimentos integer := 0;
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
           canal, operador, vencimento, valor_pendente, pendente_em, doc_origem, importado)
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
           left(coalesce(d ->> 'doc_origem', ''), 60),
           coalesce((d ->> 'importado')::boolean, false))
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

      elsif item ->> 'tipo' = 'movimento' then
        -- um movimento da tesouraria (o ERP central): uma cópia que não se altera; a anulação só o marca
        if public.kangest_receber_movimento(p_posto, v_posto.store_id, item -> 'movimento') then
          v_movimentos := v_movimentos + 1;
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
        'movimento_id', item -> 'movimento' -> 'movimento_id',
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
    'stock', v_stock, 'artigos', v_artigos, 'fechos', v_fechos, 'movimentos', v_movimentos, 'ignorados', v_ignorados, 'erros', v_erros,
    'partidas', (select count(*) from public.kangest_documentos where posto_id = p_posto and cadeia = 'partida'));
end;
$$;
revoke all on function public.kangest_receber(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_receber(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. As configurações de cada posto
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.kangest_configuracoes (
  id bigserial primary key,
  posto_id uuid not null references public.kangest_postos(id) on delete cascade,
  resumo text not null check (resumo ~ '^[0-9a-f]{64}$'),
  dados jsonb not null,
  recebido_em timestamptz not null default now(),
  unique (posto_id, resumo)
);
comment on table public.kangest_configuracoes is
  'As configurações de cada posto do KanGest (sinc/configuracoes.rs): uma fotografia sem segredos por versão; as últimas 50.';
create index if not exists kangest_configuracoes_posto_idx on public.kangest_configuracoes (posto_id, recebido_em desc);
alter table public.kangest_configuracoes enable row level security;
revoke all on public.kangest_configuracoes from public, anon;
grant select on public.kangest_configuracoes to authenticated;
drop policy if exists "kangest_configuracoes: gerir configurações" on public.kangest_configuracoes;
create policy "kangest_configuracoes: gerir configurações" on public.kangest_configuracoes for select to authenticated
  using ((select private.has_permission('manage_settings')));

create or replace function public.kangest_configuracoes_receber(p_posto uuid, p_resumo text, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  select estado into v_estado from public.kangest_postos where id = p_posto;
  if v_estado is distinct from 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  if coalesce(p_resumo, '') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_dados) is distinct from 'object' then
    raise exception 'Configurações inválidas.' using errcode = '22023';
  end if;
  -- a mesma fotografia outra vez (o posto não soube da resposta): só a hora muda
  insert into public.kangest_configuracoes (posto_id, resumo, dados)
  values (p_posto, p_resumo, p_dados)
  on conflict (posto_id, resumo) do update set recebido_em = now();
  -- ficam as 50 mais recentes
  delete from public.kangest_configuracoes c
   where c.posto_id = p_posto
     and c.id not in (select k.id from public.kangest_configuracoes k where k.posto_id = p_posto
                       order by k.recebido_em desc, k.id desc limit 50);
  return jsonb_build_object('guardadas', true);
end;
$$;
revoke all on function public.kangest_configuracoes_receber(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_configuracoes_receber(uuid, text, jsonb) to service_role;
