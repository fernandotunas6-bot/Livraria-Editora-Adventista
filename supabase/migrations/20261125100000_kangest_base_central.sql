-- Base central do KanGest Livraria: postos, emparelhamento e as cópias das facturas (docs/KANGEST-SINCRONIZACAO.md;
-- fase 3 de docs/ECOSSISTEMA.md).
--
-- Um «posto» é uma instalação do KanGest Livraria: o computador servidor de uma loja (não um terminal de venda). Cada
-- posto emparelha-se uma vez com um código de uso único e passa a identificar-se pela sua chave Ed25519; a Edge
-- Function confere a assinatura de cada pedido, abre o envelope cifrado e chama public.kangest_receber.
--
-- As facturas continuam a ser emitidas e assinadas no KanGest, mesmo sem Internet (a certificação da AGT exige-o). O
-- que chega aqui é uma CÓPIA que não se altera nem se apaga: a única mudança aceite é a marca de anulado (ou de
-- facturado, numa proforma), que vem do próprio KanGest. A cadeia de assinaturas de cada série é conferida ao chegar
-- (o hash_anterior de um documento tem de ser o hash do anterior da mesma série).
--
-- Os dados pessoais do cliente da factura (NIF e nome) chegam já cifrados pela Edge Function (AES-256-GCM, chave fora
-- da base) e com um índice cego para os ligar sem os decifrar. O Consumidor Final não leva nada.
--
-- Quem lê: as cópias, quem vê os relatórios de vendas (private.can_read_sales_reports); os postos, só o servidor (o
-- painel passa pela Edge Function, com «Gerir configurações»).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Postos
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.kangest_postos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 1 and 80),
  store_id text references public.physical_stores (id) on delete set null,
  estado text not null default 'por_emparelhar' check (estado in ('por_emparelhar', 'activo', 'revogado')),
  -- o resumo SHA-256 do código de emparelhamento, nunca o código
  codigo_resumo text,
  codigo_expira timestamptz,
  -- Ed25519, base64 (32 bytes)
  chave_publica text,
  versao_programa text not null default '',
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  emparelhado_em timestamptz,
  revogado_em timestamptz,
  ultima_sinc timestamptz,
  ultimo_erro text not null default ''
);
comment on table public.kangest_postos is
  'Instalações do KanGest Livraria ligadas à base central (docs/KANGEST-SINCRONIZACAO.md). Só o servidor lê e escreve.';
create index if not exists kangest_postos_store_idx on public.kangest_postos (store_id);
create index if not exists kangest_postos_criado_por_idx on public.kangest_postos (criado_por);
create unique index if not exists kangest_postos_codigo_idx on public.kangest_postos (codigo_resumo) where codigo_resumo is not null;
alter table public.kangest_postos enable row level security;
revoke all on public.kangest_postos from anon, authenticated;

-- Os nonces vistos (contra o mesmo pedido enviado duas vezes); a hora do pedido só vale 5 minutos, um dia chega.
create table if not exists private.kangest_nonces (
  posto_id uuid not null references public.kangest_postos (id) on delete cascade,
  nonce text not null,
  visto_em timestamptz not null default now(),
  primary key (posto_id, nonce)
);
create index if not exists kangest_nonces_visto_idx on private.kangest_nonces (visto_em);
alter table private.kangest_nonces enable row level security;
revoke all on private.kangest_nonces from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. As cópias das facturas
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.kangest_documentos (
  id bigserial primary key,
  posto_id uuid not null references public.kangest_postos (id) on delete restrict,
  documento_id bigint not null,
  tipo_codigo text not null,
  grupo text not null default '',
  serie text not null,
  numero integer not null,
  numero_doc text not null,
  data_emissao date not null,
  -- como o KanGest a assinou (SystemEntryDate, hora de Angola)
  data_hora text not null,
  store_id text references public.physical_stores (id) on delete set null,
  armazem_id bigint,
  consumidor_final boolean not null default true,
  entidade_nif_cifrado text not null default '',
  entidade_nif_indice text not null default '',
  entidade_nome_cifrado text not null default '',
  -- cêntimos de kwanza, como no KanGest
  total_liquido bigint not null default 0,
  total_iva bigint not null default 0,
  total bigint not null default 0,
  estado text not null default 'N' check (estado in ('N', 'A', 'F')),
  motivo_anulacao text not null default '',
  referencia text not null default '',
  hash text not null default '',
  hash_anterior text not null default '',
  hash_controlo text not null default '',
  hash_versao integer not null default 0,
  cadeia text not null default 'por_conferir' check (cadeia in ('certa', 'partida', 'por_conferir', 'nao_assinado')),
  recebido_em timestamptz not null default now(),
  anulado_em timestamptz,
  unique (posto_id, documento_id),
  unique (posto_id, tipo_codigo, serie, numero)
);
comment on table public.kangest_documentos is
  'Cópias dos documentos emitidos e assinados no KanGest Livraria. Não se alteram nem se apagam; só se marcam anulados.';
create index if not exists kangest_documentos_store_idx on public.kangest_documentos (store_id, data_emissao);
create index if not exists kangest_documentos_data_idx on public.kangest_documentos (data_emissao);
create index if not exists kangest_documentos_nif_idx on public.kangest_documentos (entidade_nif_indice) where entidade_nif_indice <> '';
create index if not exists kangest_documentos_cadeia_idx on public.kangest_documentos (posto_id) where cadeia = 'partida';

create table if not exists public.kangest_documento_linhas (
  documento bigint not null references public.kangest_documentos (id) on delete restrict,
  linha integer not null,
  referencia text not null default '',
  descricao text not null default '',
  quantidade numeric not null default 0,
  preco_unitario bigint not null default 0,
  desconto_pct numeric not null default 0,
  taxa_iva_pct numeric not null default 0,
  valor_liquido bigint not null default 0,
  valor_iva bigint not null default 0,
  total bigint not null default 0,
  -- o produto do site com a mesma referência (stock_books.kigest_ref), para os relatórios
  book_id text references public.stock_books (id) on delete set null,
  primary key (documento, linha)
);
create index if not exists kangest_documento_linhas_book_idx on public.kangest_documento_linhas (book_id);

alter table public.kangest_documentos enable row level security;
alter table public.kangest_documento_linhas enable row level security;
revoke all on public.kangest_documentos from anon, authenticated;
revoke all on public.kangest_documento_linhas from anon, authenticated;
revoke all on sequence public.kangest_documentos_id_seq from anon, authenticated;
grant select on public.kangest_documentos to authenticated;
grant select on public.kangest_documento_linhas to authenticated;
drop policy if exists kangest_documentos_relatorios on public.kangest_documentos;
create policy kangest_documentos_relatorios on public.kangest_documentos
  for select to authenticated using ((select private.can_read_sales_reports()));
drop policy if exists kangest_documento_linhas_relatorios on public.kangest_documento_linhas;
create policy kangest_documento_linhas_relatorios on public.kangest_documento_linhas
  for select to authenticated using ((select private.can_read_sales_reports()));

-- Uma factura assinada não se altera nem se apaga. Pode mudar: a marca de anulado ou de facturado (que vem do
-- KanGest), a conferência da cadeia e a loja (se a loja for apagada).
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
      new.recebido_em)
     is distinct from
     (old.id, old.posto_id, old.documento_id, old.tipo_codigo, old.grupo, old.serie, old.numero, old.numero_doc, old.data_emissao,
      old.data_hora, old.armazem_id, old.consumidor_final, old.entidade_nif_cifrado, old.entidade_nif_indice, old.entidade_nome_cifrado,
      old.total_liquido, old.total_iva, old.total, old.referencia, old.hash, old.hash_anterior, old.hash_controlo, old.hash_versao,
      old.recebido_em) then
    raise exception 'Uma factura assinada não se altera: corrige-se com uma nota de crédito ou anula-se no KanGest.' using errcode = '42501';
  end if;
  if old.estado = 'A' and new.estado is distinct from 'A' then
    raise exception 'Um documento anulado não volta atrás.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists kangest_documentos_fixo on public.kangest_documentos;
create trigger kangest_documentos_fixo
  before update or delete on public.kangest_documentos
  for each row execute function private.kangest_documento_fixo();

create or replace function private.kangest_linha_fixa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'As linhas das facturas do KanGest não se apagam.' using errcode = '42501';
  end if;
  -- só a ligação ao produto do site pode mudar (fica vazia se o produto for apagado)
  if (new.documento, new.linha, new.referencia, new.descricao, new.quantidade, new.preco_unitario, new.desconto_pct, new.taxa_iva_pct,
      new.valor_liquido, new.valor_iva, new.total)
     is distinct from
     (old.documento, old.linha, old.referencia, old.descricao, old.quantidade, old.preco_unitario, old.desconto_pct, old.taxa_iva_pct,
      old.valor_liquido, old.valor_iva, old.total) then
    raise exception 'Uma linha de uma factura assinada não se altera.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists kangest_documento_linhas_fixa on public.kangest_documento_linhas;
create trigger kangest_documento_linhas_fixa
  before update or delete on public.kangest_documento_linhas
  for each row execute function private.kangest_linha_fixa();

-- A cadeia de assinaturas de um documento: o hash_anterior dele é o hash do anterior da mesma série? O primeiro da
-- série tem o hash_anterior vazio. Sem o anterior cá (ainda não chegou, ou é de antes da ligação), fica por conferir.
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
  select id, posto_id, tipo_codigo, serie, numero, hash, hash_anterior into d
    from public.kangest_documentos where id = p_documento;
  if d.id is null then
    return;
  end if;
  if d.hash = '' then
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

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Receber um lote (só o servidor, depois de conferir a assinatura e abrir o envelope)
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
  v_erros jsonb := '[]'::jsonb;
begin
  select id, estado, store_id into v_posto from public.kangest_postos where id = p_posto for update;
  if v_posto.id is null or v_posto.estado <> 'activo' then
    raise exception 'Posto desconhecido ou revogado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lote) is distinct from 'array' then
    raise exception 'O lote tem de ser uma lista.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_lote) loop
    begin
      if item ->> 'tipo' is distinct from 'documento' then
        raise exception 'Tipo desconhecido: %', coalesce(item ->> 'tipo', '(nenhum)');
      end if;
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
    exception when others then
      v_erros := v_erros || jsonb_build_object('documento_id', item -> 'documento' -> 'documento_id', 'erro', sqlerrm);
    end;
  end loop;

  update public.kangest_postos
     set ultima_sinc = now(),
         ultimo_erro = case when jsonb_array_length(v_erros) > 0 then left(v_erros -> 0 ->> 'erro', 300) else '' end
   where id = p_posto;
  return jsonb_build_object(
    'recebidos', v_recebidos, 'repetidos', v_repetidos, 'anulados', v_anulados, 'erros', v_erros,
    'partidas', (select count(*) from public.kangest_documentos where posto_id = p_posto and cadeia = 'partida'));
end;
$$;
revoke all on function public.kangest_receber(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.kangest_receber(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Postos: criar, novo código, emparelhar, revogar, nonce (só o servidor)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.kangest_posto_criar(p_nome text, p_store_id text, p_codigo_resumo text, p_criado_por uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.kangest_postos (nome, store_id, codigo_resumo, codigo_expira, criado_por)
  values (btrim(coalesce(p_nome, '')), nullif(btrim(coalesce(p_store_id, '')), ''), p_codigo_resumo, now() + interval '10 minutes', p_criado_por)
  returning id into v_id;
  return v_id;
end;
$$;

-- Novo código: para emparelhar outra vez (computador novo, chave perdida, rodar a chave) ou reactivar um revogado.
-- A chave antiga deixa de valer no mesmo instante.
create or replace function public.kangest_posto_novo_codigo(p_id uuid, p_codigo_resumo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kangest_postos
     set estado = 'por_emparelhar', chave_publica = null, codigo_resumo = p_codigo_resumo,
         codigo_expira = now() + interval '10 minutes', revogado_em = null
   where id = p_id;
  if not found then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  delete from private.kangest_nonces where posto_id = p_id;
end;
$$;

create or replace function public.kangest_posto_revogar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.kangest_postos
     set estado = 'revogado', chave_publica = null, codigo_resumo = null, codigo_expira = null, revogado_em = now()
   where id = p_id;
  if not found then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  delete from private.kangest_nonces where posto_id = p_id;
end;
$$;

create or replace function public.kangest_emparelhar(p_codigo_resumo text, p_chave_publica text, p_versao text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  begin
    if length(decode(coalesce(p_chave_publica, ''), 'base64')) <> 32 then
      raise exception 'tamanho';
    end if;
  exception when others then
    raise exception 'A chave do posto não é uma chave Ed25519 válida.' using errcode = '22023';
  end;
  update public.kangest_postos
     set estado = 'activo', chave_publica = p_chave_publica, codigo_resumo = null, codigo_expira = null,
         emparelhado_em = now(), versao_programa = left(coalesce(p_versao, ''), 40), ultimo_erro = ''
   where codigo_resumo = p_codigo_resumo and estado = 'por_emparelhar' and codigo_expira > now()
  returning id, nome, store_id into r;
  if r.id is null then
    raise exception 'Código inválido ou fora de prazo: peça outro no painel.' using errcode = '22023';
  end if;
  return jsonb_build_object('id', r.id, 'nome', r.nome, 'store_id', r.store_id,
                            'loja', (select s.name from public.physical_stores s where s.id = r.store_id));
end;
$$;

-- true se o nonce é novo (e fica guardado); false se este posto já o usou
create or replace function public.kangest_nonce(p_posto uuid, p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.kangest_nonces where visto_em < now() - interval '1 day';
  insert into private.kangest_nonces (posto_id, nonce) values (p_posto, p_nonce) on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.kangest_posto_criar(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.kangest_posto_novo_codigo(uuid, text) from public, anon, authenticated;
revoke all on function public.kangest_posto_revogar(uuid) from public, anon, authenticated;
revoke all on function public.kangest_emparelhar(text, text, text) from public, anon, authenticated;
revoke all on function public.kangest_nonce(uuid, text) from public, anon, authenticated;
grant execute on function public.kangest_posto_criar(text, text, text, uuid) to service_role;
grant execute on function public.kangest_posto_novo_codigo(uuid, text) to service_role;
grant execute on function public.kangest_posto_revogar(uuid) to service_role;
grant execute on function public.kangest_emparelhar(text, text, text) to service_role;
grant execute on function public.kangest_nonce(uuid, text) to service_role;
