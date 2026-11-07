-- Pagamentos registados: cada pagamento e cada reembolso passa a ser um registo, e o estado do
-- pagamento da encomenda passa a resultar deles. Guia: docs/PAGAMENTOS.md.
--
-- Porquê (análise crítica de 2026-11-07):
--   * `orders.payment_status` era um texto que qualquer pessoa com "Gerir encomendas" mudava com
--     um clique, pela API ou directamente na tabela: sem valor, data, conta nem quem confirmou.
--   * Em produção, uma encomenda de 245 000 Kz estava entregue com o pagamento pendente, e nada o
--     assinalava; um relatório contava como receita o que ainda não tinha entrado.
--   * O total podia ser mudado sozinho (sem mexer nos artigos) e ficava assim, sem rasto.
--
-- O que muda:
--   1. Permissão nova "Confirmar pagamentos" (`confirm_payments`). Os gestores que já tinham
--      "Gerir encomendas" ficam com ela, para nada parar (em produção, a 2026-11-07, não havia
--      nenhum); o administrador tira-a a quem não deve confirmar dinheiro.
--   2. Total e portes das encomendas em numeric(14,2), como a colportagem.
--   3. `public.order_payments`: pagamentos e reembolsos. Só se acrescentam linhas; uma decisão
--      (confirmar, rejeitar, anular) muda o estado da linha e nunca a apaga.
--   4. Em `orders`: amount_paid, amount_refunded e paid_at, calculados. O payment_status passa a
--      resultar dos pagamentos — pending, awaiting_confirmation, partially_paid, paid, refunded,
--      failed — e nenhum pedido o escreve directamente (gatilho `orders_0_pagamento`).
--   5. O painel deixa de gravar directamente o pagamento, o total, os artigos, os portes e o stock
--      devolvido: fica só com as colunas de seguimento (estado geral, transportadora, código de
--      seguimento, data prevista, código do colportor).
--   6. Escrita só por funções, chamadas pela Edge Function (service role), que verifica a
--      permissão, diz quem foi (`x-actor-id`) e avisa o cliente: o cliente indica a referência;
--      a equipa confirma (com o valor recebido), rejeita (com o motivo), regista pagamentos ao
--      balcão e na entrega, anula um pagamento confirmado por engano e regista reembolsos.
--      Tudo fica também no registo de segurança.
--   7. O total da encomenda é sempre a soma dos artigos mais os portes: mudá-lo sozinho não pega.
--   8. Os avisos na conta do cliente conhecem "pago em parte" e "não confirmado".
--   9. As encomendas que já existem ganham os pagamentos que tinham, sem avisos a ninguém.
--
-- Regras do estado (private.order_payment_status), por esta ordem:
--   reembolsado ≥ pago, com algo pago        → refunded
--   pago ≥ total                             → paid (um reembolso parcial não o tira daqui)
--   há um pagamento indicado por confirmar    → awaiting_confirmation
--   pago > 0                                 → partially_paid
--   a última decisão foi rejeitar             → failed
--   nada                                     → pending
--
-- Reverter: drop dos gatilhos orders_0_pagamento e order_payments_guarda, das funções
-- order_payment_* / order_refund_record / order_payments_overview, da tabela order_payments e das
-- colunas amount_paid, amount_refunded, paid_at; repor orders_before_update de 20261105054638,
-- notify_order_activity de 20261107020000, users_admin_update de 20261107100000 e o
-- `grant update on public.orders to authenticated`.

-- ---------------------------------------------------------------------------
-- 0. Ajudantes
-- ---------------------------------------------------------------------------

-- Valor em Kz com espaço nos milhares, sem depender da configuração regional do servidor.
create or replace function private.kz(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(round(coalesce(p, 0))::bigint::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g') || ' Kz';
$$;
revoke all on function private.kz(numeric) from public, anon, authenticated;

-- Referência de pagamento para comparar: só letras e algarismos, em maiúsculas.
-- "TRF 0012-345" e "trf0012345" são a mesma.
create or replace function private.payment_reference_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
$$;
revoke all on function private.payment_reference_key(text) from public, anon, authenticated;

-- As funções de escrita só aceitam a Edge Function: é ela que verifica a permissão de quem pede,
-- lhe põe o nome no registo (`x-actor-id`) e avisa o cliente por email, WhatsApp e push.
create or replace function private.assert_payments_writer()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Os pagamentos registam-se pelo painel da loja.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.assert_payments_writer() from public, anon, authenticated;

-- Quem vê os pagamentos: quem gere encomendas ou confirma pagamentos (os administradores têm tudo).
create or replace function private.can_read_payments()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or private.has_permission('manage_orders')
      or private.has_permission('confirm_payments');
$$;
revoke all on function private.can_read_payments() from public, anon;
grant execute on function private.can_read_payments() to authenticated, service_role;

-- Quem fez: a conta da sessão, ou a pessoa em nome de quem a Edge Function pede (`x-actor-id`,
-- ver private.audit_actor na migração registo_de_seguranca).
create or replace function private.payments_actor()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.actor_id from private.audit_actor() a;
$$;
revoke all on function private.payments_actor() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Permissão "Confirmar pagamentos"
-- ---------------------------------------------------------------------------
-- Igual a 20261107100000_registo_igreja, com a chave nova na lista.
create or replace function public.users_admin_update(
  p_id uuid, p_name text default null, p_phone text default null,
  p_role text default null, p_permissions jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text := private.assert_can_manage_user(p_id);
  v_role text := coalesce(p_role, v_current);
  v_perms jsonb;
begin
  if p_role is not null or p_permissions is not null then
    if not private.is_admin() then
      raise exception 'Só administradores podem alterar papéis e permissões.' using errcode = '42501';
    end if;
    if v_role not in ('member', 'manager', 'admin') then
      raise exception 'Papel inválido.';
    end if;
    if p_id = auth.uid() and v_role <> 'admin' then
      raise exception 'Não pode retirar o seu próprio acesso de administrador.';
    end if;
    if v_current = 'admin' and v_role <> 'admin' and private.active_admin_count(p_id) = 0 then
      raise exception 'Tem de existir pelo menos um administrador activo.';
    end if;
    -- Só as chaves conhecidas, com valores verdadeiro/falso; só os gestores as usam.
    select coalesce(jsonb_object_agg(k, coalesce(p_permissions ->> k, '') = 'true'), '{}'::jsonb) into v_perms
    from unnest(array['manage_catalog','manage_orders','manage_settings','manage_users','manage_payments',
                      'confirm_payments','manage_marketing','manage_church_registry','manage_colporteurs']) k;
  end if;

  update public.profiles set
    name = case when p_name is not null then left(btrim(p_name), 120) else name end,
    phone = case when p_phone is not null then left(btrim(p_phone), 40) else phone end,
    role = case when p_role is not null or p_permissions is not null then v_role else role end,
    permissions = case when p_role is not null or p_permissions is not null
                       then (case when v_role = 'manager' then v_perms else null end)
                       else permissions end,
    updated = now()
  where id = p_id;
end;
$$;

-- Quem já gere encomendas continua a poder confirmar pagamentos até o administrador decidir.
-- O gatilho do registo de segurança avisaria os administradores de cada mudança de permissões
-- como se fosse um ataque; fica uma linha no registo, sem aviso, a dizer que foi esta migração.
do $$
declare
  v_audit boolean := exists (
    select 1 from pg_trigger where tgname = 'profiles_audit' and tgrelid = 'public.profiles'::regclass);
  r record;
begin
  if v_audit then
    execute 'alter table public.profiles disable trigger profiles_audit';
  end if;
  for r in
    update public.profiles p
    set permissions = coalesce(p.permissions, '{}'::jsonb) || '{"confirm_payments": true}'::jsonb
    where p.role = 'manager'
      and (p.permissions -> 'manage_orders') = 'true'::jsonb
      and not (coalesce(p.permissions, '{}'::jsonb) ? 'confirm_payments')
    returning p.id, p.email
  loop
    if v_audit then
      perform private.audit_write('profiles', r.id::text, 'update',
        'Permissão "Confirmar pagamentos" dada a ' || coalesce(r.email, r.id::text)
          || ', que já gere encomendas (migração pagamentos_registados)',
        jsonb_build_object('permissions', jsonb_build_object('de', 'sem confirm_payments', 'para', 'confirm_payments: true')),
        false);
    end if;
  end loop;
  if v_audit then
    execute 'alter table public.profiles enable trigger profiles_audit';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Dinheiro das encomendas em numeric(14,2)
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_total_nao_negativo;
alter table public.orders drop constraint if exists orders_portes_nao_negativos;
alter table public.orders
  alter column total type numeric(14,2) using round(total::numeric, 2),
  alter column shipping_cost type numeric(14,2) using round(shipping_cost::numeric, 2);
alter table public.orders add constraint orders_total_nao_negativo check (total >= 0);
alter table public.orders add constraint orders_portes_nao_negativos check (shipping_cost is null or shipping_cost >= 0);

alter table public.orders
  add column if not exists amount_paid numeric(14,2) not null default 0,
  add column if not exists amount_refunded numeric(14,2) not null default 0,
  add column if not exists paid_at timestamptz;
alter table public.orders alter column payment_status set default 'pending';

comment on column public.orders.amount_paid is 'Soma dos pagamentos confirmados (order_payments). Calculado.';
comment on column public.orders.amount_refunded is 'Soma dos reembolsos confirmados (order_payments). Calculado.';
comment on column public.orders.paid_at is 'Quando o pago chegou ao total: a data de recebimento do último pagamento confirmado. Calculado.';
comment on column public.orders.payment_status is
  'pending, awaiting_confirmation, partially_paid, paid, refunded ou failed. Resulta de order_payments (private.order_payment_status); não se escreve à mão.';

create index if not exists orders_paid_at_idx on public.orders (paid_at) where paid_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Pagamentos e reembolsos
-- ---------------------------------------------------------------------------
create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders (id) on delete restrict,
  kind text not null default 'payment' check (kind in ('payment', 'refund')),
  -- reported: indicado (pelo cliente, ou dinheiro recebido por quem entregou) e por verificar;
  -- confirmed: o dinheiro está na conta ou na caixa; rejected: não se encontrou;
  -- voided: estava confirmado e foi anulado (engano, transferência devolvida).
  status text not null check (status in ('reported', 'confirmed', 'rejected', 'voided')),
  amount numeric(14,2) not null check (amount > 0 and amount <= 1000000000),
  method_code text not null default '' check (length(method_code) <= 60),
  method_name text not null default '' check (length(method_name) <= 120),
  reference text not null default '' check (length(reference) <= 120),
  reference_key text not null default '',
  -- Conta onde entrou (ou de onde saiu, num reembolso): "BAI ···159", "Caixa da loja do Huambo".
  account text not null default '' check (length(account) <= 120),
  -- Quem recebeu o dinheiro em mão: o estafeta, a pessoa do balcão.
  collected_by text not null default '' check (length(collected_by) <= 120),
  notes text not null default '' check (length(notes) <= 500),
  source text not null default 'staff' check (source in ('customer', 'staff', 'migration')),
  received_at timestamptz,
  created timestamptz not null default now(),
  created_by uuid,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text not null default '' check (length(decision_reason) <= 300),
  constraint order_payments_confirmado_tem_data check (status <> 'confirmed' or received_at is not null),
  constraint order_payments_reembolso_sem_indicacao check (kind = 'payment' or status in ('confirmed', 'voided'))
);
comment on table public.order_payments is
  'Pagamentos e reembolsos das encomendas. Só se acrescentam linhas; as decisões mudam o estado. Escrita só pelas funções order_payment_* (Edge Function).';

create index if not exists order_payments_order_idx on public.order_payments (order_id, created);
create index if not exists order_payments_reference_idx on public.order_payments (reference_key)
  where reference_key <> '' and kind = 'payment' and status in ('reported', 'confirmed');
create index if not exists order_payments_reported_idx on public.order_payments (created) where status = 'reported';
create index if not exists order_payments_received_idx on public.order_payments (received_at) where status = 'confirmed';
create index if not exists order_payments_created_by_idx on public.order_payments (created_by) where created_by is not null;
create index if not exists order_payments_decided_by_idx on public.order_payments (decided_by) where decided_by is not null;

alter table public.order_payments enable row level security;
revoke all on public.order_payments from public, anon, authenticated;
grant select on public.order_payments to authenticated;
grant all on public.order_payments to service_role;

drop policy if exists "order_payments: encomendas ou pagamentos lêem" on public.order_payments;
create policy "order_payments: encomendas ou pagamentos lêem" on public.order_payments
  for select to authenticated using ((select private.can_read_payments()));

-- Só as funções escrevem (marca `app.payments_write`), e só nestas transições:
-- indicado → confirmado ou rejeitado; confirmado → anulado. Nada se apaga.
create or replace function private.order_payments_guarda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Os pagamentos não se apagam: anule-os, com o motivo.' using errcode = '42501';
  end if;
  if coalesce(current_setting('app.payments_write', true), '') <> 'on' then
    raise exception 'Os pagamentos registam-se pelas funções order_payment_* (painel da loja).' using errcode = '42501';
  end if;
  new.reference := btrim(regexp_replace(coalesce(new.reference, ''), '\s+', ' ', 'g'));
  new.reference_key := private.payment_reference_key(new.reference);
  if tg_op = 'UPDATE' then
    if new.order_id <> old.order_id or new.kind <> old.kind or new.source <> old.source
       or new.created <> old.created or new.created_by is distinct from old.created_by
       or new.method_code <> old.method_code or new.reference <> old.reference then
      raise exception 'Um pagamento registado não muda de encomenda, tipo, método nem referência.' using errcode = '42501';
    end if;
    if new.status <> old.status and not (
      (old.status = 'reported' and new.status in ('confirmed', 'rejected'))
      or (old.status = 'confirmed' and new.status = 'voided')
    ) then
      raise exception 'Passagem de estado do pagamento inválida: % → %.', old.status, new.status using errcode = '42501';
    end if;
    if old.status in ('confirmed', 'rejected', 'voided') and new.amount <> old.amount then
      raise exception 'O valor de um pagamento decidido não muda.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.order_payments_guarda() from public, anon, authenticated;

drop trigger if exists order_payments_guarda on public.order_payments;
create trigger order_payments_guarda
  before insert or update or delete on public.order_payments
  for each row execute function private.order_payments_guarda();

create or replace function private.order_payments_sem_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Os pagamentos não se apagam.' using errcode = '42501';
end;
$$;
revoke all on function private.order_payments_sem_truncate() from public, anon, authenticated;
drop trigger if exists order_payments_sem_truncate on public.order_payments;
create trigger order_payments_sem_truncate
  before truncate on public.order_payments
  for each statement execute function private.order_payments_sem_truncate();

-- ---------------------------------------------------------------------------
-- 4. Estado do pagamento, calculado
-- ---------------------------------------------------------------------------
create or replace function private.order_payment_status(p_order_id text, p_total numeric, p_paid numeric, p_refunded numeric)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(p_paid, 0) > 0 and coalesce(p_refunded, 0) >= p_paid then 'refunded'
    when coalesce(p_paid, 0) > 0 and p_paid >= coalesce(p_total, 0) then 'paid'
    when exists (select 1 from public.order_payments
                 where order_id = p_order_id and kind = 'payment' and status = 'reported') then 'awaiting_confirmation'
    when coalesce(p_paid, 0) > 0 then 'partially_paid'
    when (select status from public.order_payments
          where order_id = p_order_id and kind = 'payment' and status in ('confirmed', 'rejected', 'voided')
          order by coalesce(decided_at, created) desc, created desc limit 1) = 'rejected' then 'failed'
    else 'pending'
  end;
$$;
revoke all on function private.order_payment_status(text, numeric, numeric, numeric) from public, anon, authenticated;

-- Recalcula as somas de uma encomenda e grava-as. `payment_status = payment_status` põe a coluna
-- no UPDATE: os gatilhos "of payment_status" (estado geral, avisos ao cliente, comissão do
-- colportor) correm, e o gatilho orders_0_pagamento calcula o estado novo antes deles.
create or replace function private.order_payments_sync(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_ref text;
begin
  select coalesce(sum(amount) filter (where kind = 'payment' and status = 'confirmed'), 0),
         coalesce(sum(amount) filter (where kind = 'refund' and status = 'confirmed'), 0)
    into v_paid, v_refunded
  from public.order_payments where order_id = p_order_id;
  -- A referência que o painel, a pesquisa e os emails de sempre mostram: a última indicada ou
  -- confirmada. Rejeitada, deixa de contar (o cancelamento por falta de pagamento volta a valer).
  select reference into v_ref from public.order_payments
  where order_id = p_order_id and kind = 'payment' and status in ('reported', 'confirmed') and reference <> ''
  order by coalesce(decided_at, created) desc, created desc limit 1;

  perform set_config('app.payment_sync', 'on', true);
  update public.orders o
  set amount_paid = v_paid,
      amount_refunded = v_refunded,
      payment_reference = coalesce(v_ref, ''),
      payment_status = o.payment_status
  where o.id = p_order_id;
  perform set_config('app.payment_sync', '', true);
end;
$$;
revoke all on function private.order_payments_sync(text) from public, anon, authenticated;

-- Primeiro gatilho das encomendas (o nome começa por "0" para correr antes de
-- orders_a_estado_geral, que avança o estado geral quando fica paga).
--   * Encomenda nova: nada pago, pendente (o place_order já não decide o estado do pagamento).
--   * O pagamento só muda pelas somas (private.order_payments_sync).
--   * O total é sempre a soma dos artigos mais os portes: mudá-lo sozinho não pega.
create or replace function private.orders_payment_derived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sync boolean := coalesce(current_setting('app.payment_sync', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.amount_paid := 0;
    new.amount_refunded := 0;
    new.paid_at := null;
    new.payment_status := 'pending';
    return new;
  end if;

  if not v_sync and (
    new.amount_paid is distinct from old.amount_paid
    or new.amount_refunded is distinct from old.amount_refunded
    or new.paid_at is distinct from old.paid_at
    or new.payment_status is distinct from old.payment_status
    or new.payment_reference is distinct from old.payment_reference
  ) then
    raise exception 'O pagamento da encomenda resulta dos pagamentos registados: registe, confirme ou reembolse um pagamento.'
      using errcode = '42501';
  end if;

  if new.items is distinct from old.items or new.shipping_cost is distinct from old.shipping_cost
     or new.total is distinct from old.total then
    new.total := round(coalesce((
      select sum(coalesce((i ->> 'price')::numeric, 0) * greatest(coalesce((i ->> 'quantity')::int, 1), 0))
      from jsonb_array_elements(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end) i
    ), 0) + coalesce(new.shipping_cost, 0), 2);
  end if;

  if v_sync or new.total is distinct from old.total then
    new.payment_status := private.order_payment_status(new.id, new.total, new.amount_paid, new.amount_refunded);
    new.paid_at := case when new.amount_paid > 0 and new.amount_paid >= new.total then (
      select max(received_at) from public.order_payments
      where order_id = new.id and kind = 'payment' and status = 'confirmed') end;
  end if;
  return new;
end;
$$;
revoke all on function private.orders_payment_derived() from public, anon, authenticated;

drop trigger if exists orders_0_pagamento on public.orders;
create trigger orders_0_pagamento
  before insert or update on public.orders
  for each row execute function private.orders_payment_derived();

-- O orders_before_update fica com a linha do tempo e a devolução do stock; o total passou para
-- o orders_0_pagamento. Igual a 20261105054638, sem o bloco do total.
create or replace function public.orders_before_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  it jsonb;
  v_variant int;
  labels constant jsonb := '{"received":"Encomenda recebida","confirmed":"Encomenda confirmada","preparing":"A preparar envio","shipped":"Enviada","in_transit":"Em trânsito","out_for_delivery":"Saiu para entrega","delivered":"Entregue","cancelled":"Cancelada"}';
begin
  if old.stock_restored and coalesce(new.status, '') <> 'cancelled' and coalesce(new.delivery_status, '') <> 'cancelled' then
    raise exception 'Encomenda cancelada: o stock já foi devolvido e não pode ser reaberta.';
  end if;

  if coalesce(new.delivery_status, '') <> '' and new.delivery_status is distinct from old.delivery_status then
    new.delivery_timeline := coalesce(new.delivery_timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'status', new.delivery_status,
      'title', coalesce(labels ->> new.delivery_status, new.delivery_status),
      'description', '',
      'location', coalesce(nullif(new.delivery_municipality, ''), nullif(new.pickup_store, ''), new.city, ''),
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ));
  end if;

  if not new.stock_restored and (
    (new.status = 'cancelled' and old.status is distinct from 'cancelled') or
    (new.delivery_status = 'cancelled' and old.delivery_status is distinct from 'cancelled')
  ) then
    perform set_config('app.stock_reason', 'cancelamento', true);
    perform set_config('app.stock_ref', coalesce(new.order_number, ''), true);
    for it in select * from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
      if coalesce(it ->> 'book_id', '') <> '' and coalesce((it ->> 'quantity')::int, 0) > 0 then
        v_variant := nullif(it ->> 'variant', '')::int;
        update public.stock_books b
          set stock = coalesce(b.stock, 0) + (it ->> 'quantity')::int,
              sales_count = greatest(coalesce(b.sales_count, 0) - (it ->> 'quantity')::int, 0),
              versions = case
                when v_variant is not null and jsonb_typeof(b.versions) = 'array' and v_variant < jsonb_array_length(b.versions)
                     and coalesce(b.versions -> v_variant ->> 'stock', '') ~ '^\s*-?\d+(\.\d+)?\s*$'
                then jsonb_set(b.versions, array[v_variant::text, 'stock'],
                               to_jsonb(floor((b.versions -> v_variant ->> 'stock')::numeric)::int + (it ->> 'quantity')::int))
                else b.versions end
          where b.id = it ->> 'book_id';
      end if;
    end loop;
    perform set_config('app.stock_reason', '', true);
    perform set_config('app.stock_ref', '', true);
    new.stock_restored := true;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. O painel só grava o seguimento
-- ---------------------------------------------------------------------------
-- Tudo o resto (pagamento, total, artigos, portes, entrega, stock devolvido) muda pela Edge
-- Function ou pelas funções da base de dados, que verificam e deixam rasto.
revoke update on public.orders from anon, authenticated;
grant update (status, tracking_number, carrier, estimated_delivery, colporteur_code) on public.orders to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Escrita: indicar, registar, confirmar, rejeitar, anular, reembolsar
-- ---------------------------------------------------------------------------

-- Outras encomendas com a mesma referência (indicada ou confirmada).
create or replace function private.payment_reference_elsewhere(p_order_id text, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object(
           'order_id', o.id, 'order_number', coalesce(nullif(o.order_number, ''), o.id), 'status', p.status)), '[]'::jsonb)
  from public.order_payments p
  join public.orders o on o.id = p.order_id
  where coalesce(p_key, '') <> '' and p.reference_key = p_key and p.order_id <> p_order_id
    and p.kind = 'payment' and p.status in ('reported', 'confirmed');
$$;
revoke all on function private.payment_reference_elsewhere(text, text) from public, anon, authenticated;

-- O que as funções devolvem: o pagamento e o estado da encomenda antes e depois.
create or replace function private.order_payment_result(p_order_id text, p_payment_id uuid, p_before text, p_extra jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payment_id', p_payment_id,
    'order_id', o.id,
    'order_number', coalesce(nullif(o.order_number, ''), o.id),
    'previous_status', p_before,
    'payment_status', o.payment_status,
    'total', o.total,
    'amount_paid', o.amount_paid,
    'amount_refunded', o.amount_refunded,
    'outstanding', greatest(o.total - o.amount_paid, 0),
    'overpaid', greatest(o.amount_paid - o.amount_refunded - o.total, 0),
    'paid_at', o.paid_at,
    'cancelled', coalesce(o.status, '') = 'cancelled' or coalesce(o.delivery_status, '') = 'cancelled'
  ) || coalesce(p_extra, '{}'::jsonb)
  from public.orders o where o.id = p_order_id;
$$;
revoke all on function private.order_payment_result(text, uuid, text, jsonb) from public, anon, authenticated;

-- Data de um pagamento: não no futuro, nem muito antes da encomenda (um pagamento adiantado
-- pelo WhatsApp pode ter alguns dias).
create or replace function private.payment_date_ok(p_at timestamptz, p_order_created timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_at timestamptz := coalesce(p_at, now());
begin
  if v_at > now() + interval '10 minutes' then
    raise exception 'A data do pagamento não pode ser no futuro.';
  end if;
  if v_at < coalesce(p_order_created, now()) - interval '30 days' then
    raise exception 'A data do pagamento é mais de 30 dias anterior à encomenda.';
  end if;
  return v_at;
end;
$$;
revoke all on function private.payment_date_ok(timestamptz, timestamptz) from public, anon, authenticated;

-- A mesma referência já confirmou outra encomenda: só passa com `p_shared_ok` (a mesma
-- transferência pagou as duas), e isso fica escrito na nota.
create or replace function private.assert_reference_free(p_order_id text, p_key text, p_shared_ok boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_other text;
begin
  if coalesce(p_key, '') = '' then return ''; end if;
  select string_agg(distinct coalesce(nullif(o.order_number, ''), o.id), ', ') into v_other
  from public.order_payments p join public.orders o on o.id = p.order_id
  where p.reference_key = p_key and p.order_id <> p_order_id and p.kind = 'payment' and p.status = 'confirmed';
  if v_other is null then return ''; end if;
  if not coalesce(p_shared_ok, false) then
    raise exception 'Esta referência já confirmou a encomenda %. Se a mesma transferência pagou as duas, confirme que é partilhada.', v_other
      using errcode = 'P0001', hint = 'shared_reference';
  end if;
  return 'Referência partilhada com ' || v_other || '.';
end;
$$;
revoke all on function private.assert_reference_free(text, text, boolean) from public, anon, authenticated;

-- O cliente indica a referência (Edge Function, depois de verificar o número e o contacto), ou
-- quem entregou diz que recebeu o dinheiro (p_source 'staff'): fica "indicado", por verificar.
-- A mesma referência outra vez devolve o que já existe; uma referência nova do cliente substitui
-- a que ele tinha indicado e ainda estava por verificar (a antiga fica, rejeitada, com o motivo).
create or replace function public.order_payment_report(
  p_order_id text, p_reference text, p_source text default 'customer',
  p_amount numeric default null, p_collected_by text default '', p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_ref text := left(btrim(regexp_replace(coalesce(p_reference, ''), '\s+', ' ', 'g')), 120);
  v_key text := private.payment_reference_key(p_reference);
  v_source text := case when p_source = 'staff' then 'staff' else 'customer' end;
  v_amount numeric(14,2);
  v_existing uuid;
  v_id uuid;
  v_before text;
  v_replaced boolean := false;
  v_actor uuid := private.payments_actor();
begin
  perform private.assert_payments_writer();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  v_before := v_order.payment_status;
  if coalesce(v_order.status, '') = 'cancelled' or coalesce(v_order.delivery_status, '') = 'cancelled' then
    raise exception 'Esta encomenda foi cancelada.';
  end if;
  if v_source = 'customer' and length(v_key) < 4 then
    raise exception 'Indique a referência do pagamento (pelo menos 4 letras ou algarismos).';
  end if;
  v_amount := round(coalesce(p_amount, v_order.total - v_order.amount_paid), 2);
  if v_order.amount_paid >= v_order.total and v_order.total > 0 then
    raise exception 'O pagamento desta encomenda já foi confirmado.';
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'Valor inválido.'; end if;

  if v_key <> '' then
    select id into v_existing from public.order_payments
    where order_id = p_order_id and kind = 'payment' and reference_key = v_key and status in ('reported', 'confirmed')
    limit 1;
    if v_existing is not null then
      return private.order_payment_result(p_order_id, v_existing, v_before,
        jsonb_build_object('repeated', true, 'replaced', false, 'duplicates', private.payment_reference_elsewhere(p_order_id, v_key)));
    end if;
  end if;
  if v_source = 'customer' and (select count(*) from public.order_payments
                                where order_id = p_order_id and source = 'customer') >= 10 then
    raise exception 'Já indicou muitas referências para esta encomenda. Fale connosco pelo WhatsApp.';
  end if;

  perform set_config('app.payments_write', 'on', true);
  if v_source = 'customer' then
    update public.order_payments
    set status = 'rejected', decided_at = now(), decision_reason = 'Substituída pelo cliente por outra referência.'
    where order_id = p_order_id and kind = 'payment' and status = 'reported' and source = 'customer';
    v_replaced := found;
  end if;
  insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, reference,
                                     collected_by, notes, source, created_by)
  values (p_order_id, 'payment', 'reported', v_amount, coalesce(v_order.payment_method_code, ''),
          left(coalesce(v_order.payment_method_name, ''), 120), v_ref, left(btrim(coalesce(p_collected_by, '')), 120),
          left(btrim(coalesce(p_notes, '')), 500), v_source, case when v_source = 'staff' then v_actor end)
  returning id into v_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(p_order_id);

  perform private.audit_write('order_payments', v_id::text, 'insert',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': pagamento indicado'
      || case when v_source = 'staff' then ' por quem recebeu (' || coalesce(nullif(btrim(p_collected_by), ''), 'equipa') || ')' else ' pelo cliente' end
      || ', ' || private.kz(v_amount) || case when v_ref <> '' then ', referência ' || v_ref else '' end,
    jsonb_build_object('status', jsonb_build_object('de', null, 'para', 'reported'), 'amount', v_amount), false);

  return private.order_payment_result(p_order_id, v_id, v_before,
    jsonb_build_object('repeated', false, 'replaced', v_replaced, 'duplicates', private.payment_reference_elsewhere(p_order_id, v_key)));
end;
$$;

-- A equipa regista um pagamento já verificado: dinheiro ou TPA no balcão, pagamento na entrega
-- entregue na loja, transferência vista no extracto sem o cliente a ter indicado.
create or replace function public.order_payment_record(
  p_order_id text, p_amount numeric, p_method_code text default null, p_reference text default '',
  p_received_at timestamptz default null, p_account text default '', p_collected_by text default '',
  p_notes text default '', p_shared_reference_ok boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_method public.payment_methods;
  v_code text := nullif(btrim(coalesce(p_method_code, '')), '');
  v_key text := private.payment_reference_key(p_reference);
  v_amount numeric(14,2) := round(p_amount, 2);
  v_at timestamptz;
  v_note text;
  v_id uuid;
  v_before text;
begin
  perform private.assert_payments_writer();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  v_before := v_order.payment_status;
  if v_amount is null or v_amount <= 0 or v_amount > 1000000000 then raise exception 'Indique o valor recebido.'; end if;
  v_at := private.payment_date_ok(p_received_at, v_order.created);
  v_code := coalesce(v_code, nullif(v_order.payment_method_code, ''), '');
  select * into v_method from public.payment_methods where code = v_code limit 1;
  if v_key <> '' then perform pg_advisory_xact_lock(hashtext('order_payments:' || v_key)); end if;
  v_note := private.assert_reference_free(p_order_id, v_key, p_shared_reference_ok);

  perform set_config('app.payments_write', 'on', true);
  insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, reference, account,
                                     collected_by, notes, source, received_at, created_by, decided_at, decided_by)
  values (p_order_id, 'payment', 'confirmed', v_amount, v_code,
          left(coalesce(v_method.name, nullif(v_order.payment_method_name, ''), v_code), 120),
          left(coalesce(p_reference, ''), 120), left(btrim(coalesce(p_account, '')), 120),
          left(btrim(coalesce(p_collected_by, '')), 120),
          left(btrim(concat_ws(' ', nullif(btrim(coalesce(p_notes, '')), ''), nullif(v_note, ''))), 500),
          'staff', v_at, private.payments_actor(), now(), private.payments_actor())
  returning id into v_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(p_order_id);

  perform private.audit_write('order_payments', v_id::text, 'insert',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': pagamento registado, '
      || private.kz(v_amount) || ' (' || coalesce(nullif(v_code, ''), 'sem método') || ')'
      || case when v_key <> '' then ', referência ' || p_reference else '' end,
    jsonb_build_object('status', jsonb_build_object('de', null, 'para', 'confirmed'), 'amount', v_amount,
                       'received_at', v_at, 'shared_reference', v_note <> ''), false);

  return private.order_payment_result(p_order_id, v_id, v_before, jsonb_build_object('note', v_note));
end;
$$;

-- Confirma um pagamento indicado, com o valor que de facto entrou (por omissão, o indicado).
create or replace function public.order_payment_confirm(
  p_payment_id uuid, p_amount numeric default null, p_received_at timestamptz default null,
  p_account text default '', p_notes text default '', p_shared_reference_ok boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.order_payments;
  v_order public.orders;
  v_amount numeric(14,2);
  v_at timestamptz;
  v_note text;
  v_before text;
begin
  perform private.assert_payments_writer();
  select * into v_pay from public.order_payments where id = p_payment_id;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;
  select * into v_pay from public.order_payments where id = p_payment_id for update;
  if v_pay.kind <> 'payment' or v_pay.status <> 'reported' then
    raise exception 'Só se confirma um pagamento indicado e ainda por verificar.';
  end if;
  v_before := v_order.payment_status;
  v_amount := round(coalesce(p_amount, v_pay.amount), 2);
  if v_amount is null or v_amount <= 0 or v_amount > 1000000000 then raise exception 'Indique o valor recebido.'; end if;
  v_at := private.payment_date_ok(p_received_at, v_order.created);
  if v_pay.reference_key <> '' then perform pg_advisory_xact_lock(hashtext('order_payments:' || v_pay.reference_key)); end if;
  v_note := private.assert_reference_free(v_pay.order_id, v_pay.reference_key, p_shared_reference_ok);

  perform set_config('app.payments_write', 'on', true);
  update public.order_payments
  set status = 'confirmed', amount = v_amount, received_at = v_at,
      account = left(btrim(coalesce(nullif(p_account, ''), account)), 120),
      notes = left(btrim(concat_ws(' ', nullif(notes, ''), nullif(btrim(coalesce(p_notes, '')), ''), nullif(v_note, ''))), 500),
      decided_at = now(), decided_by = private.payments_actor()
  where id = p_payment_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(v_pay.order_id);

  perform private.audit_write('order_payments', p_payment_id::text, 'update',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': pagamento confirmado, ' || private.kz(v_amount)
      || case when v_amount <> v_pay.amount then ' (indicado: ' || private.kz(v_pay.amount) || ')' else '' end,
    jsonb_build_object('status', jsonb_build_object('de', 'reported', 'para', 'confirmed'),
                       'amount', jsonb_build_object('de', v_pay.amount, 'para', v_amount),
                       'received_at', v_at, 'shared_reference', v_note <> ''), false);

  return private.order_payment_result(v_pay.order_id, p_payment_id, v_before,
    jsonb_build_object('note', v_note, 'reported_amount', v_pay.amount, 'source', v_pay.source));
end;
$$;

-- Rejeita um pagamento indicado que não se encontrou. O motivo vai para o cliente.
create or replace function public.order_payment_reject(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.order_payments;
  v_order public.orders;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_before text;
begin
  perform private.assert_payments_writer();
  if length(v_reason) < 5 then raise exception 'Diga ao cliente porque não foi aceite (pelo menos 5 letras).'; end if;
  select * into v_pay from public.order_payments where id = p_payment_id;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;
  select * into v_pay from public.order_payments where id = p_payment_id for update;
  if v_pay.kind <> 'payment' or v_pay.status <> 'reported' then
    raise exception 'Só se rejeita um pagamento indicado e ainda por verificar.';
  end if;
  v_before := v_order.payment_status;

  perform set_config('app.payments_write', 'on', true);
  update public.order_payments
  set status = 'rejected', decided_at = now(), decided_by = private.payments_actor(), decision_reason = v_reason
  where id = p_payment_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(v_pay.order_id);

  perform private.audit_write('order_payments', p_payment_id::text, 'update',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': pagamento indicado rejeitado — ' || v_reason,
    jsonb_build_object('status', jsonb_build_object('de', 'reported', 'para', 'rejected')), false);

  return private.order_payment_result(v_pay.order_id, p_payment_id, v_before,
    jsonb_build_object('reason', v_reason, 'reference', v_pay.reference, 'source', v_pay.source));
end;
$$;

-- Anula um pagamento (ou reembolso) confirmado por engano. Avisa os administradores: é dinheiro
-- que deixa de contar.
create or replace function public.order_payment_void(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.order_payments;
  v_order public.orders;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_before text;
begin
  perform private.assert_payments_writer();
  if length(v_reason) < 5 then raise exception 'Explique porque anula (pelo menos 5 letras).'; end if;
  select * into v_pay from public.order_payments where id = p_payment_id;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;
  select * into v_pay from public.order_payments where id = p_payment_id for update;
  if v_pay.status <> 'confirmed' then raise exception 'Só se anula um pagamento ou reembolso confirmado.'; end if;
  if v_pay.kind = 'payment' and v_order.amount_paid - v_pay.amount < v_order.amount_refunded then
    raise exception 'Há reembolsos maiores do que o que ficaria pago: anule primeiro o reembolso.';
  end if;
  v_before := v_order.payment_status;

  perform set_config('app.payments_write', 'on', true);
  update public.order_payments
  set status = 'voided', decided_at = now(), decided_by = private.payments_actor(), decision_reason = v_reason
  where id = p_payment_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(v_pay.order_id);

  perform private.audit_write('order_payments', p_payment_id::text, 'update',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': '
      || case when v_pay.kind = 'refund' then 'reembolso' else 'pagamento' end || ' de ' || private.kz(v_pay.amount)
      || ' anulado — ' || v_reason,
    jsonb_build_object('status', jsonb_build_object('de', 'confirmed', 'para', 'voided'), 'amount', v_pay.amount), true);

  return private.order_payment_result(v_pay.order_id, p_payment_id, v_before, jsonb_build_object('reason', v_reason, 'kind', v_pay.kind));
end;
$$;

-- Reembolso: dinheiro devolvido ao cliente. Nunca mais do que o que ficou pago.
create or replace function public.order_refund_record(
  p_order_id text, p_amount numeric, p_method_code text default null, p_reference text default '',
  p_refunded_at timestamptz default null, p_account text default '', p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_amount numeric(14,2) := round(p_amount, 2);
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_code text := nullif(btrim(coalesce(p_method_code, '')), '');
  v_at timestamptz;
  v_id uuid;
  v_before text;
begin
  perform private.assert_payments_writer();
  if length(v_reason) < 5 then raise exception 'Diga o motivo do reembolso (pelo menos 5 letras).'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  v_before := v_order.payment_status;
  if v_amount is null or v_amount <= 0 then raise exception 'Indique o valor devolvido.'; end if;
  if v_amount > v_order.amount_paid - v_order.amount_refunded then
    raise exception 'Só se devolve o que foi pago: no máximo %.', private.kz(v_order.amount_paid - v_order.amount_refunded);
  end if;
  v_at := private.payment_date_ok(p_refunded_at, v_order.created);
  v_code := coalesce(v_code, nullif(v_order.payment_method_code, ''), '');

  perform set_config('app.payments_write', 'on', true);
  insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, reference, account,
                                     notes, source, received_at, created_by, decided_at, decided_by, decision_reason)
  values (p_order_id, 'refund', 'confirmed', v_amount, v_code,
          left(coalesce((select name from public.payment_methods where code = v_code limit 1), nullif(v_order.payment_method_name, ''), v_code), 120),
          left(coalesce(p_reference, ''), 120), left(btrim(coalesce(p_account, '')), 120), '', 'staff', v_at,
          private.payments_actor(), now(), private.payments_actor(), v_reason)
  returning id into v_id;
  perform set_config('app.payments_write', '', true);
  perform private.order_payments_sync(p_order_id);

  perform private.audit_write('order_payments', v_id::text, 'insert',
    'Encomenda ' || coalesce(nullif(v_order.order_number, ''), v_order.id) || ': reembolso de ' || private.kz(v_amount) || ' — ' || v_reason,
    jsonb_build_object('kind', 'refund', 'amount', v_amount, 'refunded_at', v_at), false);

  return private.order_payment_result(p_order_id, v_id, v_before, jsonb_build_object('refund_amount', v_amount, 'reason', v_reason));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.order_payment_report(text, text, text, numeric, text, text)',
    'public.order_payment_record(text, numeric, text, text, timestamptz, text, text, text, boolean)',
    'public.order_payment_confirm(uuid, numeric, timestamptz, text, text, boolean)',
    'public.order_payment_reject(uuid, text)',
    'public.order_payment_void(uuid, text)',
    'public.order_refund_record(text, numeric, text, text, timestamptz, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Leitura para o painel: a encomenda, os pagamentos e as referências repetidas
-- ---------------------------------------------------------------------------
create or replace function public.order_payments_overview(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_read_payments() then
    raise exception 'Sem acesso aos pagamentos.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'order', jsonb_build_object(
        'id', o.id, 'order_number', coalesce(nullif(o.order_number, ''), o.id), 'total', o.total,
        'amount_paid', o.amount_paid, 'amount_refunded', o.amount_refunded,
        'outstanding', greatest(o.total - o.amount_paid, 0),
        'overpaid', greatest(o.amount_paid - o.amount_refunded - o.total, 0),
        'refund_due', case when coalesce(o.status, '') = 'cancelled' or coalesce(o.delivery_status, '') = 'cancelled'
                           then greatest(o.amount_paid - o.amount_refunded, 0) else 0 end,
        'payment_status', o.payment_status, 'paid_at', o.paid_at, 'status', o.status,
        'delivery_status', o.delivery_status, 'payment_method_code', o.payment_method_code,
        'payment_method_name', o.payment_method_name, 'shipping_method', o.shipping_method),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id, 'kind', p.kind, 'status', p.status, 'amount', p.amount, 'method_code', p.method_code,
          'method_name', p.method_name, 'reference', p.reference, 'account', p.account,
          'collected_by', p.collected_by, 'notes', p.notes, 'source', p.source, 'received_at', p.received_at,
          'created', p.created, 'decided_at', p.decided_at, 'decision_reason', p.decision_reason,
          'created_by_name', (select coalesce(nullif(pr.name, ''), pr.email) from public.profiles pr where pr.id = p.created_by),
          'decided_by_name', (select coalesce(nullif(pr.name, ''), pr.email) from public.profiles pr where pr.id = p.decided_by),
          'duplicates', case when p.kind = 'payment' and p.status in ('reported', 'confirmed')
                             then private.payment_reference_elsewhere(p.order_id, p.reference_key) else '[]'::jsonb end
        ) order by p.created)
        from public.order_payments p where p.order_id = o.id), '[]'::jsonb)
    )
    from public.orders o where o.id = p_order_id
  );
end;
$$;
revoke all on function public.order_payments_overview(text) from public, anon;
grant execute on function public.order_payments_overview(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Avisos na conta do cliente: "pago em parte" e "não confirmado"
-- ---------------------------------------------------------------------------
-- Igual a 20261107020000_equipas_alertas_e_prazos, com os dois estados novos no bloco do pagamento.
create or replace function private.notify_order_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_number text;
  v_label text;
  v_title text;
  v_store text;
  v_where text;
begin
  if tg_op = 'INSERT' then
    v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);
    if new.customer_id is not null then
      insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
      values (new.customer_id, 'order', 'Encomenda recebida',
        'A encomenda ' || v_number || ' foi registada. Vamos avisá-lo de cada passo.',
        '/profile?tab=orders', new.id);
    end if;
    v_store := private.order_store_id(new.shipping_method, new.pickup_store);
    v_where := case
      when new.shipping_method = 'pickup' then 'Levantamento: ' || coalesce(nullif(new.pickup_store, ''), 'loja')
      when new.shipping_method = 'express' then 'Entrega expressa'
      else 'Entrega ao domicílio' end;
    perform private.notify_staff(
      'new_order', v_store, 'new_order',
      'Nova encomenda ' || v_number || ' — assumir',
      v_where || ' · ' || coalesce(nullif(new.customer_name, ''), 'Cliente') || ' · ' || private.kz(new.total),
      new.id, null, 'high'
    );
    return new;
  end if;

  if new.customer_id is null then return new; end if;
  v_number := left(coalesce(nullif(new.order_number, ''), new.id), 400);

  if new.status is distinct from old.status and new.status = 'cancelled' then
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'order', 'Encomenda cancelada',
      'A encomenda ' || v_number || ' foi cancelada. Se tiver dúvidas, fale connosco.', '/profile?tab=orders', new.id);
  end if;

  if new.payment_status is distinct from old.payment_status then
    v_label := case new.payment_status
      when 'pending' then 'pendente'
      when 'awaiting_confirmation' then 'a aguardar confirmação'
      when 'partially_paid' then 'pago em parte'
      when 'paid' then 'confirmado'
      when 'failed' then 'não confirmado'
      when 'refunded' then 'devolvido'
      else coalesce(nullif(new.payment_status, ''), 'pendente') end;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'payment',
      case new.payment_status
        when 'paid' then 'Pagamento confirmado'
        when 'partially_paid' then 'Pagamento recebido em parte'
        when 'failed' then 'Pagamento não confirmado'
        else 'Pagamento: ' || v_label end,
      case new.payment_status
        when 'partially_paid' then 'Recebemos ' || private.kz(new.amount_paid) || ' da encomenda ' || v_number
          || '. Faltam ' || private.kz(greatest(new.total - new.amount_paid, 0)) || '.'
        when 'failed' then 'Não encontrámos o pagamento da encomenda ' || v_number
          || '. Veja o motivo na página da encomenda e indique outra referência.'
        else 'O pagamento da encomenda ' || v_number || ' está agora: ' || v_label || '.' end,
      '/profile?tab=orders', new.id);
  end if;

  if new.delivery_status is distinct from old.delivery_status and coalesce(new.delivery_status, '') not in ('', 'cancelled') then
    select t.title, t.body into v_title, v_label from (values
      ('received', 'Encomenda recebida', 'foi registada'),
      ('confirmed', 'Encomenda confirmada', 'está confirmada e na fila de preparação'),
      ('preparing', 'A preparar a sua encomenda', 'está a ser separada e embalada'),
      ('processing', 'A preparar a sua encomenda', 'está a ser separada e embalada'),
      ('shipped', case when new.shipping_method = 'pickup' then 'Pronta para levantamento' else 'Encomenda expedida' end,
                  case when new.shipping_method = 'pickup' then 'está pronta para levantar na loja' else 'já saiu da nossa loja' end),
      ('in_transit', 'Encomenda em trânsito', 'está a caminho'),
      ('out_for_delivery', 'Saiu para entrega', 'saiu para entrega e deve chegar hoje'),
      ('delivered', 'Encomenda entregue', 'foi entregue. Obrigado pela sua compra!'),
      ('failed', 'Ocorrência na entrega', 'teve uma ocorrência na entrega. Vamos contactá-lo')
    ) as t(status, title, body)
    where t.status = new.delivery_status;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'delivery', coalesce(v_title, 'Estado da entrega actualizado'),
      'A encomenda ' || v_number || ' ' || coalesce(v_label, 'mudou de estado: ' || new.delivery_status) || '.',
      '/profile?tab=orders', new.id);
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 9. As encomendas que já existem
-- ---------------------------------------------------------------------------
-- Pagas (ou reembolsadas): um pagamento confirmado pelo total, na data do passo "paid" da linha
-- do tempo. Reembolsadas: também o reembolso. A aguardar confirmação: o indicado. Falhadas com
-- referência: o indicado, rejeitado. Nada avisa ninguém: o estado calculado é o mesmo que estava.
select set_config('app.payments_write', 'on', false);

insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, reference, notes, source,
                                   received_at, created, decided_at)
select o.id, 'payment', 'confirmed', o.total, coalesce(o.payment_method_code, ''), left(coalesce(o.payment_method_name, ''), 120),
       left(coalesce(o.payment_reference, ''), 120),
       'Pagamento confirmado antes do registo de pagamentos: valor igual ao total da encomenda.', 'migration',
       coalesce((select max((e ->> 'at')::timestamptz)
                 from jsonb_array_elements(case when jsonb_typeof(o.delivery_timeline) = 'array' then o.delivery_timeline else '[]'::jsonb end) e
                 where e ->> 'status' = 'paid' and coalesce(e ->> 'at', '') ~ '^\d{4}-\d{2}-\d{2}'), o.updated, o.created),
       o.created, now()
from public.orders o
where o.payment_status in ('paid', 'refunded') and o.total > 0
  and not exists (select 1 from public.order_payments p where p.order_id = o.id);

insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, notes, source,
                                   received_at, created, decided_at, decision_reason)
select o.id, 'refund', 'confirmed', o.total, coalesce(o.payment_method_code, ''), left(coalesce(o.payment_method_name, ''), 120),
       '', 'migration', o.updated, o.updated, now(), 'Reembolsada antes do registo de pagamentos.'
from public.orders o
where o.payment_status = 'refunded' and o.total > 0
  and not exists (select 1 from public.order_payments p where p.order_id = o.id and p.kind = 'refund');

insert into public.order_payments (order_id, kind, status, amount, method_code, method_name, reference, notes, source, created,
                                   decided_at, decision_reason)
select o.id, 'payment', case when o.payment_status = 'failed' then 'rejected' else 'reported' end, o.total,
       coalesce(o.payment_method_code, ''), left(coalesce(o.payment_method_name, ''), 120), left(o.payment_reference, 120),
       'Referência indicada antes do registo de pagamentos.', 'migration', o.updated,
       case when o.payment_status = 'failed' then now() end,
       case when o.payment_status = 'failed' then 'Marcado como falhado antes do registo de pagamentos.' else '' end
from public.orders o
where o.payment_status in ('awaiting_confirmation', 'failed') and coalesce(btrim(o.payment_reference), '') <> '' and o.total > 0
  and not exists (select 1 from public.order_payments p where p.order_id = o.id);

select set_config('app.payments_write', '', false);

select private.order_payments_sync(o.id)
from public.orders o
where exists (select 1 from public.order_payments p where p.order_id = o.id);

-- ---------------------------------------------------------------------------
-- 10. Estados só com os valores conhecidos
-- ---------------------------------------------------------------------------
-- NOT VALID e depois VALIDATE: se uma encomenda antiga tiver um valor fora da lista, a regra vale
-- na mesma para tudo o que se gravar daqui para a frente, e o aviso diz que há linhas a corrigir.
alter table public.orders drop constraint if exists orders_payment_status_valido;
alter table public.orders add constraint orders_payment_status_valido
  check (payment_status in ('pending', 'awaiting_confirmation', 'partially_paid', 'paid', 'refunded', 'failed')) not valid;
alter table public.orders drop constraint if exists orders_status_valido;
alter table public.orders add constraint orders_status_valido
  check (coalesce(status, '') in ('', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled')) not valid;
alter table public.orders drop constraint if exists orders_delivery_status_valido;
alter table public.orders add constraint orders_delivery_status_valido
  check (coalesce(delivery_status, '') in ('', 'received', 'confirmed', 'preparing', 'processing', 'shipped', 'in_transit',
                                           'out_for_delivery', 'delivered', 'cancelled', 'failed')) not valid;
do $$
declare c text;
begin
  foreach c in array array['orders_payment_status_valido', 'orders_status_valido', 'orders_delivery_status_valido'] loop
    begin
      execute format('alter table public.orders validate constraint %I', c);
    exception when check_violation then
      raise warning 'Há encomendas antigas fora da regra %: a regra vale para o que se gravar daqui em diante.', c;
    end;
  end loop;
end
$$;
