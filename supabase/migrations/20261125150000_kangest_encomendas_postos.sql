-- A NE, a FR, a NC e as anulações das encomendas online emitidas pelo KanGest Livraria da loja (parte B do plano do
-- ecossistema; docs/KANGEST-SINCRONIZACAO.md §11). Reutiliza a fila que o site já tinha para a ligação antiga
-- (public.kangest_fila, os gatilhos das encomendas, a reserva sem dobrar e o tratamento do cancelamento a meio).
-- A diferença está em quem emite: em vez de a Edge Function chamar a API de cada KanGest por um túnel, o posto da loja
-- leva as tarefas na resposta selada da sincronização, emite-as pela própria API (com a mesma idempotência) e devolve o
-- resultado no lote seguinte.
--
-- Fica atrás de um interruptor por posto, desligado por omissão: «Emitir os documentos das encomendas online».
-- Um pagamento continua a confirmar-se só no site: a FR só sai depois de o site dizer que está pago.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. A configuração do posto
-- ---------------------------------------------------------------------------------------------------------------
alter table public.kangest_postos
  add column if not exists emitir_encomendas boolean not null default false,
  add column if not exists artigo_portes text not null default '',
  add column if not exists artigo_generico text not null default '',
  add column if not exists pagamentos jsonb not null default '{}'::jsonb;

-- uma loja, um KanGest a emitir os documentos dela (dois dividiam as encomendas entre si)
create unique index if not exists kangest_postos_um_emissor_por_loja_idx on public.kangest_postos (store_id)
  where emitir_encomendas and store_id is not null;

comment on column public.kangest_postos.emitir_encomendas is
  'O KanGest deste posto emite a NE, a FR, a NC e as anulações das encomendas online da loja dele.';
comment on column public.kangest_postos.artigo_portes is 'Referência do artigo dos portes de envio no KanGest do posto.';
comment on column public.kangest_postos.artigo_generico is 'Referência de um artigo genérico, para produtos sem referência no KanGest.';
comment on column public.kangest_postos.pagamentos is
  'Método ou categoria de pagamento do site → modo do KanGest (NU, MB, TB…); «*» é o modo por omissão.';

-- quem tem a linha da fila reservada (a ligação antiga deixa-a vazia)
alter table public.kangest_fila add column if not exists posto_id uuid references public.kangest_postos (id) on delete set null;
create index if not exists kangest_fila_posto_idx on public.kangest_fila (posto_id) where posto_id is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. O posto que emite os documentos de uma loja
-- ---------------------------------------------------------------------------------------------------------------
create or replace function private.kangest_posto_da_loja(p_store text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.kangest_postos
   where p_store is not null and store_id = p_store and estado = 'activo' and emitir_encomendas
   limit 1;
$$;
revoke all on function private.kangest_posto_da_loja(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Os gatilhos das encomendas também enchem a fila das lojas com um posto que emite
-- ---------------------------------------------------------------------------------------------------------------
-- Igual a 20261119170000_kangest_completo.sql, com uma diferença na primeira condição: a fila enche-se com a ligação
-- antiga activa (kangest_activo) OU quando a loja da encomenda tem um posto que emite os documentos dela.
create or replace function private.orders_kangest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.kangest_activo() and private.kangest_posto_da_loja(new.store_id) is null then
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

-- ---------------------------------------------------------------------------------------------------------------
-- 4. A reserva do posto: só as linhas das encomendas da loja dele
-- ---------------------------------------------------------------------------------------------------------------
-- Como kangest_reservar (20261119181000): «processando» numa transacção, saltando as que outro já reservou; uma
-- reservada há mais de 10 minutos volta a sair. O KanGest emite com a chave de idempotência da linha (ne-<número>…),
-- por isso uma linha que volte a sair depois de emitida (o resultado não chegou) dá o mesmo documento.
create or replace function public.kangest_reservar_posto(p_posto uuid, p_limite int default 10)
returns setof public.kangest_fila
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store text;
begin
  select store_id into v_store from public.kangest_postos where id = p_posto and estado = 'activo' and emitir_encomendas;
  if v_store is null then
    return;
  end if;
  return query
  update public.kangest_fila f set estado = 'processando', actualizado = now(), posto_id = p_posto
  where f.id in (
    select k.id from public.kangest_fila k
      join public.orders o on o.id = k.order_id
     where o.store_id = v_store
       and ((k.estado = 'pendente' and k.proxima <= now())
         or (k.estado = 'processando' and k.actualizado < now() - interval '10 minutes'))
     order by k.id
     limit greatest(least(coalesce(p_limite, 10), 50), 1)
     for update of k skip locked
  )
  returning f.*;
end;
$$;
revoke all on function public.kangest_reservar_posto(uuid, int) from public, anon, authenticated;
grant execute on function public.kangest_reservar_posto(uuid, int) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Configurar as encomendas do posto (painel; a Edge Function confere «manage_settings»)
-- ---------------------------------------------------------------------------------------------------------------
-- Um argumento a null fica como está. p_modo_pagamento: o modo por omissão do KanGest («*» em pagamentos); '' apaga-o.
create or replace function public.kangest_posto_encomendas(
  p_id uuid, p_emitir boolean, p_artigo_portes text, p_artigo_generico text, p_modo_pagamento text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.kangest_postos;
begin
  select * into v from public.kangest_postos where id = p_id for update;
  if v.id is null then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  if coalesce(p_emitir, false) and v.store_id is null then
    raise exception 'Um posto sem loja não emite os documentos das encomendas: escolha primeiro a loja do posto.' using errcode = '22023';
  end if;
  if coalesce(p_emitir, false) and exists (select 1 from public.kangest_postos
                                            where store_id = v.store_id and emitir_encomendas and id <> p_id) then
    raise exception 'Outro posto já emite os documentos das encomendas desta loja: desligue-o primeiro.' using errcode = '22023';
  end if;
  if p_modo_pagamento is not null and btrim(p_modo_pagamento) <> '' and btrim(p_modo_pagamento) !~ '^[A-Z]{2,4}$' then
    raise exception 'O modo de pagamento do KanGest tem 2 a 4 letras maiúsculas (ex.: TB, NU, MB).' using errcode = '22023';
  end if;
  update public.kangest_postos
     set emitir_encomendas = coalesce(p_emitir, emitir_encomendas),
         artigo_portes = coalesce(left(btrim(p_artigo_portes), 60), artigo_portes),
         artigo_generico = coalesce(left(btrim(p_artigo_generico), 60), artigo_generico),
         pagamentos = case
           when p_modo_pagamento is null then pagamentos
           when btrim(p_modo_pagamento) = '' then pagamentos - '*'
           else jsonb_set(pagamentos, '{*}', to_jsonb(btrim(p_modo_pagamento)))
         end
   where id = p_id;
  return (select jsonb_build_object('id', id, 'emitir_encomendas', emitir_encomendas, 'artigo_portes', artigo_portes,
                                    'artigo_generico', artigo_generico, 'pagamentos', pagamentos)
            from public.kangest_postos where id = p_id);
end;
$$;
revoke all on function public.kangest_posto_encomendas(uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.kangest_posto_encomendas(uuid, boolean, text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Revogar também deixa de emitir (igual a 20261125140000, mais emitir_encomendas)
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
         stock_online = false, manda_catalogo = false, emitir_encomendas = false
   where id = p_id;
  if not found then
    raise exception 'Posto desconhecido.' using errcode = '22023';
  end if;
  delete from private.kangest_nonces where posto_id = p_id;
  with apagados as (
    delete from public.kangest_stock where ligacao = 'posto:' || p_id::text returning referencia
  )
  select coalesce(array_agg(distinct referencia), '{}') into v_refs from apagados;
  perform public.kangest_recalcular_stock_lote(v_refs);
end;
$$;
