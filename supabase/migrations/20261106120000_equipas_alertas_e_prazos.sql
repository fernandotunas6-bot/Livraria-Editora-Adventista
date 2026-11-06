-- Equipas, responsáveis por loja, prazos e escalonamento.
--
-- Até aqui, cada aviso (encomenda nova, encomenda parada, mensagem de cliente) ia para TODA a
-- equipa com "gerir encomendas", só no painel, e ninguém tinha de dizer "fico eu com isto".
-- Passa a funcionar como nas operações de referência (filas por equipa, confirmação de quem
-- trata, escalonamento quando ninguém responde a tempo):
--
--   * Equipas com funções (receber encomendas, pagamentos, preparação, levantamentos, entregas,
--     atendimento, urgências), opcionalmente ligadas a uma loja física. Uma encomenda com
--     levantamento numa loja vai para a equipa dessa loja; as outras, para as equipas centrais.
--   * Quem recebe uma encomenda nova tem de a ASSUMIR. Se ninguém o fizer dentro do tempo da
--     equipa (em horário de funcionamento), o alerta sobe aos responsáveis e à equipa de
--     urgências. O mesmo para alertas críticos e pedidos de ajuda fora do prazo (SLA).
--   * Cada aviso guarda a gravidade e o estado do envio por email, WhatsApp e push; a Edge
--     Function envia-os (de 2 em 2 minutos, só quando há algum por enviar).
--
-- Sem equipas configuradas, tudo continua como antes: os avisos vão para quem gere encomendas.
-- Depende de 20261106090000_assistente_conversas_e_pedidos.sql.

-- ---------------------------------------------------------------------------
-- 1. Equipas e membros
-- ---------------------------------------------------------------------------
create table public.staff_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  store_id text references public.physical_stores (id) on delete set null,
  duties text[] not null default '{}'
    check (duties <@ array['new_order', 'payment', 'preparation', 'pickup', 'delivery', 'support', 'urgent']::text[]),
  escalation_minutes integer not null default 30 check (escalation_minutes between 5 and 1440),
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default false,
  notify_push boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_teams_name_key on public.staff_teams (lower(btrim(name)));
create index staff_teams_store_idx on public.staff_teams (store_id) where store_id is not null;

create table public.staff_team_members (
  team_id uuid not null references public.staff_teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (team_id, profile_id)
);
create index staff_team_members_profile_idx on public.staff_team_members (profile_id);

-- Horário de funcionamento (hora de Luanda): os prazos para assumir contam só dentro dele, e
-- fora dele só os avisos críticos saem por email/WhatsApp/push (os outros esperam pela abertura).
create table public.staff_ops_settings (
  id smallint primary key default 1 check (id = 1),
  open_hour smallint not null default 8 check (open_hour between 0 and 23),
  close_hour smallint not null default 18 check (close_hour between 1 and 24),
  open_days smallint[] not null default '{1,2,3,4,5,6}'
    check (open_days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(open_days) between 1 and 7),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  check (open_hour < close_hour)
);
insert into public.staff_ops_settings (id) values (1) on conflict do nothing;

-- Só pessoas da equipa (admin ou gestor) entram numa equipa.
create or replace function private.staff_team_member_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.profile_id and p.role in ('admin', 'manager')) then
    raise exception 'Só administradores e gestores podem pertencer a uma equipa.';
  end if;
  return new;
end;
$$;
revoke all on function private.staff_team_member_guard() from public, anon, authenticated;
create trigger staff_team_members_guard
  before insert or update on public.staff_team_members
  for each row execute function private.staff_team_member_guard();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
create trigger staff_teams_touch before update on public.staff_teams
  for each row execute function private.touch_updated_at();

alter table public.staff_teams enable row level security;
alter table public.staff_team_members enable row level security;
alter table public.staff_ops_settings enable row level security;

revoke all on public.staff_teams, public.staff_team_members, public.staff_ops_settings from public, anon, authenticated;
grant select, insert, update, delete on public.staff_teams, public.staff_team_members to authenticated;
grant select, update on public.staff_ops_settings to authenticated;

-- Toda a equipa vê quem é responsável por quê; só quem gere utilizadores altera.
create policy "staff_teams: equipa lê" on public.staff_teams for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin', 'manager')));
create policy "staff_teams: gestão de utilizadores altera" on public.staff_teams for all to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));
create policy "staff_team_members: equipa lê" on public.staff_team_members for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin', 'manager')));
create policy "staff_team_members: gestão de utilizadores altera" on public.staff_team_members for all to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));
create policy "staff_ops_settings: equipa lê" on public.staff_ops_settings for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('admin', 'manager')));
create policy "staff_ops_settings: gestão de utilizadores altera" on public.staff_ops_settings for update to authenticated
  using ((select private.has_permission('manage_users')))
  with check ((select private.has_permission('manage_users')));

-- ---------------------------------------------------------------------------
-- 2. Quem recebe cada aviso
-- ---------------------------------------------------------------------------
-- Loja de uma encomenda: só os levantamentos têm loja (o checkout guarda o nome da loja).
create or replace function private.order_store_id(p_shipping_method text, p_pickup_store text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.physical_stores s
  where p_shipping_method = 'pickup'
    and nullif(btrim(coalesce(p_pickup_store, '')), '') is not null
    and (s.id = p_pickup_store or lower(btrim(s.name)) = lower(btrim(p_pickup_store)))
  order by s.active desc
  limit 1;
$$;
revoke all on function private.order_store_id(text, text) from public, anon, authenticated;

-- Destinatários de uma função: as equipas dessa loja; sem nenhuma, as equipas centrais (sem
-- loja); sem nenhuma, qualquer equipa com essa função. Com `p_escalate`, os responsáveis dessas
-- equipas e a equipa de urgências. Sem ninguém configurado, quem gere encomendas (como antes).
-- Só contam pessoas que ainda são da equipa e podem ver encomendas.
create or replace function public.ops_recipients(p_duty text, p_store_id text default null, p_escalate boolean default false)
returns table (profile_id uuid, is_lead boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_teams uuid[];
  v_urgent uuid[];
begin
  if p_store_id is not null then
    select array_agg(t.id) into v_teams from public.staff_teams t
    where t.active and p_duty = any (t.duties) and t.store_id = p_store_id;
  end if;
  if v_teams is null then
    select array_agg(t.id) into v_teams from public.staff_teams t
    where t.active and p_duty = any (t.duties) and t.store_id is null;
  end if;
  if v_teams is null then
    select array_agg(t.id) into v_teams from public.staff_teams t
    where t.active and p_duty = any (t.duties);
  end if;
  if p_escalate then
    select array_agg(t.id) into v_urgent from public.staff_teams t
    where t.active and 'urgent' = any (t.duties)
      and (t.store_id is null or p_store_id is null or t.store_id = p_store_id);
  end if;

  return query
    select m.profile_id, bool_or(m.is_lead)
    from public.staff_team_members m
    join public.profiles p on p.id = m.profile_id
    where (p.role = 'admin' or (p.role = 'manager' and p.permissions ->> 'manage_orders' = 'true'))
      and (
        (not p_escalate and m.team_id = any (coalesce(v_teams, '{}')))
        or (p_escalate and (
          m.team_id = any (coalesce(v_urgent, '{}'))
          or (m.is_lead and m.team_id = any (coalesce(v_teams, '{}')))
        ))
      )
    group by m.profile_id;
  if found then return; end if;

  -- Ninguém configurado: a escalada vai para os administradores; o resto, para quem gere encomendas.
  return query
    select p.id, p.role = 'admin'
    from public.profiles p
    where p.role = 'admin'
      or (not p_escalate and p.role = 'manager' and p.permissions ->> 'manage_orders' = 'true');
end;
$$;
revoke all on function public.ops_recipients(text, text, boolean) from public, anon, authenticated;
grant execute on function public.ops_recipients(text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Avisos à equipa: gravidade e envio por outros canais
-- ---------------------------------------------------------------------------
alter table public.staff_notifications
  add column if not exists severity text not null default 'normal',
  add column if not exists dispatched_at timestamptz,
  add column if not exists channels jsonb not null default '{}'::jsonb;
alter table public.staff_notifications add constraint staff_notifications_severity_check
  check (severity in ('normal', 'high', 'critical'));
alter table public.staff_notifications drop constraint if exists staff_notifications_kind_check;
alter table public.staff_notifications add constraint staff_notifications_kind_check
  check (kind = any (array[
    'new_order', 'support', 'order_stuck', 'order_problem', 'order_confirmed',
    'order_overdue', 'order_unacknowledged', 'ticket_sla', 'escalation', 'ops_test'
  ]));
-- Os avisos que já existem não saem agora por email nem WhatsApp.
update public.staff_notifications set dispatched_at = created_at where dispatched_at is null;
create index if not exists staff_notifications_dispatch_idx
  on public.staff_notifications (created_at) where dispatched_at is null;

-- Um aviso a cada destinatário de uma função (usado pelos gatilhos e pela passagem do chat).
create or replace function private.notify_staff(
  p_duty text, p_store_id text, p_kind text, p_title text, p_body text,
  p_order_id text default null, p_thread_id uuid default null, p_severity text default 'normal',
  p_escalate boolean default false, p_only uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_staff record;
begin
  for v_staff in
    select r.profile_id from public.ops_recipients(p_duty, p_store_id, p_escalate) r
    where p_only is null or r.profile_id = p_only
  loop
    insert into public.staff_notifications (staff_id, kind, title, body, order_id, thread_id, severity)
    values (v_staff.profile_id, p_kind, left(p_title, 120), left(coalesce(nullif(btrim(p_body), ''), '—'), 500),
      p_order_id, p_thread_id, p_severity);
    v_count := v_count + 1;
  end loop;
  -- Um responsável fora das equipas da função (atribuído à mão) também é avisado.
  if p_only is not null and v_count = 0 and exists (select 1 from public.profiles p where p.id = p_only and p.role in ('admin', 'manager')) then
    insert into public.staff_notifications (staff_id, kind, title, body, order_id, thread_id, severity)
    values (p_only, p_kind, left(p_title, 120), left(coalesce(nullif(btrim(p_body), ''), '—'), 500), p_order_id, p_thread_id, p_severity);
    v_count := 1;
  end if;
  return v_count;
end;
$$;
revoke all on function private.notify_staff(text, text, text, text, text, text, uuid, text, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Encomendas: assumir
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles (id) on delete set null;
-- As que já existem não pedem para ser assumidas. Sem disparar os outros gatilhos (estado,
-- stock, avisos, data de actualização): é só esta coluna nova.
alter table public.orders disable trigger user;
update public.orders set acknowledged_at = coalesce(updated, created) where acknowledged_at is null;
alter table public.orders enable trigger user;
create index if not exists orders_unacknowledged_idx on public.orders (created) where acknowledged_at is null;

-- Mexer no estado, no pagamento ou na entrega é assumir (quem o faz já está a tratar dela).
create or replace function private.orders_implicit_acknowledge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.acknowledged_at is null and (
    new.status is distinct from old.status
    or new.payment_status is distinct from old.payment_status
    or new.delivery_status is distinct from old.delivery_status
  ) then
    new.acknowledged_at := now();
    if auth.uid() is not null and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')) then
      new.acknowledged_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.orders_implicit_acknowledge() from public, anon, authenticated;
create trigger orders_implicit_acknowledge
  before update of status, payment_status, delivery_status on public.orders
  for each row execute function private.orders_implicit_acknowledge();

create or replace function public.order_acknowledge(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_name text;
begin
  if auth.uid() is null or not private.has_permission('manage_orders') then
    raise exception 'Sem permissão para esta operação.';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Encomenda não encontrada.'; end if;
  if v_order.acknowledged_at is not null then
    select coalesce(nullif(btrim(p.name), ''), p.email) into v_name from public.profiles p where p.id = v_order.acknowledged_by;
    return jsonb_build_object('acknowledged_at', v_order.acknowledged_at, 'acknowledged_by', v_order.acknowledged_by,
      'by_name', coalesce(v_name, ''), 'already', true);
  end if;
  select coalesce(nullif(btrim(p.name), ''), p.email) into v_name from public.profiles p where p.id = auth.uid();
  update public.orders
  set acknowledged_at = now(),
      acknowledged_by = auth.uid(),
      delivery_timeline = coalesce(delivery_timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        -- Sem o nome de quem assumiu: a linha do tempo aparece ao cliente no rastreio.
        'status', 'acknowledged', 'title', 'Recebida pela equipa',
        'description', 'A sua encomenda está a ser tratada.', 'location', '', 'at', now()))
  where id = p_order_id;
  -- Os avisos de "nova encomenda" desta encomenda deixam de estar por ler para toda a equipa.
  update public.staff_notifications set read_at = coalesce(read_at, now())
  where order_id = p_order_id and kind in ('new_order', 'order_unacknowledged');
  update public.order_alerts set resolved_at = now()
  where order_id = p_order_id and kind = 'new_unacknowledged' and resolved_at is null;
  return jsonb_build_object('acknowledged_at', now(), 'acknowledged_by', auth.uid(), 'by_name', coalesce(v_name, ''), 'already', false);
end;
$$;
revoke all on function public.order_acknowledge(text) from public, anon;
grant execute on function public.order_acknowledge(text) to authenticated;

-- Alertas da vigilância: quem está a tratar e quando subiu de nível.
alter table public.order_alerts
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles (id) on delete set null,
  add column if not exists escalated_at timestamptz;

create or replace function public.order_alert_acknowledge(p_order_id text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission('manage_orders') then
    raise exception 'Sem permissão para esta operação.';
  end if;
  update public.order_alerts
  set acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by = coalesce(acknowledged_by, auth.uid())
  where order_id = p_order_id and kind = p_kind and resolved_at is null;
  if not found then raise exception 'Alerta não encontrado ou já resolvido.'; end if;
  update public.staff_notifications set read_at = coalesce(read_at, now())
  where order_id = p_order_id and kind in ('order_stuck', 'order_overdue', 'order_unacknowledged', 'escalation', 'order_problem')
    and read_at is null;
end;
$$;
revoke all on function public.order_alert_acknowledge(text, text) from public, anon;
grant execute on function public.order_alert_acknowledge(text, text) to authenticated;

-- Encomenda nova: avisa quem recebe encomendas (a equipa da loja, nos levantamentos).
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
      v_where || ' · ' || coalesce(nullif(new.customer_name, ''), 'Cliente') || ' · ' ||
        -- Milhares com espaço, sem depender da configuração regional do servidor.
        regexp_replace(round(coalesce(new.total, 0))::bigint::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g') || ' Kz',
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
      when 'paid' then 'confirmado'
      when 'failed' then 'não confirmado'
      when 'refunded' then 'devolvido'
      else coalesce(nullif(new.payment_status, ''), 'pendente') end;
    insert into public.customer_notifications (customer_id, kind, title, body, href, order_id)
    values (new.customer_id, 'payment',
      case when new.payment_status = 'paid' then 'Pagamento confirmado' else 'Pagamento: ' || v_label end,
      'O pagamento da encomenda ' || v_number || ' está agora: ' || v_label || '.',
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
-- 5. Pedidos de ajuda: equipa, prazos (SLA) e registo de alterações
-- ---------------------------------------------------------------------------
alter table public.support_threads
  add column if not exists team_id uuid references public.staff_teams (id) on delete set null,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolution_due_at timestamptz,
  add column if not exists sla_alert_level smallint not null default 0;
alter table public.support_threads add constraint support_threads_sla_alert_level_check
  check (sla_alert_level between 0 and 2);
create index if not exists support_threads_team_idx on public.support_threads (team_id) where team_id is not null;
create index if not exists support_threads_sla_idx on public.support_threads (resolution_due_at)
  where status in ('open', 'pending');

-- Prazos por prioridade, em horas: primeira resposta / resolução.
create or replace function private.support_sla_hours(p_priority text, p_kind text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'first_response' then case p_priority when 'urgent' then 1 when 'high' then 4 when 'low' then 48 else 24 end
    else case p_priority when 'urgent' then 8 when 'high' then 24 when 'low' then 168 else 72 end
  end;
$$;
revoke all on function private.support_sla_hours(text, text) from public, anon, authenticated;

-- Prazos calculados pela base de dados quando a conversa passa a pedido ou muda de prioridade.
create or replace function private.support_threads_sla()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  if new.ticket_number is null then return new; end if;
  if tg_op = 'INSERT' or old.ticket_number is null or new.priority is distinct from old.priority
     or new.first_response_due_at is null then
    v_start := coalesce(new.escalated_at, new.created_at, now());
    new.first_response_due_at := v_start + make_interval(hours => private.support_sla_hours(new.priority, 'first_response'));
    new.resolution_due_at := v_start + make_interval(hours => private.support_sla_hours(new.priority, 'resolution'));
    if tg_op = 'UPDATE' and new.priority is distinct from old.priority then new.sla_alert_level := 0; end if;
  end if;
  -- Reaberto depois de resolvido: novo prazo de resolução a contar de agora.
  if tg_op = 'UPDATE' and old.status = 'closed' and new.status in ('open', 'pending') then
    new.resolution_due_at := now() + make_interval(hours => private.support_sla_hours(new.priority, 'resolution'));
    new.sla_alert_level := least(new.sla_alert_level, 1);
  end if;
  return new;
end;
$$;
revoke all on function private.support_threads_sla() from public, anon, authenticated;
create trigger support_threads_sla
  before insert or update on public.support_threads
  for each row execute function private.support_threads_sla();
-- Pedidos que já existam ganham prazos.
update public.support_threads set first_response_due_at = null where ticket_number is not null;

-- Registo de quem mudou o quê num pedido (estado, responsável, prioridade, categoria, equipa).
create table public.support_ticket_events (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  field text not null check (field in ('status', 'assigned_to', 'priority', 'category', 'team_id')),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index support_ticket_events_thread_idx on public.support_ticket_events (thread_id, created_at);
alter table public.support_ticket_events enable row level security;
revoke all on public.support_ticket_events from public, anon, authenticated;
grant select on public.support_ticket_events to authenticated;
create policy "support_ticket_events: atendimento lê" on public.support_ticket_events for select to authenticated
  using ((select private.has_permission('manage_orders')));

create or replace function private.support_threads_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := case when exists (select 1 from public.profiles p where p.id = auth.uid()) then auth.uid() end;
begin
  if new.status is distinct from old.status then
    insert into public.support_ticket_events (thread_id, actor_id, field, old_value, new_value) values (new.id, v_actor, 'status', old.status, new.status);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.support_ticket_events (thread_id, actor_id, field, old_value, new_value) values (new.id, v_actor, 'assigned_to', old.assigned_to::text, new.assigned_to::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.support_ticket_events (thread_id, actor_id, field, old_value, new_value) values (new.id, v_actor, 'priority', old.priority, new.priority);
  end if;
  if new.category is distinct from old.category then
    insert into public.support_ticket_events (thread_id, actor_id, field, old_value, new_value) values (new.id, v_actor, 'category', old.category, new.category);
  end if;
  if new.team_id is distinct from old.team_id then
    insert into public.support_ticket_events (thread_id, actor_id, field, old_value, new_value) values (new.id, v_actor, 'team_id', old.team_id::text, new.team_id::text);
  end if;
  return new;
end;
$$;
revoke all on function private.support_threads_audit() from public, anon, authenticated;
create trigger support_threads_audit
  after update on public.support_threads
  for each row execute function private.support_threads_audit();

-- Abuso: no máximo 5 pedidos em aberto por cliente (pelo formulário e pelo chat).
create or replace function private.support_open_ticket_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ticket_number is not null and new.customer_id is not null
     and new.status in ('open', 'pending')
     and (tg_op = 'INSERT' or old.ticket_number is null)
     and not exists (
       select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')
     )
     and (
       select count(*) from public.support_threads t
       where t.customer_id = new.customer_id and t.status in ('open', 'pending')
         and t.ticket_number is not null and t.id <> new.id
     ) >= 5 then
    raise exception 'Já tem 5 pedidos de ajuda em aberto. Responda num deles ou aguarde que a equipa os resolva.';
  end if;
  return new;
end;
$$;
revoke all on function private.support_open_ticket_limit() from public, anon, authenticated;
create trigger support_open_ticket_limit
  before insert or update of ticket_number on public.support_threads
  for each row execute function private.support_open_ticket_limit();

-- Equipa de atendimento de uma conversa: a escolhida, senão a da loja da encomenda.
create or replace function private.thread_store_id(p_order_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.order_store_id(o.shipping_method, o.pickup_store) from public.orders o where o.id = p_order_id;
$$;
revoke all on function private.thread_store_id(text) from public, anon, authenticated;

-- Mensagens: os avisos à equipa passam a ir para a equipa de atendimento (ou o responsável).
create or replace function private.notify_support_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads;
  v_label text;
begin
  select * into v_thread from public.support_threads where id = new.thread_id for update;
  if not found then return new; end if;

  if new.author_kind = 'note' then
    update public.support_threads set updated_at = new.created_at where id = new.thread_id;
    return new;
  end if;

  if new.author_kind in ('assistant', 'system') then
    update public.support_threads
    set last_message_at = new.created_at, last_sender_id = null, updated_at = new.created_at
    where id = new.thread_id;
    return new;
  end if;

  v_label := case when v_thread.ticket_number is not null then '#' || v_thread.ticket_number || ' · ' else '' end
    || v_thread.subject;

  if new.author_kind = 'customer' then
    update public.support_threads
    set last_message_at = new.created_at,
        last_sender_id = new.sender_id,
        updated_at = new.created_at,
        status = case when status in ('bot', 'closed') then status else 'open' end
    where id = new.thread_id;

    if v_thread.status in ('open', 'pending') then
      perform private.notify_staff(
        'support', private.thread_store_id(v_thread.order_id), 'support', 'Nova mensagem de cliente', v_label,
        v_thread.order_id, v_thread.id,
        case when v_thread.priority in ('high', 'urgent') then 'high' else 'normal' end,
        false, v_thread.assigned_to
      );
    end if;
    return new;
  end if;

  update public.support_threads
  set last_message_at = new.created_at,
      last_sender_id = new.sender_id,
      updated_at = new.created_at,
      status = case when status in ('bot', 'open') then 'pending' else status end,
      ticket_number = coalesce(ticket_number, nextval('public.support_ticket_number_seq')),
      escalated_at = coalesce(escalated_at, new.created_at),
      first_response_at = coalesce(first_response_at, new.created_at),
      assigned_to = coalesce(assigned_to, new.sender_id)
  where id = new.thread_id
  returning * into v_thread;

  if v_thread.customer_id is not null then
    insert into public.customer_notifications (customer_id, kind, title, body, href, thread_id, order_id)
    values (
      v_thread.customer_id, 'support', 'Resposta da equipa',
      left('#' || v_thread.ticket_number || ' · ' || v_thread.subject, 500),
      '/?atendimento=1', v_thread.id, v_thread.order_id
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.notify_support_message() from public, anon, authenticated;

-- Passagem do chat para a equipa: igual, mas avisa a equipa de atendimento (e não toda a gente).
create or replace function public.assistant_escalate(
  p_thread_id uuid,
  p_customer_id uuid,
  p_subject text,
  p_category text,
  p_priority text,
  p_summary text,
  p_order_id text default null,
  p_details text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_thread public.support_threads;
  v_number bigint;
  v_order text;
begin
  select * into v_thread from public.support_threads where id = p_thread_id for update;
  if not found or v_thread.channel <> 'assistant' then
    raise exception 'Conversa não encontrada.';
  end if;
  if p_customer_id is null or v_thread.customer_id is distinct from p_customer_id then
    raise exception 'Esta conversa não pertence à sua conta.';
  end if;
  if v_thread.status <> 'bot' then
    raise exception 'Esta conversa já está com a equipa.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 1 and 160 then
    raise exception 'Assunto inválido.';
  end if;
  if p_category is null or p_category not in ('order', 'payment', 'delivery', 'return', 'product', 'account', 'other') then
    raise exception 'Categoria inválida.';
  end if;
  if p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridade inválida.';
  end if;
  if p_order_id is not null and not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and (
        o.customer_id = p_customer_id
        or lower(o.customer_email) = (select lower(u.email) from auth.users u where u.id = p_customer_id)
      )
  ) then
    raise exception 'A encomenda indicada não pertence à sua conta.';
  end if;
  if (
    select count(*) from public.support_threads t
    where t.customer_id = p_customer_id and t.status in ('open', 'pending') and t.ticket_number is not null
  ) >= 5 then
    raise exception 'Já tem 5 pedidos de ajuda em aberto. Responda num deles ou aguarde que a equipa os resolva.';
  end if;

  if char_length(btrim(coalesce(p_details, ''))) > 0 then
    insert into public.support_messages (thread_id, sender_id, author_kind, body)
    values (p_thread_id, p_customer_id, 'customer', left(btrim(p_details), 4000));
  end if;

  v_order := coalesce(p_order_id, v_thread.order_id);
  v_number := nextval('public.support_ticket_number_seq');
  update public.support_threads
  set status = 'open',
      ticket_number = v_number,
      escalated_at = now(),
      subject = left(btrim(p_subject), 160),
      category = p_category,
      priority = p_priority,
      ai_summary = left(p_summary, 4000),
      order_id = v_order,
      team_id = coalesce(team_id, (
        select r.team_id from (
          select t.id as team_id from public.staff_teams t
          where t.active and 'support' = any (t.duties)
          order by (t.store_id is not distinct from private.thread_store_id(v_order)) desc, t.store_id nulls first, t.created_at
          limit 1
        ) r
      )),
      updated_at = now()
  where id = p_thread_id;

  insert into public.support_messages (thread_id, sender_id, author_kind, body)
  values (
    p_thread_id, null, 'system',
    'Pedido de ajuda #' || v_number || ' aberto. A nossa equipa vai continuar esta conversa aqui, '
      || 'com tudo o que já escreveu. Recebe um aviso quando respondermos.'
  );

  perform private.notify_staff(
    'support', private.thread_store_id(v_order), 'support',
    case when p_priority in ('high', 'urgent') then 'Pedido de ajuda urgente #' else 'Novo pedido de ajuda #' end || v_number,
    left(btrim(p_subject), 500), v_order, p_thread_id,
    case when p_priority = 'urgent' then 'critical' when p_priority = 'high' then 'high' else 'normal' end
  );
  return v_number;
end;
$$;
revoke all on function public.assistant_escalate(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.assistant_escalate(uuid, uuid, text, text, text, text, text, text) to service_role;

-- A equipa escolhe também a equipa do pedido.
create or replace function public.support_set_team(p_thread_id uuid, p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission('manage_orders') then
    raise exception 'Sem permissão para esta operação.';
  end if;
  if p_team_id is not null and not exists (select 1 from public.staff_teams t where t.id = p_team_id and t.active) then
    raise exception 'Equipa não encontrada.';
  end if;
  update public.support_threads set team_id = p_team_id, updated_at = now() where id = p_thread_id;
  if not found then raise exception 'Conversa não encontrada.'; end if;
end;
$$;
revoke all on function public.support_set_team(uuid, uuid) from public, anon;
grant execute on function public.support_set_team(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Agendamentos
-- ---------------------------------------------------------------------------
-- Envio dos avisos à equipa por email/WhatsApp/push, de 2 em 2 minutos, só se houver algum.
create or replace function private.run_staff_dispatch()
returns void
language plpgsql
security definer
set search_path = net, extensions
as $$
declare
  v_queue_url text;
  v_token text;
begin
  if not exists (
    select 1 from public.staff_notifications
    where dispatched_at is null and created_at > now() - interval '2 days'
  ) then
    return;
  end if;
  select decrypted_secret into v_queue_url from vault.decrypted_secrets where name = 'email_queue_url' limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'email_queue_token' limit 1;
  if v_queue_url is null or v_token is null then
    raise notice 'Avisos à equipa: faltam os segredos email_queue_url/email_queue_token no Vault.';
    return;
  end if;
  perform http_post(
    url := regexp_replace(v_queue_url, '(/functions/v1/app).*$', '\1') || '/cron/staff-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-queue-token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke execute on function private.run_staff_dispatch() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('avisos-equipa');
exception when others then null;
end
$$;
do $$
begin
  perform cron.unschedule('vigilancia-encomendas');
exception when others then null;
end
$$;

do $$
begin
  perform cron.schedule('avisos-equipa', '*/2 * * * *', 'select private.run_staff_dispatch();');
  -- A vigilância passa de hora a hora para 10 em 10 minutos: uma encomenda nova por assumir
  -- tem de subir de nível em minutos, não numa hora.
  perform cron.schedule('vigilancia-encomendas', '*/10 * * * *', 'select private.run_order_watch(false);');
exception when others then
  raise notice 'Não foi possível agendar os avisos à equipa (%): ficam só no painel.', sqlerrm;
end
$$;
